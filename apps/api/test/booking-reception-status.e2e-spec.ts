import request from 'supertest';
import { vi } from 'vitest';
import type { TrangThaiLichHen } from './../src/admin/entities/enums.js';
import {
  PAYMENT_SUMMARY_PORT,
  type PaymentSummaryPort,
} from './../src/appointments/ports/payment.port.js';
import {
  REFUND_PORT,
  type RefundPort,
} from './../src/appointments/ports/wallet.port.js';
import { BookingFixtures } from './../src/appointments/testing/booking-fixtures.js';
import {
  DEPOSIT,
  HALF_REFUND,
  HOUR_MS,
  REFUND_POLICY,
  SLOT0_TIME,
} from './../src/appointments/testing/cancel-world.js';
import { readAppointment } from './../src/appointments/testing/expiry-fixtures.js';
import { assertBookingInvariants } from './../src/appointments/testing/invariants.js';
import { resetBookingRound } from './../src/appointments/testing/payment-doctor-fakes.js';
import {
  AFTER_ALL_WINDOWS,
  ALL_STATES,
  IN_WINDOW,
  readNoShow,
  statusWorld,
  WINDOW_END,
  WINDOW_START,
  type StatusWorld,
} from './../src/appointments/testing/status-world.js';
import { T0 } from './../src/auth/testing/otp-int-helpers.js';
import {
  openRefreshHarness,
  type RefreshHarness,
} from './../src/auth/testing/refresh-http-helpers.js';
import { expectErrorResponse } from './../src/common/testing/error-assertions.js';
import { resetTables } from './../src/database/testing/test-database.js';

// Task B12 — POST /reception/appointments/:maLichHen/status qua HTTP THẬT: AppModule + MySQL thật + configureApp như main.ts (PLAN booking 5.7, 5.9, 7.5 CT-01…CT-10, CT-22, MT-03; 7.3 HL-15; 7.9 QB-02, QB-03, QB-08, QB-09, QB-10; 7.32 RTS-07…RTS-12;
// TRACKING 3.26 B12-E, B12-H). Phần dịch vụ và SQL: src/appointments/status/reception-status.int-spec.ts; phần đồng thời: src/appointments/state/status.concurrency.int-spec.ts. Hai cổng `payment` và `wallet` là bản `Noop` của app thật: với `Noop`
// số còn phải thu = `gia_snapshot` nên ca cần "đủ tiền" đặt `gia_snapshot` = 0.00 bằng SQL, ca cần cọc đã thu dùng `vi.spyOn` trên CHÍNH thể hiện của app (như HBN-04). Mã RTS-nn là `[đề xuất]` (7.32). QB-nn chỉ phần route của B12 (chưa tính Pass).
// CA QB-02 và CT-22 (nửa Lễ tân) khẳng định ĐÚNG 403 KHONG_DU_QUYEN ở trạng thái mà dịch vụ sẽ trả mã KHÁC nếu thiếu `@Roles` (lịch ngoài chi nhánh ⇒ 404, lịch DaTiepDon ⇒ 409, thân sai ⇒ 400), kể cả mã sai dạng (bài học ĐA-9b).
// ĐỒNG HỒ: `vi.setSystemTime` đổi giờ của CẢ token truy cập, nên ca đổi giờ tạo token SAU khi đặt giờ (và đi tiếp chỉ vài phút, trong hạn 15 phút của token).
const BASE = '/reception/appointments';
const NOT_LOGGED_IN = 'CHUA_DANG_NHAP';
const INVALID_TOKEN = 'TOKEN_KHONG_HOP_LE';
const SESSION_INACTIVE = 'PHIEN_HET_HIEU_LUC';
const FORBIDDEN = 'KHONG_DU_QUYEN';
const INVALID_DATA = 'DU_LIEU_KHONG_HOP_LE';
const NOT_ALLOWED = 'TRUONG_KHONG_DUOC_PHEP';
const REASON_REQUIRED = 'LY_DO_BAT_BUOC';
const NOT_CANCELLABLE = 'LICH_HEN_KHONG_CHO_HUY';
const INVALID_TRANSITION = 'CHUYEN_TRANG_THAI_KHONG_HOP_LE';
// Thân 404 chung (patient Q27): giống từng ký tự ở mọi nhánh, kể cả mã sai dạng bị pipe từ chối
const NOT_FOUND_TEXT =
  '{"maLoi":"KHONG_TIM_THAY","thongBao":"Không tìm thấy dữ liệu."}';

// Mã mẫu đúng dạng Q13 (năm ký tự Crockford, KHÔNG có I, L, O, U)
const CODE = 'CLX-20261110-CCC01';
const CODE_2 = 'CLX-20261110-CCC02';
const MISSING = 'CLX-20261110-ZZZZZ';
const MALFORMED = [
  'sai-dang',
  'CLX-20261110-CCC0I', // có chữ I (không thuộc bảng Crockford của mã)
  `${CODE}-THUA`,
  'CLX-2026111-CCC01',
];
const SLOW = 300_000;

let h: RefreshHarness;
let fx: BookingFixtures;

beforeAll(async () => {
  h = await openRefreshHarness();
  fx = new BookingFixtures(h.db);
});

beforeEach(async () => {
  await resetTables(h.db);
  h.mail.reset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await resetTables(h.db);
  await h.close();
});

const tokenOf = async (accountId: string) =>
  (await h.sessions.create(accountId)).accessToken;
// `code` là phần SAU `/reception/appointments/` và được viết thẳng (đã mã hoá phần trăm nếu cần), để thử cả dạng supertest không tự dựng được
const change = (code: string, accessToken?: string, body: unknown = {}) => {
  const req = request(h.app.getHttpServer())
    .post(`${BASE}/${code}/status`)
    .send(body as object);
  return accessToken ? req.set('Authorization', `Bearer ${accessToken}`) : req;
};
const detail = (code: string, accessToken: string) =>
  request(h.app.getHttpServer())
    .get(`${BASE}/${code}`)
    .set('Authorization', `Bearer ${accessToken}`);
const bodyOf = (res: { body: unknown }) => res.body as Record<string, unknown>;

/** Thế giới Lễ tân (một chi nhánh kèm Lễ tân, chi nhánh thứ hai kèm Lễ tân riêng, Bệnh nhân A kèm hồ sơ người thân, 8 khung giờ ngày 10/11) và token của hai Lễ tân. */
async function world() {
  const w = await statusWorld(h.db, fx);
  return {
    ...w,
    token: await tokenOf(w.receptionId),
    otherToken: await tokenOf(w.otherReceptionId),
  };
}

/** Lịch mã `CODE` ở khung giờ số `slot`; `price` đặt `gia_snapshot` (với cổng `Noop` số còn phải thu = giá này: 0.00 là "đã thu đủ"). */
async function book(
  w: StatusWorld,
  trangThai: TrangThaiLichHen,
  options: { code?: string; price?: string; slot?: number } = {},
) {
  const lich = await w.booked(trangThai, options.slot ?? 0, {
    maLichHen: options.code ?? CODE,
  });
  if (options.price !== undefined)
    await h.db.query(
      'UPDATE lich_hen SET gia_snapshot = ? WHERE lich_hen_id = ?',
      [options.price, lich.lichHenId],
    );
  return lich;
}

describe('POST …/status — thành công và hình dạng kết quả', () => {
  it('CT-01, HL-15 (phần Lễ tân) Lễ tân huỷ lịch DaXacNhan đã thu cọc, còn 23 giờ (mốc 2 giờ ⇒ 50%, theo bậc cùng thời điểm, Q17): 200 đúng BA khoá { maLichHen, trangThai: DaHuy, hoanCoc }; refund đúng MỘT lần; DB: ly_do_huy đã cắt khoảng trắng; khung giờ ConTrong; no-store; INV', async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0, {
      maLichHen: CODE,
      coc: DEPOSIT,
      policy: REFUND_POLICY,
    });
    const payments = h.app.get<PaymentSummaryPort>(PAYMENT_SUMMARY_PORT, {
      strict: false,
    });
    const refunds = h.app.get<RefundPort>(REFUND_PORT, { strict: false });
    vi.spyOn(payments, 'amountPaid').mockResolvedValue(DEPOSIT);
    const refund = vi
      .spyOn(refunds, 'refund')
      .mockResolvedValue({ kind: 'Refunded' });
    // đặt giờ TRƯỚC khi tạo token (token mang giờ của đồng hồ giả)
    vi.setSystemTime(new Date(SLOT0_TIME.getTime() - 23 * HOUR_MS));
    const token = await tokenOf(w.receptionId);

    const res = await change(CODE, token, {
      trangThai: 'DaHuy',
      lyDo: '  Bệnh nhân gọi điện xin huỷ  ',
    });

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toStrictEqual({
      maLichHen: CODE,
      trangThai: 'DaHuy',
      hoanCoc: HALF_REFUND,
    });
    expect(refund).toHaveBeenCalledTimes(1);
    expect(await readAppointment(h.db, lich.lichHenId)).toMatchObject({
      trangThai: 'DaHuy',
      lyDo: 'Bệnh nhân gọi điện xin huỷ',
    });
    await w.expectSlot(0, 'ConTrong');
    await assertBookingInvariants(h.db);
  });

  it('CT-02 lịch ChoThanhToan: huỷ được (hoanCoc null), khung giờ về ConTrong', async () => {
    const w = await world();
    await book(w, 'ChoThanhToan');
    const res = await change(CODE, w.token, {
      trangThai: 'DaHuy',
      lyDo: 'Đổi ý',
    });
    expect(res.status).toBe(200);
    expect(bodyOf(res)).toMatchObject({ trangThai: 'DaHuy', hoanCoc: null });
    await w.expectSlot(0, 'ConTrong');
    await assertBookingInvariants(h.db);
  });

  it('CT-03, RTS-04 Vắng mặt sau hết cửa sổ: 200 đúng HAI khoá { maLichHen, trangThai: VangMat } (không lộ số lần no-show hay cờ khoá); so_lan_no_show +1; khung giờ giữ DaDat; no-store', async () => {
    const w = await world();
    const lich = await book(w, 'DaXacNhan');
    vi.setSystemTime(AFTER_ALL_WINDOWS);
    const token = await tokenOf(w.receptionId);
    const res = await change(CODE, token, { trangThai: 'VangMat' });
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toStrictEqual({ maLichHen: CODE, trangThai: 'VangMat' });
    expect((await readAppointment(h.db, lich.lichHenId)).trangThai).toBe(
      'VangMat',
    );
    expect(await readNoShow(h.db, w.patientId)).toEqual({
      soLan: 1,
      khoa: false,
    });
    await w.expectSlot(0, 'DaDat');
    await assertBookingInvariants(h.db);
  });

  it('CT-05, RTS-04 tiếp đón trong cửa sổ khi đã thu đủ (gia_snapshot 0.00 với cổng Noop): 200 đúng HAI khoá { maLichHen, trangThai: DaTiepDon }; khung giờ giữ DaDat', async () => {
    const w = await world();
    const lich = await book(w, 'DaXacNhan', { price: '0.00' });
    vi.setSystemTime(IN_WINDOW);
    const token = await tokenOf(w.receptionId);
    const res = await change(CODE, token, { trangThai: 'DaTiepDon' });
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({ maLichHen: CODE, trangThai: 'DaTiepDon' });
    expect((await readAppointment(h.db, lich.lichHenId)).trangThai).toBe(
      'DaTiepDon',
    );
    await w.expectSlot(0, 'DaDat');
    await assertBookingInvariants(h.db);
  });
});

describe('POST …/status — lỗi nghiệp vụ và mã lỗi', () => {
  it('CT-06 còn phải thu (cổng Noop trả gia_snapshot): 409 CON_PHAN_CHUA_THANH_TOAN kèm chiTiet.conPhaiThu; không đổi gì', async () => {
    const w = await world();
    const lich = await book(w, 'DaXacNhan', { price: '150000.00' });
    vi.setSystemTime(IN_WINDOW);
    const token = await tokenOf(w.receptionId);
    const before = await w.snapshot(lich, 0);
    const res = await change(CODE, token, { trangThai: 'DaTiepDon' });
    const body = expectErrorResponse(res, 409, 'CON_PHAN_CHUA_THANH_TOAN');
    expect(body.chiTiet).toStrictEqual({ conPhaiThu: '150000.00' });
    expect(await w.snapshot(lich, 0)).toEqual(before);
  });

  it('CT-07 ngoài cửa sổ: 409 NGOAI_KHUNG_GIO_TIEP_DON kèm chiTiet { tu, den } là ISO UTC của hai đầu; hai biên (đúng đầu, đúng cuối) được', async () => {
    const w = await world();
    for (const [at, allowed] of [
      [new Date(WINDOW_START.getTime() - 1000), false],
      [WINDOW_START, true],
      [WINDOW_END, true],
      [new Date(WINDOW_END.getTime() + 1000), false],
    ] as const) {
      await resetBookingRound(h.db);
      const lich = await book(w, 'DaXacNhan', { price: '0.00' });
      vi.setSystemTime(at);
      const token = await tokenOf(w.receptionId);
      const before = await w.snapshot(lich, 0);
      const res = await change(CODE, token, { trangThai: 'DaTiepDon' });
      if (allowed) {
        expect(res.status, at.toISOString()).toBe(200);
        continue;
      }
      const body = expectErrorResponse(res, 409, 'NGOAI_KHUNG_GIO_TIEP_DON');
      expect(body.chiTiet).toStrictEqual({
        tu: WINDOW_START.toISOString(),
        den: WINDOW_END.toISOString(),
      });
      expect(await w.snapshot(lich, 0)).toEqual(before);
    }
  });

  it('CT-04 Vắng mặt trước hay trong cửa sổ, và đúng mốc thoi_gian + 15 phút ⇒ 409 CHUA_QUA_GIO_HEN; +1 giây ⇒ 200', async () => {
    const w = await world();
    const lich = await book(w, 'DaXacNhan');
    const before = await w.snapshot(lich, 0);
    for (const at of [IN_WINDOW, WINDOW_END]) {
      vi.setSystemTime(at);
      const token = await tokenOf(w.receptionId);
      expectErrorResponse(
        await change(CODE, token, { trangThai: 'VangMat' }),
        409,
        'CHUA_QUA_GIO_HEN',
      );
      expect(await w.snapshot(lich, 0)).toEqual(before);
    }
    vi.setSystemTime(new Date(WINDOW_END.getTime() + 1000));
    const token = await tokenOf(w.receptionId);
    expect((await change(CODE, token, { trangThai: 'VangMat' })).status).toBe(
      200,
    );
  });

  it('CT-08, MT-03 chuyển không hợp lệ qua HTTP: HoanThanh ⇒ 409 CHI_BAC_SI_HOAN_THANH với MỌI nguồn; đích DaHuy bị từ chối ⇒ 409 LICH_HEN_KHONG_CHO_HUY kèm trangThai; đích khác bị từ chối ⇒ 409 CHUYEN_TRANG_THAI_KHONG_HOP_LE kèm cặp (nguồn, đích); không đổi gì', async () => {
    const w = await world();
    for (const from of ALL_STATES) {
      await resetBookingRound(h.db);
      const lich = await book(w, from);
      const before = await w.snapshot(lich, 0);
      const doctorOnly = await change(CODE, w.token, {
        trangThai: 'HoanThanh',
      });
      expectErrorResponse(doctorOnly, 409, 'CHI_BAC_SI_HOAN_THANH');
      expect(doctorOnly.body).not.toHaveProperty('chiTiet');
      if (from !== 'DaXacNhan' && from !== 'ChoThanhToan') {
        const toCancel = await change(CODE, w.token, {
          trangThai: 'DaHuy',
          lyDo: 'Thử huỷ',
        });
        expect(
          expectErrorResponse(toCancel, 409, NOT_CANCELLABLE).chiTiet,
        ).toStrictEqual({ trangThai: from });
      }
      for (const to of ['ChoThanhToan', 'DaDoiLich'] as const) {
        const res = await change(CODE, w.token, { trangThai: to });
        expect(
          expectErrorResponse(res, 409, INVALID_TRANSITION).chiTiet,
          `${from} sang ${to}`,
        ).toStrictEqual({ tuTrangThai: from, denTrangThai: to });
      }
      expect(await w.snapshot(lich, 0), from).toEqual(before);
    }
  });

  it('CT-10 thiếu cau_hinh_he_thong: DaTiepDon và VangMat ⇒ 409 HE_THONG_CHUA_CAU_HINH (không đổi gì); DaHuy vẫn 200', async () => {
    const w = await world();
    const lich = await book(w, 'DaXacNhan', { price: '0.00' });
    await h.db.query('DELETE FROM cau_hinh_he_thong');
    const before = await w.snapshot(lich, 0);
    for (const to of ['DaTiepDon', 'VangMat'] as const)
      expectErrorResponse(
        await change(CODE, w.token, { trangThai: to }),
        409,
        'HE_THONG_CHUA_CAU_HINH',
      );
    expect(await w.snapshot(lich, 0)).toEqual(before);
    expect(
      (await change(CODE, w.token, { trangThai: 'DaHuy', lyDo: 'Vẫn huỷ' }))
        .status,
    ).toBe(200);
  });

  it('CT-09, RTS-12 lịch ở chi nhánh khác, không tồn tại và mã sai dạng: CÙNG MỘT 404 từng ký tự với MỌI đích (kể cả HoanThanh); không đổi gì', async () => {
    const w = await world();
    const lich = await book(w, 'DaHuy');
    const before = await w.snapshot(lich, 0);
    for (const to of ALL_STATES)
      for (const code of [CODE, MISSING, ...MALFORMED]) {
        const token = code === CODE ? w.otherToken : w.token;
        const res = await change(code, token, {
          trangThai: to,
          lyDo: 'Lý do',
        });
        expect(res.status, `${to} ${code}`).toBe(404);
        expect(res.text, `${to} ${code}`).toBe(NOT_FOUND_TEXT);
      }
    expect(await w.snapshot(lich, 0)).toEqual(before);
  });
});

describe('POST …/status — DTO (CT-02, RTS-08)', () => {
  it('CT-02 huỷ mà thiếu, rỗng, chỉ khoảng trắng, không phải chuỗi hay quá 255 ký tự ⇒ 400 DU_LIEU_KHONG_HOP_LE với loi[].ma = LY_DO_BAT_BUOC; lịch không đổi; 255 ký tự được', async () => {
    const w = await world();
    const lich = await book(w, 'DaXacNhan');
    const before = await w.snapshot(lich, 0);
    for (const bad of [
      { trangThai: 'DaHuy' },
      { trangThai: 'DaHuy', lyDo: '' },
      { trangThai: 'DaHuy', lyDo: '   ' },
      { trangThai: 'DaHuy', lyDo: 5 },
      { trangThai: 'DaHuy', lyDo: 'a'.repeat(256) },
    ]) {
      const body = expectErrorResponse(
        await change(CODE, w.token, bad),
        400,
        INVALID_DATA,
      );
      expect(body.loi, JSON.stringify(bad)).toStrictEqual([
        { truong: 'lyDo', ma: REASON_REQUIRED },
      ]);
    }
    expect(await w.snapshot(lich, 0)).toEqual(before);
    expect(
      (
        await change(CODE, w.token, {
          trangThai: 'DaHuy',
          lyDo: 'a'.repeat(255),
        })
      ).status,
    ).toBe(200);
  });

  it('trangThai thiếu hay ngoài bảy giá trị ⇒ 400 trangThai IS_IN; quyền không đổi', async () => {
    const w = await world();
    await book(w, 'DaXacNhan');
    for (const bad of [{}, { trangThai: 'HuyBo' }, { trangThai: 'vangmat' }]) {
      const body = expectErrorResponse(
        await change(CODE, w.token, bad),
        400,
        INVALID_DATA,
      );
      expect(body.loi).toStrictEqual([{ truong: 'trangThai', ma: 'IS_IN' }]);
    }
  });

  it('RTS-08 lyDo ở đích khác DaHuy bị BỎ QUA: Vắng mặt kèm lyDo vẫn 200 và ly_do_huy vẫn NULL (Q27: Vắng mặt không có lý do)', async () => {
    const w = await world();
    const lich = await book(w, 'DaXacNhan');
    vi.setSystemTime(AFTER_ALL_WINDOWS);
    const token = await tokenOf(w.receptionId);
    const res = await change(CODE, token, {
      trangThai: 'VangMat',
      lyDo: 'Chữ này không được lưu',
    });
    expect(res.status).toBe(200);
    expect(await readAppointment(h.db, lich.lichHenId)).toMatchObject({
      trangThai: 'VangMat',
      lyDo: null,
      huy: null,
    });
  });

  it('QB-03 thân có benhNhanId, chiNhanhId, maLichHen, hoanCoc hay lichHenId ⇒ 400 TRUONG_KHONG_DUOC_PHEP; chi nhánh chỉ từ DB, quyền và lịch không đổi', async () => {
    const w = await world();
    const lich = await book(w, 'DaXacNhan');
    const before = await w.snapshot(lich, 0);
    for (const extra of [
      'benhNhanId',
      'chiNhanhId',
      'maLichHen',
      'hoanCoc',
      'lichHenId',
    ]) {
      const res = await change(CODE, w.token, {
        trangThai: 'DaHuy',
        lyDo: 'x',
        [extra]: '1',
      });
      const body = expectErrorResponse(res, 400, INVALID_DATA);
      expect(body.loi).toStrictEqual([{ truong: extra, ma: NOT_ALLOWED }]);
    }
    expect(await w.snapshot(lich, 0)).toEqual(before);
  });
});

describe('POST …/status — vai trò, đăng nhập, mã và tiêu đề (QB-02, QB-08, QB-09, QB-10, CT-22 nửa Lễ tân)', () => {
  it('QB-02, CT-22 Lễ tân 200; Bệnh nhân, Bác sĩ, QTV Chi nhánh, QTV Toàn hệ thống ĐÚNG 403 KHONG_DU_QUYEN (ĐỎ khi bỏ @Roles: dịch vụ sẽ trả 404, 409 hay 400) với mã đúng, mã lịch DaTiepDon, mã không tồn tại, mã SAI DẠNG và thân sai; chưa đăng nhập 401; không đổi gì', async () => {
    const w = await world();
    const lich = await book(w, 'DaXacNhan');
    await book(w, 'DaTiepDon', { code: CODE_2, slot: 1 });
    const before = await w.snapshot(lich, 0);
    const wrongRoles = [
      ['Bệnh nhân', w.patientId],
      ['Bác sĩ', w.doctor.account.taiKhoanId],
      ['QTV Chi nhánh', w.branchAdmin.account.taiKhoanId],
      ['QTV Toàn hệ thống', w.systemAdmin.account.taiKhoanId],
    ] as const;
    for (const [role, accountId] of wrongRoles) {
      const token = await tokenOf(accountId);
      for (const code of [CODE, CODE_2, MISSING, 'sai-dang'])
        for (const body of [
          { trangThai: 'DaHuy', lyDo: 'x' },
          { trangThai: 'VangMat' },
          { trangThai: 'HoanThanh' },
          {},
          { benhNhanId: '1' },
        ]) {
          const res = await change(code, token, body);
          expect(res.status, `${role} ${code} ${JSON.stringify(body)}`).toBe(
            403,
          );
          expectErrorResponse(res, 403, FORBIDDEN);
        }
    }
    expect(await w.snapshot(lich, 0)).toEqual(before);
    for (const code of [CODE, 'sai-dang']) {
      expectErrorResponse(await change(code), 401, NOT_LOGGED_IN);
      expectErrorResponse(
        await change(code, 'khong.phai.jwt'),
        401,
        INVALID_TOKEN,
      );
    }
    expect(
      (await change(CODE, w.token, { trangThai: 'DaHuy', lyDo: 'Lễ tân huỷ' }))
        .status,
    ).toBe(200);
  });

  it('RTS-11, QB-08 Cache-Control: no-store ở 200, 400 do DTO, 404 do dịch vụ, 404 do pipe và 409 (401 và 403 do guard không hứa)', async () => {
    const w = await world();
    await book(w, 'DaTiepDon', { code: CODE_2, slot: 1 });
    await book(w, 'DaXacNhan');
    const responses = [
      await change(CODE_2, w.token, { trangThai: 'DaHuy', lyDo: 'x' }),
      await change(MISSING, w.token, { trangThai: 'DaHuy', lyDo: 'x' }),
      await change('sai-dang', w.token, { trangThai: 'DaHuy', lyDo: 'x' }),
      await change(CODE, w.token, { trangThai: 'DaHuy' }),
      await change(CODE, w.token, { trangThai: 'DaHuy', lyDo: 'x' }),
    ];
    expect(responses.map((res) => res.status)).toEqual([
      409, 404, 404, 400, 200,
    ]);
    for (const res of responses)
      expect(res.headers['cache-control']).toBe('no-store');
  });

  it('RTS-09, QB-09 mã chữ thường và có khoảng trắng hai đầu (đã mã hoá phần trăm) được chuẩn hoá chữ hoa rồi mới tra: 200', async () => {
    const w = await world();
    await book(w, 'DaXacNhan');
    const res = await change(
      encodeURIComponent(` ${CODE.toLowerCase()} `),
      w.token,
      { trangThai: 'DaHuy', lyDo: 'Mã viết thường' },
    );
    expect(res.status).toBe(200);
    expect(bodyOf(res)).toMatchObject({ maLichHen: CODE, trangThai: 'DaHuy' });
  });

  it('RTS-10, QB-10 khoá tài khoản giữa hai request ⇒ request sau 401 PHIEN_HET_HIEU_LUC, lịch không đổi; đổi vai trò ⇒ 403; ĐỔI CHI NHÁNH của Lễ tân có hiệu lực ở request sau (chi nhánh đọc từ DB mỗi request): lịch cũ thành 404', async () => {
    const w = await world();
    const lich = await book(w, 'DaXacNhan');
    const before = await w.snapshot(lich, 0);
    await h.db.query(
      'UPDATE le_tan SET chi_nhanh_id = ? WHERE tai_khoan_id = ?',
      [w.otherBranch.chiNhanhId, w.receptionId],
    );
    expect(
      (await change(CODE, w.token, { trangThai: 'DaHuy', lyDo: 'x' })).text,
    ).toBe(NOT_FOUND_TEXT);
    await h.db.query(
      'UPDATE le_tan SET chi_nhanh_id = ? WHERE tai_khoan_id = ?',
      [w.branch.chiNhanhId, w.receptionId],
    );
    expect(await w.snapshot(lich, 0)).toEqual(before);

    await h.db.query(
      "UPDATE tai_khoan SET trang_thai = 'NgungHoatDong' WHERE tai_khoan_id = ?",
      [w.receptionId],
    );
    expectErrorResponse(
      await change(CODE, w.token, { trangThai: 'DaHuy', lyDo: 'x' }),
      401,
      SESSION_INACTIVE,
    );
    expect(await w.snapshot(lich, 0)).toEqual(before);

    // guard đã thu hồi phiên cũ: mở lại tài khoản, đổi vai trò rồi tạo phiên MỚI
    await h.db.query(
      "UPDATE tai_khoan SET trang_thai = 'DangHoatDong', loai_tai_khoan = 'BacSi' WHERE tai_khoan_id = ?",
      [w.receptionId],
    );
    const afterRoleChange = await tokenOf(w.receptionId);
    expectErrorResponse(
      await change(CODE, afterRoleChange, { trangThai: 'VangMat' }),
      403,
      FORBIDDEN,
    );
    expect(await w.snapshot(lich, 0)).toEqual(before);
  });
});

describe('RTS-07, MT-02 ở HTTP: route đổi trạng thái ⇔ chuyenDuoc[] của chi tiết (một định nghĩa ma trận)', () => {
  const TIMES = [
    ['trước đầu cửa sổ 1 giây', new Date(WINDOW_START.getTime() - 1000)],
    ['đúng đầu cửa sổ', WINDOW_START],
    ['đúng cuối cửa sổ', WINDOW_END],
    ['sau cuối cửa sổ 1 giây', new Date(WINDOW_END.getTime() + 1000)],
  ] as const;

  /** Với một trạng thái nguồn, một thời điểm, một giá: đích nào nằm trong `chuyenDuoc[]` thì route trả 200, đích còn lại 409; mỗi lần thử dựng lại lịch SẠCH (thử thành công sẽ đổi lịch). */
  async function expectRouteMatchesDetail(
    w: Awaited<ReturnType<typeof world>>,
    at: Date,
    trangThai: TrangThaiLichHen,
    price: string,
    where: string,
  ): Promise<void> {
    await resetBookingRound(h.db);
    vi.setSystemTime(at);
    const token = await tokenOf(w.receptionId);
    await book(w, trangThai, { price });
    const seen = await detail(CODE, token);
    expect(seen.status, where).toBe(200);
    const allowed = new Set(bodyOf(seen).chuyenDuoc as string[]);
    for (const to of ALL_STATES) {
      await resetBookingRound(h.db);
      const lich = await book(w, trangThai, { price });
      const before = await w.snapshot(lich, 0);
      const res = await change(CODE, token, {
        trangThai: to,
        lyDo: 'Lý do kiểm tra',
      });
      if (allowed.has(to)) expect(res.status, `${where} sang ${to}`).toBe(200);
      else {
        expect(res.status, `${where} sang ${to}`).toBe(409);
        expect(await w.snapshot(lich, 0), `${where} sang ${to}`).toEqual(
          before,
        );
      }
    }
  }

  it(
    'RTS-07 bảy trạng thái nguồn × bốn thời điểm (hai đầu cửa sổ và sát hai bên) × (đã thu đủ, còn nợ cho DaXacNhan): route trả 200 khi và CHỈ khi đích ∈ chuyenDuoc[]; đích khác 409 và không đổi gì',
    async () => {
      const w = await world();
      for (const trangThai of ALL_STATES)
        for (const [label, at] of TIMES)
          for (const price of trangThai === 'DaXacNhan'
            ? ['0.00', '100000.00']
            : ['0.00'])
            await expectRouteMatchesDetail(
              w,
              at,
              trangThai,
              price,
              `${trangThai} ${label} giá ${price}`,
            );
    },
    SLOW,
  );

  it(
    'RTS-07 thiếu cấu hình: chuyenDuoc[] của DaXacNhan chỉ còn DaHuy và route khớp: DaTiepDon, VangMat ⇒ 409; DaHuy ⇒ 200',
    async () => {
      const w = await world();
      await h.db.query('DELETE FROM cau_hinh_he_thong');
      await expectRouteMatchesDetail(
        w,
        IN_WINDOW,
        'DaXacNhan',
        '0.00',
        'DaXacNhan thiếu cấu hình',
      );
    },
    SLOW,
  );
});
