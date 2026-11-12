import request from 'supertest';
import { vi } from 'vitest';
import { PATIENT_CANCEL_REASON } from './../src/appointments/appointments.constants.js';
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
  cancelWorld,
  DEPOSIT,
  HOUR_MS,
  REFUND_POLICY,
  SLOT0_TIME,
  T0_TEXT,
  type CancelWorld,
} from './../src/appointments/testing/cancel-world.js';
import { readAppointment } from './../src/appointments/testing/expiry-fixtures.js';
import { assertBookingInvariants } from './../src/appointments/testing/invariants.js';
import { T0 } from './../src/auth/testing/otp-int-helpers.js';
import {
  openRefreshHarness,
  type RefreshHarness,
} from './../src/auth/testing/refresh-http-helpers.js';
import { expectErrorResponse } from './../src/common/testing/error-assertions.js';
import { resetTables } from './../src/database/testing/test-database.js';

// Task B10 — POST /patient/appointments/:maLichHen/cancel và GET …/cancel-preview qua HTTP THẬT: AppModule + MySQL thật + configureApp như main.ts (PLAN booking 5.6, 5.9, 7.3, 7.9, 7.29; TRACKING 3.23 B10-G, B10-I).
// Phần dịch vụ và SQL: src/appointments/cancel/appointment-cancellation.service.int-spec.ts. Mã HL-nn, QB-nn là PLAN 7.3, 7.9; HBN-04 là mã MỚI `[đề xuất]` (7.29). QB-01, QB-02, QB-03, QB-08, QB-09, QB-10 chỉ phần
// HAI ROUTE HUỶ của B10 (một phần: còn B8, B12, B14). Hai cổng `payment` và `wallet` là bản `Noop` của app thật; ca cần tiền đã thu dùng `vi.spyOn` trên CHÍNH thể hiện đó (phục hồi ở afterEach).
// CA QB-02 khẳng định ĐÚNG 403 KHONG_DU_QUYEN ở trạng thái mà dịch vụ sẽ trả mã KHÁC nếu thiếu `@Roles` (lịch của người khác ⇒ 404, lịch DaTiepDon ⇒ 409), kể cả khi gửi mã sai dạng: chỉ e2e phân biệt được `RolesGuard`
// với lỗi của dịch vụ (bài học ĐA-9b của B7).
// ĐỒNG HỒ: `vi.setSystemTime` đổi giờ của CẢ token truy cập, nên ca đổi giờ tạo token SAU khi đặt giờ (và đi tiếp chỉ vài phút, trong hạn 15 phút của token); `afterEach` trả đồng hồ thật.
const BASE = '/patient/appointments';
const NOT_LOGGED_IN = 'CHUA_DANG_NHAP';
const INVALID_TOKEN = 'TOKEN_KHONG_HOP_LE';
const SESSION_INACTIVE = 'PHIEN_HET_HIEU_LUC';
const FORBIDDEN = 'KHONG_DU_QUYEN';
const NOT_FOUND = 'KHONG_TIM_THAY';
const INVALID_DATA = 'DU_LIEU_KHONG_HOP_LE';
const NOT_ALLOWED = 'TRUONG_KHONG_DUOC_PHEP';
const NOT_CANCELLABLE = 'LICH_HEN_KHONG_CHO_HUY';
// Thân 404 chung (patient Q27): giống từng ký tự ở mọi nhánh, kể cả mã sai dạng bị pipe từ chối
const NOT_FOUND_TEXT =
  '{"maLoi":"KHONG_TIM_THAY","thongBao":"Không tìm thấy dữ liệu."}';

// Mã mẫu đúng dạng Q13 (năm ký tự Crockford, KHÔNG có I, L, O, U)
const CODE = 'CLX-20261110-CCC01';
const CODE_2 = 'CLX-20261110-CCC02';
const CODE_3 = 'CLX-20261110-CCC03';
const CODE_4 = 'CLX-20261110-CCC04';
const THEIRS = 'CLX-20261110-DDD01';
const THEIRS_REL = 'CLX-20261110-DDD02';
const MISSING = 'CLX-20261110-ZZZZZ';
const MALFORMED = [
  'sai-dang',
  'CLX-20261110-CCC0I', // có chữ I (không thuộc bảng Crockford của mã)
  `${CODE}-THUA`,
  'CLX-2026111-CCC01',
];

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
// `code` là phần SAU `/patient/appointments/` và được viết thẳng (đã mã hoá phần trăm nếu cần), để thử cả dạng supertest không tự dựng được
const cancel = (code: string, accessToken?: string, body: unknown = {}) => {
  const req = request(h.app.getHttpServer())
    .post(`${BASE}/${code}/cancel`)
    .send(body as object);
  return accessToken ? req.set('Authorization', `Bearer ${accessToken}`) : req;
};
const preview = (code: string, accessToken?: string) => {
  const req = request(h.app.getHttpServer()).get(
    `${BASE}/${code}/cancel-preview`,
  );
  return accessToken ? req.set('Authorization', `Bearer ${accessToken}`) : req;
};

/** Thế giới huỷ (một Bệnh nhân A kèm hồ sơ người thân, chi nhánh, bác sĩ, Lễ tân, hai Quản trị viên, 8 khung giờ ngày 10/11) và token của A. */
async function world() {
  const w = await cancelWorld(h.db, fx);
  return { ...w, token: await tokenOf(w.patientId) };
}

/** Bệnh nhân B với lịch của mình và của hồ sơ người thân của mình (ở khung giờ số `slot`, `slot + 1`). */
async function otherPatient(w: CancelWorld, slot: number) {
  const other = await fx.admin.patient();
  const otherId = other.account.taiKhoanId;
  const relativeId = await fx.relative(otherId);
  const theirs = await w.booked('DaXacNhan', slot, {
    patientId: otherId,
    maLichHen: THEIRS,
  });
  const theirsRel = await w.booked('DaXacNhan', slot + 1, {
    patientId: otherId,
    hoSoNguoiThanId: relativeId,
    maLichHen: THEIRS_REL,
  });
  return { otherId, theirs, theirsRel };
}

const bodyOf = (res: { body: unknown }) => res.body as Record<string, unknown>;

describe('POST …/cancel — huỷ thành công và kết quả', () => {
  it('HL-01 lịch DaXacNhan cọc 0: 200 đúng BA khoá { maLichHen, trangThai: DaHuy, hoanCoc: null }; DB: DaHuy, ly_do_huy hằng, thoi_diem_huy; khung giờ ConTrong; no-store; INV', async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0, { maLichHen: CODE });

    const res = await cancel(CODE, w.token);

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toStrictEqual({
      maLichHen: CODE,
      trangThai: 'DaHuy',
      hoanCoc: null,
    });
    expect(Object.keys(bodyOf(res)).sort()).toEqual([
      'hoanCoc',
      'maLichHen',
      'trangThai',
    ]);
    expect(await readAppointment(h.db, lich.lichHenId)).toEqual({
      trangThai: 'DaHuy',
      huy: T0_TEXT,
      lyDo: PATIENT_CANCEL_REASON,
      han: null,
    });
    await w.expectSlot(0, 'ConTrong');
    await assertBookingInvariants(h.db);
  });

  it('HL-02 lịch ChoThanhToan (Q45): 200, hoanCoc null, khung giờ về ConTrong', async () => {
    const w = await world();
    await w.booked('ChoThanhToan', 0, { maLichHen: CODE });
    const res = await cancel(CODE, w.token);
    expect(res.status).toBe(200);
    expect(bodyOf(res)).toMatchObject({ trangThai: 'DaHuy', hoanCoc: null });
    await w.expectSlot(0, 'ConTrong');
    await assertBookingInvariants(h.db);
  });

  it('HL-04 lịch của hồ sơ NGƯỜI THÂN của chính mình: 200', async () => {
    const w = await world();
    await w.booked('DaXacNhan', 0, {
      maLichHen: CODE,
      hoSoNguoiThanId: w.relativeId,
    });
    expect((await cancel(CODE, w.token)).status).toBe(200);
  });

  it('HL-06 bấm đúp: lần hai 409 LICH_HEN_KHONG_CHO_HUY kèm chiTiet.trangThai = DaHuy; lịch vẫn như lần một', async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0, { maLichHen: CODE });
    expect((await cancel(CODE, w.token)).status).toBe(200);
    const before = await readAppointment(h.db, lich.lichHenId);

    const second = await cancel(CODE, w.token);

    const body = expectErrorResponse(second, 409, NOT_CANCELLABLE);
    expect(body.chiTiet).toStrictEqual({ trangThai: 'DaHuy' });
    expect(await readAppointment(h.db, lich.lichHenId)).toEqual(before);
  });

  it('HL-13 lyDo: vắng, rỗng hay chỉ khoảng trắng ⇒ ly_do_huy là chữ hằng "Bệnh nhân hủy lịch hẹn"; có chữ ⇒ lưu chữ đã cắt khoảng trắng', async () => {
    const w = await world();
    const a = await w.booked('DaXacNhan', 0, { maLichHen: CODE });
    const b = await w.booked('DaXacNhan', 1, { maLichHen: CODE_2 });
    const c = await w.booked('DaXacNhan', 2, { maLichHen: CODE_3 });
    const d = await w.booked('DaXacNhan', 3, { maLichHen: CODE_4 });

    expect((await cancel(CODE, w.token, {})).status).toBe(200);
    expect((await cancel(CODE_2, w.token, { lyDo: '' })).status).toBe(200);
    expect((await cancel(CODE_3, w.token, { lyDo: '   ' })).status).toBe(200);
    expect(
      (await cancel(CODE_4, w.token, { lyDo: '  Bận việc đột xuất ' })).status,
    ).toBe(200);

    for (const lich of [a, b, c])
      expect((await readAppointment(h.db, lich.lichHenId)).lyDo).toBe(
        PATIENT_CANCEL_REASON,
      );
    expect((await readAppointment(h.db, d.lichHenId)).lyDo).toBe(
      'Bận việc đột xuất',
    );
  });

  it('HL-13 lyDo dài 255 ký tự hợp lệ; 256 ký tự ⇒ 400 DU_LIEU_KHONG_HOP_LE với loi [{ truong: lyDo, ma: MAX_LENGTH }]; lyDo không phải chuỗi ⇒ 400; lịch không đổi', async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0, { maLichHen: CODE });
    const before = await w.snapshot(lich, 0);

    const tooLong = await cancel(CODE, w.token, { lyDo: 'a'.repeat(256) });
    const body = expectErrorResponse(tooLong, 400, INVALID_DATA);
    expect(body.loi).toStrictEqual([{ truong: 'lyDo', ma: 'MAX_LENGTH' }]);
    expectErrorResponse(
      await cancel(CODE, w.token, { lyDo: 123 }),
      400,
      INVALID_DATA,
    );
    expect(await w.snapshot(lich, 0)).toEqual(before);

    expect(
      (await cancel(CODE, w.token, { lyDo: 'a'.repeat(255) })).status,
    ).toBe(200);
    expect((await readAppointment(h.db, lich.lichHenId)).lyDo).toBe(
      'a'.repeat(255),
    );
  });
});

describe('HBN-04 cọc đã thu > 0: số hoàn THỰC TẾ tính lại lúc xác nhận (Q18), RefundPort gọi một lần', () => {
  it('xem trước còn 24 giờ 1 phút (100%); hai phút sau còn 23 giờ 59 phút ⇒ huỷ trả 50%, KHÁC số xem trước; refund đúng MỘT lần với tham số của số thực tế', async () => {
    const w = await cancelWorld(h.db, fx);
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

    // đặt giờ TRƯỚC khi tạo token (token mang giờ của đồng hồ giả); sau đó đi tiếp chỉ hai phút, trong hạn 15 phút
    vi.setSystemTime(new Date(SLOT0_TIME.getTime() - 24 * HOUR_MS - 60_000));
    const token = await tokenOf(w.patientId);

    const seen = await preview(CODE, token);
    expect(seen.status).toBe(200);
    expect(seen.body).toStrictEqual({
      choPhepHuy: true,
      hoanCoc: { tyLe: 100, soTien: '100000.00', mocApDung: 24 },
    });

    vi.setSystemTime(new Date(SLOT0_TIME.getTime() - 24 * HOUR_MS + 60_000));
    const done = await cancel(CODE, token);

    expect(done.status).toBe(200);
    expect(done.body).toStrictEqual({
      maLichHen: CODE,
      trangThai: 'DaHuy',
      hoanCoc: { tyLe: 50, soTien: '50000.00' },
    });
    expect(refund).toHaveBeenCalledTimes(1);
    expect(refund.mock.calls[0]?.[0]).toEqual({
      lichHenId: lich.lichHenId,
      soTien: '50000.00',
      lyDo: PATIENT_CANCEL_REASON,
    });
    await w.expectSlot(0, 'ConTrong');
    await assertBookingInvariants(h.db);
  });

  it('cọc đã thu mà RefundPort ném lỗi: HTTP vẫn 200 và lịch vẫn DaHuy (lỗi hoàn không hoàn tác việc huỷ, HLH A3, HL-11)', async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0, {
      maLichHen: CODE,
      coc: DEPOSIT,
      policy: REFUND_POLICY,
    });
    vi.spyOn(
      h.app.get<PaymentSummaryPort>(PAYMENT_SUMMARY_PORT, { strict: false }),
      'amountPaid',
    ).mockResolvedValue(DEPOSIT);
    vi.spyOn(
      h.app.get<RefundPort>(REFUND_PORT, { strict: false }),
      'refund',
    ).mockRejectedValue(new Error('ví lỗi'));

    const res = await cancel(CODE, w.token);

    expect(res.status).toBe(200);
    expect(bodyOf(res).hoanCoc).toStrictEqual({
      tyLe: 100,
      soTien: '100000.00',
    });
    expect((await readAppointment(h.db, lich.lichHenId)).trangThai).toBe(
      'DaHuy',
    );
  });
});

describe('GET …/cancel-preview — ước tính, chỉ đọc', () => {
  it('hình dạng: cọc đã thu > 0 ⇒ { choPhepHuy: true, hoanCoc: { tyLe, soTien, mocApDung } }; chưa thu (cọc 0đ, ChoThanhToan) ⇒ hoanCoc null; lịch không huỷ được ⇒ { choPhepHuy: false, lyDoKhongHuy, hoanCoc: null }; no-store', async () => {
    const w = await world();
    const paidAppointment = await w.booked('DaXacNhan', 0, {
      maLichHen: CODE,
      coc: DEPOSIT,
      policy: REFUND_POLICY,
    });
    await w.booked('ChoThanhToan', 1, {
      maLichHen: CODE_2,
      coc: DEPOSIT,
      policy: REFUND_POLICY,
    });
    await w.booked('DaTiepDon', 2, { maLichHen: CODE_3 });
    // chỉ lịch đầu đã thu cọc; lịch ChoThanhToan chưa thu đồng nào
    vi.spyOn(
      h.app.get<PaymentSummaryPort>(PAYMENT_SUMMARY_PORT, { strict: false }),
      'amountPaid',
    ).mockImplementation((_em, lichHenId) =>
      Promise.resolve(
        lichHenId === paidAppointment.lichHenId ? DEPOSIT : '0.00',
      ),
    );

    const paid = await preview(CODE, w.token);
    expect(paid.status).toBe(200);
    expect(paid.headers['cache-control']).toBe('no-store');
    expect(Object.keys(bodyOf(paid)).sort()).toEqual(['choPhepHuy', 'hoanCoc']);
    // đồng hồ T0 cách giờ hẹn 192 giờ (≥ 24 giờ ⇒ mốc 24)
    expect(paid.body).toStrictEqual({
      choPhepHuy: true,
      hoanCoc: { tyLe: 100, soTien: '100000.00', mocApDung: 24 },
    });
    expect(Object.keys((bodyOf(paid).hoanCoc ?? {}) as object).sort()).toEqual([
      'mocApDung',
      'soTien',
      'tyLe',
    ]);

    const pending = await preview(CODE_2, w.token);
    expect(pending.status).toBe(200);
    expect(pending.body).toStrictEqual({ choPhepHuy: true, hoanCoc: null });

    const checkedIn = await preview(CODE_3, w.token);
    expect(checkedIn.status).toBe(200);
    expect(checkedIn.body).toStrictEqual({
      choPhepHuy: false,
      lyDoKhongHuy: NOT_CANCELLABLE,
      hoanCoc: null,
    });
  });

  it('HL-08 (phần E) xem trước KHÔNG đổi dữ liệu: hàng lịch và khung giờ y nguyên', async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0, {
      maLichHen: CODE,
      coc: DEPOSIT,
      policy: REFUND_POLICY,
    });
    const before = await w.snapshot(lich, 0);
    expect((await preview(CODE, w.token)).status).toBe(200);
    expect(await w.snapshot(lich, 0)).toEqual(before);
  });
});

describe('HL-03 lịch không huỷ được (A1) và quyết định (j) về DaDoiLich', () => {
  it.each(['DaTiepDon', 'HoanThanh', 'VangMat', 'DaHuy'] as const)(
    'HL-03 lịch %s: POST 409 LICH_HEN_KHONG_CHO_HUY kèm chiTiet.trangThai; lịch và khung giờ không đổi',
    async (trangThai) => {
      const w = await world();
      const lich = await w.booked(trangThai, 0, { maLichHen: CODE });
      const before = await w.snapshot(lich, 0);

      const res = await cancel(CODE, w.token);

      const body = expectErrorResponse(res, 409, NOT_CANCELLABLE);
      expect(body.chiTiet).toStrictEqual({ trangThai });
      expect(res.headers['cache-control']).toBe('no-store');
      expect(await w.snapshot(lich, 0)).toEqual(before);
      await assertBookingInvariants(h.db);
    },
  );

  it('HL-03, (j) lịch DaDoiLich: 404 KHONG_TIM_THAY cùng thân ở CẢ HAI route (POST: sinh ra từ bước kiểm phạm vi của người gọi BenhNhan, lọc PATIENT_VISIBLE_STATES; không phải 409); lịch không đổi', async () => {
    const w = await world();
    const lich = await w.booked('DaDoiLich', 0, { maLichHen: CODE });
    const before = await w.snapshot(lich, 0);

    for (const res of [
      await cancel(CODE, w.token),
      await preview(CODE, w.token),
    ]) {
      expectErrorResponse(res, 404, NOT_FOUND);
      expect(res.text).toBe(NOT_FOUND_TEXT);
      expect(res.headers['cache-control']).toBe('no-store');
    }
    expect(await w.snapshot(lich, 0)).toEqual(before);
  });
});

describe('QB-01, QB-09, HL-05 sở hữu và mã sai: cùng MỘT 404, từng ký tự', () => {
  it('HL-05, QB-01 lịch của Bệnh nhân khác, của hồ sơ người thân của họ, mã không tồn tại và mọi mã sai dạng: cả hai route ra đúng thân 404 chung; lịch của người khác không đổi', async () => {
    const w = await world();
    await w.booked('DaXacNhan', 0, { maLichHen: CODE });
    const { theirs, theirsRel } = await otherPatient(w, 1);
    const before = [
      await w.snapshot(theirs, 1),
      await w.snapshot(theirsRel, 2),
    ];

    for (const code of [THEIRS, THEIRS_REL, MISSING, ...MALFORMED]) {
      for (const res of [
        await cancel(code, w.token),
        await preview(code, w.token),
      ]) {
        expectErrorResponse(res, 404, NOT_FOUND);
        expect(res.text, code).toBe(NOT_FOUND_TEXT);
        expect(res.headers['cache-control'], code).toBe('no-store');
      }
    }
    expect([
      await w.snapshot(theirs, 1),
      await w.snapshot(theirsRel, 2),
    ]).toEqual(before);
  });

  it('QB-09 mã chữ thường và có khoảng trắng hai đầu (đã mã hoá phần trăm) được chuẩn hoá chữ hoa rồi mới tra: 200', async () => {
    const w = await world();
    await w.booked('DaXacNhan', 0, { maLichHen: CODE });
    await w.booked('DaXacNhan', 1, { maLichHen: CODE_2 });
    expect((await preview(CODE.toLowerCase(), w.token)).status).toBe(200);
    expect((await cancel(CODE.toLowerCase(), w.token)).status).toBe(200);
    expect((await cancel(`%20${CODE_2}%20`, w.token)).status).toBe(200);
  });
});

describe('QB-02, QB-03, QB-08, QB-10 vai trò, thân và tiêu đề của hai route huỷ', () => {
  it('QB-02 hai route: Bệnh nhân 200; Bác sĩ, Lễ tân, QTV Chi nhánh, QTV Toàn hệ thống ĐÚNG 403 KHONG_DU_QUYEN (ĐỎ khi bỏ @Roles ở route này: dịch vụ sẽ trả 404 hay 409); chưa đăng nhập 401; lịch không đổi', async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0, { maLichHen: CODE });
    await w.booked('DaTiepDon', 1, { maLichHen: CODE_2 });
    const before = await w.snapshot(lich, 0);
    const wrongRoles = [
      ['Bác sĩ', w.doctor.account.taiKhoanId],
      ['Lễ tân', w.receptionist.account.taiKhoanId],
      ['QTV Chi nhánh', w.branchAdmin.account.taiKhoanId],
      ['QTV Toàn hệ thống', w.systemAdmin.account.taiKhoanId],
    ] as const;

    for (const [role, accountId] of wrongRoles) {
      const token = await tokenOf(accountId);
      // mã ĐÚNG của lịch của Bệnh nhân A, mã của lịch DaTiepDon, mã không tồn tại và mã SAI DẠNG: guard chạy TRƯỚC pipe và dịch vụ
      for (const code of [CODE, CODE_2, MISSING, 'sai-dang']) {
        for (const res of [
          await preview(code, token),
          await cancel(code, token),
        ]) {
          expect(res.status, `${role} ${code}`).toBe(403);
          expectErrorResponse(res, 403, FORBIDDEN);
        }
      }
    }
    expect(await w.snapshot(lich, 0)).toEqual(before);

    for (const code of [CODE, 'sai-dang']) {
      expectErrorResponse(await preview(code), 401, NOT_LOGGED_IN);
      expectErrorResponse(await cancel(code), 401, NOT_LOGGED_IN);
      expectErrorResponse(
        await preview(code, 'khong.phai.jwt'),
        401,
        INVALID_TOKEN,
      );
      expectErrorResponse(
        await cancel(code, 'khong.phai.jwt'),
        401,
        INVALID_TOKEN,
      );
    }
    expect((await preview(CODE, w.token)).status).toBe(200);
    expect((await cancel(CODE, w.token)).status).toBe(200);
  });

  it('QB-03 thân có benhNhanId, trangThai, hoanCoc hay maLichHen ⇒ 400 TRUONG_KHONG_DUOC_PHEP; quyền và lịch không đổi (chủ sở hữu chỉ từ access token)', async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0, { maLichHen: CODE });
    const before = await w.snapshot(lich, 0);
    for (const extra of ['benhNhanId', 'trangThai', 'hoanCoc', 'maLichHen']) {
      const res = await cancel(CODE, w.token, { [extra]: '1' });
      const body = expectErrorResponse(res, 400, INVALID_DATA);
      expect(body.loi).toStrictEqual([{ truong: extra, ma: NOT_ALLOWED }]);
    }
    expect(await w.snapshot(lich, 0)).toEqual(before);
  });

  it('QB-08 Cache-Control: no-store ở 200, 400 do DTO, 404 do dịch vụ, 404 do pipe và 409 của CẢ HAI route (401 và 403 do guard không hứa)', async () => {
    const w = await world();
    await w.booked('DaXacNhan', 0, { maLichHen: CODE });
    await w.booked('DaTiepDon', 1, { maLichHen: CODE_2 });
    const responses = [
      await preview(CODE, w.token),
      await preview(CODE_2, w.token),
      await preview(MISSING, w.token),
      await preview('sai-dang', w.token),
      await cancel(CODE_2, w.token),
      await cancel(MISSING, w.token),
      await cancel('sai-dang', w.token),
      await cancel(CODE, w.token, { lyDo: 'a'.repeat(256) }),
      await cancel(CODE, w.token),
    ];
    expect(responses.map((res) => res.status)).toEqual([
      200, 200, 404, 404, 409, 404, 404, 400, 200,
    ]);
    for (const res of responses)
      expect(res.headers['cache-control']).toBe('no-store');
  });

  it('QB-10 khoá tài khoản giữa hai request ⇒ request sau 401 PHIEN_HET_HIEU_LUC ở cả hai route, lịch không đổi; đổi vai trò ⇒ 403', async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0, { maLichHen: CODE });
    expect((await preview(CODE, w.token)).status).toBe(200);
    await h.db.query(
      "UPDATE tai_khoan SET trang_thai = 'NgungHoatDong' WHERE tai_khoan_id = ?",
      [w.patientId],
    );
    const before = await w.snapshot(lich, 0);
    expectErrorResponse(await preview(CODE, w.token), 401, SESSION_INACTIVE);
    expectErrorResponse(await cancel(CODE, w.token), 401, SESSION_INACTIVE);
    expect(await w.snapshot(lich, 0)).toEqual(before);

    // guard đã thu hồi phiên cũ: mở lại tài khoản, đổi vai trò rồi tạo phiên MỚI
    await h.db.query(
      "UPDATE tai_khoan SET trang_thai = 'DangHoatDong', loai_tai_khoan = 'BacSi' WHERE tai_khoan_id = ?",
      [w.patientId],
    );
    const afterRoleChange = await tokenOf(w.patientId);
    expectErrorResponse(await cancel(CODE, afterRoleChange), 403, FORBIDDEN);
    expectErrorResponse(await preview(CODE, afterRoleChange), 403, FORBIDDEN);
    expect(await w.snapshot(lich, 0)).toEqual(before);
  });
});
