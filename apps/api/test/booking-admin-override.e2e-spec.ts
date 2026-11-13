import request from 'supertest';
import { vi } from 'vitest';
import type { TrangThaiLichHen } from './../src/admin/entities/enums.js';
import { AuditError } from './../src/audit/audit-error.js';
import { AuditService } from './../src/audit/audit.service.js';
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
  HOUR_MS,
  REFUND_POLICY,
  SLOT0_TIME,
} from './../src/appointments/testing/cancel-world.js';
import { readAppointment } from './../src/appointments/testing/expiry-fixtures.js';
import { assertBookingInvariants } from './../src/appointments/testing/invariants.js';
import {
  expectedAudit,
  OVERRIDE_REASON,
  readAudit,
  scopeOf,
} from './../src/appointments/testing/override-world.js';
import { resetBookingRound } from './../src/appointments/testing/payment-doctor-fakes.js';
import {
  ALL_STATES,
  readNoShow,
  statusWorld,
  type StatusWorld,
} from './../src/appointments/testing/status-world.js';
import { T0 } from './../src/auth/testing/otp-int-helpers.js';
import {
  openRefreshHarness,
  type RefreshHarness,
} from './../src/auth/testing/refresh-http-helpers.js';
import { expectErrorResponse } from './../src/common/testing/error-assertions.js';
import { resetTables } from './../src/database/testing/test-database.js';

// Task B14 — POST /admin/appointments/:maLichHen/override-status qua HTTP THẬT: AppModule + MySQL thật + configureApp như main.ts (PLAN booking 5.7, 5.9, 7.3 HL-15, 7.5 CT-14…CT-22, MT-03; 7.9 QB-02, QB-03, QB-05, QB-08, QB-09, QB-10;
// 7.37 OVR-05, OVR-06, OVR-08, OVR-09; TRACKING 3.31 B14-C, B14-H). Phần dịch vụ và SQL (từng cặp Q24, 39 ô từ chối, hoàn tác thật, đồng thời): src/appointments/status/admin-override.int-spec.ts và
// admin-override.concurrency.int-spec.ts. Hai cổng `payment` và `wallet` là bản `Noop` của app thật; ca cần cọc đã thu dùng `vi.spyOn` trên CHÍNH thể hiện của app (như HBN-04, RTS-xx). Thông báo là `Noop` (B15 chưa có) nên ca này không kiểm
// `thong_bao`. QB-nn chỉ phần route override (chưa tính Pass: còn route của B4).
// CA CT-22 (nửa Quản trị viên) và QB-02 khẳng định ĐÚNG 403 KHONG_DU_QUYEN ở trạng thái mà dịch vụ sẽ trả mã KHÁC nếu thiếu guard (lịch DaHuy ⇒ 409, mã không tồn tại ⇒ 404, thân sai ⇒ 400), kể cả mã sai dạng (bài học ĐA-9b). LƯU Ý:
// `@RequireAdminScope('Any')` đứng cạnh `@Roles('QuanTriVien')` và cũng trả 403 cho vai trò khác, nên bỏ riêng `@Roles` KHÔNG làm ca này đỏ; AR-02 (`architecture.spec.ts`) mới là lớp bắt đột biến đó.
// ĐỒNG HỒ: `vi.setSystemTime` đổi giờ của CẢ token truy cập, nên ca đổi giờ tạo token SAU khi đặt giờ.
const BASE = '/admin/appointments';
const NOT_LOGGED_IN = 'CHUA_DANG_NHAP';
const INVALID_TOKEN = 'TOKEN_KHONG_HOP_LE';
const SESSION_INACTIVE = 'PHIEN_HET_HIEU_LUC';
const FORBIDDEN = 'KHONG_DU_QUYEN';
const INVALID_DATA = 'DU_LIEU_KHONG_HOP_LE';
const NOT_ALLOWED = 'TRUONG_KHONG_DUOC_PHEP';
const REASON_REQUIRED = 'LY_DO_BAT_BUOC';
// Thân 404 chung (patient Q27): giống từng ký tự ở mọi nhánh, kể cả mã sai dạng bị pipe từ chối
const NOT_FOUND_TEXT =
  '{"maLoi":"KHONG_TIM_THAY","thongBao":"Không tìm thấy dữ liệu."}';

const CODE = 'CLX-20261110-CCC01';
const CODE_2 = 'CLX-20261110-CCC02';
const MISSING = 'CLX-20261110-ZZZZZ';
const MALFORMED = ['sai-dang', 'CLX-20261110-CCC0I', `${CODE}-THUA`];
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
// `code` là phần SAU `/admin/appointments/` và được viết thẳng (đã mã hoá phần trăm nếu cần)
const override = (code: string, accessToken?: string, body: unknown = {}) => {
  const req = request(h.app.getHttpServer())
    .post(`${BASE}/${code}/override-status`)
    .send(body as object);
  return accessToken ? req.set('Authorization', `Bearer ${accessToken}`) : req;
};
const bodyOf = (res: { body: unknown }) => res.body as Record<string, unknown>;

/** Thế giới override (`statusWorld`: hai Quản trị viên Toàn hệ thống và Chi nhánh, Lễ tân, Bác sĩ, hai Bệnh nhân, chi nhánh thứ hai) cùng token của Quản trị viên Toàn hệ thống và Chi nhánh. */
async function world() {
  const w = await statusWorld(h.db, fx);
  return {
    ...w,
    toan: await tokenOf(scopeOf(w, 'Toan').accountId),
    chiNhanh: await tokenOf(scopeOf(w, 'ChiNhanh').accountId),
  };
}

/** Lịch mã `code` ở khung giờ số `slot`, ở `trangThai`; dọn dữ liệu lịch trước (các ca tự đặt giờ nên mỗi ca tự dựng thế giới). */
async function book(
  w: StatusWorld,
  trangThai: TrangThaiLichHen,
  options: { code?: string; slot?: number } = {},
) {
  return w.booked(trangThai, options.slot ?? 0, {
    maLichHen: options.code ?? CODE,
  });
}

describe('POST …/override-status — thành công và hình dạng kết quả (CT-14, HL-15 nửa Quản trị viên, OVR-09)', () => {
  it.each([
    ['DaXacNhan', 'DaHuy'],
    ['DaXacNhan', 'DaTiepDon'],
    ['DaXacNhan', 'VangMat'],
    ['VangMat', 'DaXacNhan'],
  ] as const)(
    'CT-14 %s → %s qua HTTP: 200 đúng khoá (DaHuy thêm hoanCoc), no-store, trạng thái và khung giờ đúng, MỘT dòng nhật ký OverrideLichHen đủ cột, INV',
    async (from, to) => {
      const w = await world();
      const lich = await book(w, from);
      const res = await override(CODE, w.toan, {
        trangThai: to,
        lyDo: `  ${OVERRIDE_REASON}  `,
      });
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body).toStrictEqual(
        to === 'DaHuy'
          ? { maLichHen: CODE, trangThai: 'DaHuy', hoanCoc: null }
          : { maLichHen: CODE, trangThai: to },
      );
      expect((await readAppointment(h.db, lich.lichHenId)).trangThai).toBe(to);
      await w.expectSlot(0, to === 'DaHuy' ? 'ConTrong' : 'DaDat');
      expect(await readAudit(h.db)).toMatchObject([
        expectedAudit(w, 'Toan', lich.lichHenId, from, to),
      ]);
      expect(await readNoShow(h.db, w.patientId)).toEqual({
        soLan: to === 'VangMat' ? 1 : 0,
        khoa: false,
      });
      await assertBookingInvariants(h.db);
    },
  );

  it('HL-15 (nửa Quản trị viên) DaXacNhan đã thu cọc, còn 23 giờ (theo bậc chỉ 50%): override DaHuy hoàn 100% ở thân và ở cổng hoàn (một lần)', async () => {
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
    vi.setSystemTime(new Date(SLOT0_TIME.getTime() - 23 * HOUR_MS));
    const token = await tokenOf(scopeOf(w, 'Toan').accountId);
    const res = await override(CODE, token, {
      trangThai: 'DaHuy',
      lyDo: OVERRIDE_REASON,
    });
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({
      maLichHen: CODE,
      trangThai: 'DaHuy',
      hoanCoc: { tyLe: 100, soTien: '100000.00' },
    });
    expect(refund).toHaveBeenCalledTimes(1);
    expect(refund.mock.calls[0]?.[0]).toMatchObject({
      lichHenId: lich.lichHenId,
      soTien: '100000.00',
    });
  });

  it('OVR-09 CT-21 override DaTiepDon ngoài cửa sổ và còn phải thu (cổng Noop trả gia_snapshot) vẫn 200; nhật ký chỉ ba khoá trong changes, không tên, SĐT hay email bệnh nhân', async () => {
    const w = await world();
    const lich = await book(w, 'DaXacNhan');
    await h.db.query(
      "UPDATE lich_hen SET gia_snapshot = '150000.00' WHERE lich_hen_id = ?",
      [lich.lichHenId],
    );
    const res = await override(CODE, w.toan, {
      trangThai: 'DaTiepDon',
      lyDo: OVERRIDE_REASON,
    });
    expect(res.status).toBe(200);
    const [row] = await readAudit(h.db);
    expect(Object.keys(row?.chiTietThayDoi ?? {}).sort()).toEqual([
      'ly_do',
      'sau',
      'truoc',
    ]);
    const text = JSON.stringify(row);
    for (const secret of [
      w.patient.account.hoTen,
      w.patient.account.soDienThoai,
      w.patient.account.email,
    ])
      expect(text.includes(String(secret)), String(secret)).toBe(false);
  });
});

describe('POST …/override-status — lỗi nghiệp vụ và mã lỗi (CT-16, MT-03, CT-17, QB-05)', () => {
  it('CT-16, MT-03 mẫu qua HTTP: HoanThanh ⇒ 409 CHI_BAC_SI_HOAN_THANH với MỌI nguồn; đích DaHuy bị từ chối ⇒ 409 LICH_HEN_KHONG_CHO_HUY kèm trangThai; ChoThanhToan và DaDoiLich ⇒ 409 CHUYEN_TRANG_THAI_KHONG_HOP_LE kèm tuTrangThai, denTrangThai; không đổi gì, không nhật ký', async () => {
    const w = await world();
    for (const from of ALL_STATES) {
      await resetBookingRound(h.db);
      await h.db.query('DELETE FROM nhat_ky_hanh_dong');
      const lich = await book(w, from);
      const before = await w.snapshot(lich, 0);
      const toDone = await override(CODE, w.toan, {
        trangThai: 'HoanThanh',
        lyDo: 'x',
      });
      expect(toDone.status, from).toBe(409);
      expect(bodyOf(toDone).maLoi, from).toBe('CHI_BAC_SI_HOAN_THANH');
      for (const to of ['ChoThanhToan', 'DaDoiLich'] as const) {
        const res = await override(CODE, w.toan, { trangThai: to, lyDo: 'x' });
        expect(res.status, `${from} ${to}`).toBe(409);
        expect(bodyOf(res), `${from} ${to}`).toMatchObject({
          maLoi: 'CHUYEN_TRANG_THAI_KHONG_HOP_LE',
          chiTiet: { tuTrangThai: from, denTrangThai: to },
        });
      }
      if (from === 'DaHuy' || from === 'HoanThanh' || from === 'DaDoiLich') {
        const res = await override(CODE, w.toan, {
          trangThai: 'DaHuy',
          lyDo: 'x',
        });
        expect(res.status, from).toBe(409);
        expect(bodyOf(res), from).toMatchObject({
          maLoi: 'LICH_HEN_KHONG_CHO_HUY',
          chiTiet: { trangThai: from },
        });
      }
      expect(await w.snapshot(lich, 0), from).toEqual(before);
      expect(await readAudit(h.db), from).toEqual([]);
    }
  });

  it('CT-17, QB-05 Quản trị viên Chi nhánh NGOÀI phạm vi, lịch không tồn tại và mã sai dạng: CÙNG MỘT 404 từng ký tự với MỌI đích (kể cả HoanThanh); Toàn hệ thống và Chi nhánh đúng chi nhánh thì được', async () => {
    const w = await world();
    const lich = await book(w, 'DaXacNhan');
    const before = await w.snapshot(lich, 0);
    const outsider = await fx.admin.admin(w.otherBranch);
    const outsiderToken = await tokenOf(outsider.account.taiKhoanId);
    for (const to of ALL_STATES)
      for (const code of [CODE, MISSING, ...MALFORMED]) {
        const token = code === CODE ? outsiderToken : w.toan;
        const res = await override(code, token, {
          trangThai: to,
          lyDo: 'Lý do',
        });
        expect(res.status, `${to} ${code}`).toBe(404);
        expect(res.text, `${to} ${code}`).toBe(NOT_FOUND_TEXT);
      }
    expect(await w.snapshot(lich, 0)).toEqual(before);
    expect(await readAudit(h.db)).toEqual([]);

    expect(
      (
        await override(CODE, w.chiNhanh, {
          trangThai: 'DaTiepDon',
          lyDo: OVERRIDE_REASON,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await override(CODE, w.toan, {
          trangThai: 'DaXacNhan',
          lyDo: OVERRIDE_REASON,
        })
      ).status,
    ).toBe(200);
  });

  it('CT-10 / quy tắc 35 thiếu cau_hinh_he_thong: VangMat ⇒ 409 HE_THONG_CHUA_CAU_HINH (không đổi gì); DaTiepDon, DaXacNhan, DaHuy vẫn 200', async () => {
    const w = await world();
    const lich = await book(w, 'DaXacNhan');
    await h.db.query('DELETE FROM cau_hinh_he_thong');
    const before = await w.snapshot(lich, 0);
    const refused = await override(CODE, w.toan, {
      trangThai: 'VangMat',
      lyDo: 'x',
    });
    expect(refused.status).toBe(409);
    expect(bodyOf(refused).maLoi).toBe('HE_THONG_CHUA_CAU_HINH');
    expect(await w.snapshot(lich, 0)).toEqual(before);
    for (const to of ['DaTiepDon', 'DaXacNhan', 'DaHuy'] as const)
      expect(
        (await override(CODE, w.toan, { trangThai: to, lyDo: 'x' })).status,
        to,
      ).toBe(200);
  });
});

describe('POST …/override-status — DTO (CT-15, OVR-05, QB-03)', () => {
  it('CT-15 lyDo thiếu, rỗng, chỉ khoảng trắng, không phải chuỗi hay 256 ký tự ⇒ 400 DU_LIEU_KHONG_HOP_LE với loi[].ma = LY_DO_BAT_BUOC Ở MỌI ĐÍCH (kể cả HoanThanh); lịch không đổi; 255 ký tự được', async () => {
    const w = await world();
    const lich = await book(w, 'DaXacNhan');
    const before = await w.snapshot(lich, 0);
    for (const trangThai of ALL_STATES)
      for (const extra of [
        {},
        { lyDo: '' },
        { lyDo: '   \t\n' },
        { lyDo: null },
        { lyDo: 123 },
        { lyDo: 'a'.repeat(256) },
      ]) {
        const res = await override(CODE, w.toan, { trangThai, ...extra });
        const body = expectErrorResponse(res, 400, INVALID_DATA);
        expect(body.loi, `${trangThai} ${JSON.stringify(extra)}`).toEqual([
          { truong: 'lyDo', ma: REASON_REQUIRED },
        ]);
      }
    expect(await w.snapshot(lich, 0)).toEqual(before);
    expect(await readAudit(h.db)).toEqual([]);
    expect(
      (
        await override(CODE, w.toan, {
          trangThai: 'DaTiepDon',
          lyDo: 'a'.repeat(255),
        })
      ).status,
    ).toBe(200);
  });

  it('OVR-05 lyDo giống bí mật (token, băm, khoá=giá trị) ⇒ 400 LY_DO_BAT_BUOC TRƯỚC khi chạm DB, KHÔNG 500; lịch và nhật ký không đổi', async () => {
    const w = await world();
    const lich = await book(w, 'DaXacNhan');
    const before = await w.snapshot(lich, 0);
    for (const lyDo of [
      'token=abc123xyz',
      'Bearer abcdefghijklmnop',
      `mã băm ${'a'.repeat(64)}`,
    ]) {
      const res = await override(CODE, w.toan, { trangThai: 'VangMat', lyDo });
      expectErrorResponse(res, 400, INVALID_DATA);
    }
    expect(await w.snapshot(lich, 0)).toEqual(before);
    expect(await readAudit(h.db)).toEqual([]);
  });

  it('trangThai thiếu hay ngoài bảy giá trị ⇒ 400 trangThai IS_IN; quyền không đổi', async () => {
    const w = await world();
    for (const trangThai of [undefined, 'vangmat', 'Huy', '', 5, null]) {
      const res = await override(CODE, w.toan, {
        ...(trangThai === undefined ? {} : { trangThai }),
        lyDo: 'x',
      });
      const body = expectErrorResponse(res, 400, INVALID_DATA);
      expect(body.loi).toContainEqual({ truong: 'trangThai', ma: 'IS_IN' });
    }
  });

  it('QB-03 thân có benhNhanId, chiNhanhId, maLichHen, hoanCoc, lichHenId hay actorId ⇒ 400 TRUONG_KHONG_DUOC_PHEP; phạm vi và người thực hiện chỉ từ token và DB; lịch không đổi', async () => {
    const w = await world();
    const lich = await book(w, 'DaXacNhan');
    const before = await w.snapshot(lich, 0);
    for (const extra of [
      'benhNhanId',
      'chiNhanhId',
      'maLichHen',
      'hoanCoc',
      'lichHenId',
      'actorId',
    ]) {
      const res = await override(CODE, w.toan, {
        trangThai: 'VangMat',
        lyDo: 'x',
        [extra]: '1',
      });
      const body = expectErrorResponse(res, 400, INVALID_DATA);
      expect(body.loi).toEqual([{ truong: extra, ma: NOT_ALLOWED }]);
    }
    expect(await w.snapshot(lich, 0)).toEqual(before);
  });
});

describe('POST …/override-status — vai trò, đăng nhập, mã và tiêu đề (QB-02, QB-08, QB-09, QB-10, CT-22 nửa Quản trị viên, OVR-08)', () => {
  it('QB-02, CT-22 Quản trị viên (cả hai phạm vi) 200; Bệnh nhân, Bác sĩ, Lễ tân ĐÚNG 403 KHONG_DU_QUYEN với mã đúng, mã lịch DaHuy, mã không tồn tại, mã sai dạng và thân sai; không đăng nhập hay token sai ⇒ 401', async () => {
    const w = await world();
    const lich = await book(w, 'DaXacNhan');
    await book(w, 'DaHuy', { code: CODE_2, slot: 1 });
    const before = await w.snapshot(lich, 0);
    const wrongRoles = [
      ['Bệnh nhân', w.patientId],
      ['Bác sĩ', w.doctor.account.taiKhoanId],
      ['Lễ tân', w.receptionId],
    ] as const;
    for (const [role, accountId] of wrongRoles) {
      const token = await tokenOf(accountId);
      for (const code of [CODE, CODE_2, MISSING, 'sai-dang'])
        for (const body of [
          { trangThai: 'DaHuy', lyDo: 'x' },
          { trangThai: 'VangMat', lyDo: 'x' },
          { trangThai: 'HoanThanh' },
          {},
          { benhNhanId: '1' },
        ]) {
          const res = await override(code, token, body);
          expect(res.status, `${role} ${code} ${JSON.stringify(body)}`).toBe(
            403,
          );
          expectErrorResponse(res, 403, FORBIDDEN);
        }
    }
    expect(await w.snapshot(lich, 0)).toEqual(before);
    expect(await readAudit(h.db)).toEqual([]);
    for (const code of [CODE, 'sai-dang']) {
      expectErrorResponse(await override(code), 401, NOT_LOGGED_IN);
      expectErrorResponse(
        await override(code, 'khong.phai.jwt'),
        401,
        INVALID_TOKEN,
      );
    }
    // Cả hai phạm vi đúng vai trò đều vào được: Toàn hệ thống DaXacNhan → DaTiepDon, rồi Chi nhánh DaTiepDon → DaXacNhan
    for (const [token, trangThai] of [
      [w.toan, 'DaTiepDon'],
      [w.chiNhanh, 'DaXacNhan'],
    ] as const)
      expect(
        (await override(CODE, token, { trangThai, lyDo: OVERRIDE_REASON }))
          .status,
        trangThai,
      ).toBe(200);
  });

  it('QB-08 Cache-Control: no-store ở 200, 400 do DTO, 404 do dịch vụ, 404 do pipe và 409 (401 và 403 do guard không hứa)', async () => {
    const w = await world();
    await book(w, 'DaHuy', { code: CODE_2, slot: 1 });
    await book(w, 'DaXacNhan');
    const responses = [
      await override(CODE_2, w.toan, { trangThai: 'DaHuy', lyDo: 'x' }),
      await override(MISSING, w.toan, { trangThai: 'DaHuy', lyDo: 'x' }),
      await override('sai-dang', w.toan, { trangThai: 'DaHuy', lyDo: 'x' }),
      await override(CODE, w.toan, { trangThai: 'DaHuy' }),
      await override(CODE, w.toan, { trangThai: 'DaHuy', lyDo: 'x' }),
    ];
    expect(responses.map((res) => res.status)).toEqual([
      409, 404, 404, 400, 200,
    ]);
    for (const res of responses)
      expect(res.headers['cache-control']).toBe('no-store');
  });

  it('QB-09 mã chữ thường và có khoảng trắng hai đầu (đã mã hoá phần trăm) được chuẩn hoá chữ hoa rồi mới tra: 200', async () => {
    const w = await world();
    await book(w, 'DaXacNhan');
    const res = await override(
      encodeURIComponent(` ${CODE.toLowerCase()} `),
      w.toan,
      { trangThai: 'VangMat', lyDo: 'Mã viết thường' },
    );
    expect(res.status).toBe(200);
    expect(bodyOf(res)).toMatchObject({
      maLichHen: CODE,
      trangThai: 'VangMat',
    });
  });

  it('QB-10, OVR-08 khoá tài khoản giữa hai request ⇒ request sau 401 PHIEN_HET_HIEU_LUC; đổi vai trò ⇒ 403; ĐỔI PHẠM VI của Quản trị viên Chi nhánh có hiệu lực ở request sau (đọc từ DB mỗi request); lịch không đổi', async () => {
    const w = await world();
    const lich = await book(w, 'DaXacNhan');
    const before = await w.snapshot(lich, 0);
    const adminId = scopeOf(w, 'ChiNhanh').accountId;
    await h.db.query(
      'UPDATE quan_tri_vien SET chi_nhanh_id = ? WHERE tai_khoan_id = ?',
      [w.otherBranch.chiNhanhId, adminId],
    );
    expect(
      (await override(CODE, w.chiNhanh, { trangThai: 'DaTiepDon', lyDo: 'x' }))
        .text,
    ).toBe(NOT_FOUND_TEXT);
    await h.db.query(
      'UPDATE quan_tri_vien SET chi_nhanh_id = ? WHERE tai_khoan_id = ?',
      [w.branch.chiNhanhId, adminId],
    );
    expect(await w.snapshot(lich, 0)).toEqual(before);

    await h.db.query(
      "UPDATE tai_khoan SET trang_thai = 'NgungHoatDong' WHERE tai_khoan_id = ?",
      [adminId],
    );
    expectErrorResponse(
      await override(CODE, w.chiNhanh, { trangThai: 'DaTiepDon', lyDo: 'x' }),
      401,
      SESSION_INACTIVE,
    );
    expect(await w.snapshot(lich, 0)).toEqual(before);

    await h.db.query(
      "UPDATE tai_khoan SET trang_thai = 'DangHoatDong', loai_tai_khoan = 'LeTan' WHERE tai_khoan_id = ?",
      [adminId],
    );
    const afterRoleChange = await tokenOf(adminId);
    expectErrorResponse(
      await override(CODE, afterRoleChange, {
        trangThai: 'VangMat',
        lyDo: 'x',
      }),
      403,
      FORBIDDEN,
    );
    expect(await w.snapshot(lich, 0)).toEqual(before);
    expect(await readAudit(h.db)).toEqual([]);
  });
});

describe('POST …/override-status — audit lỗi (CT-18 qua HTTP)', () => {
  it(
    'AuditError ném trong giao dịch ⇒ 500 LOI_HE_THONG (thân KHÔNG lộ mã nội bộ của audit); lịch, khung giờ, bộ đếm no-show và nhật ký như TRƯỚC, ở cả bốn đích',
    async () => {
      const w = await world();
      const audit = h.app.get(AuditService, { strict: false });
      const record = vi
        .spyOn(audit, 'record')
        .mockRejectedValue(new AuditError('AUDIT_WRITE_FAILED'));
      for (const [from, to] of [
        ['DaXacNhan', 'DaHuy'],
        ['DaXacNhan', 'VangMat'],
        ['VangMat', 'DaTiepDon'],
        ['DaTiepDon', 'DaXacNhan'],
      ] as const) {
        await resetBookingRound(h.db);
        const lich = await book(w, from);
        const before = await w.snapshot(lich, 0);
        const res = await override(CODE, w.toan, {
          trangThai: to,
          lyDo: OVERRIDE_REASON,
        });
        const body = expectErrorResponse(res, 500, 'LOI_HE_THONG');
        expect(JSON.stringify(body)).not.toContain('AUDIT_');
        expect(await w.snapshot(lich, 0), `${from} ${to}`).toEqual(before);
        expect(await readNoShow(h.db, w.patientId)).toEqual({
          soLan: 0,
          khoa: false,
        });
        expect(await readAudit(h.db)).toEqual([]);
      }
      expect(record).toHaveBeenCalledTimes(4);
      await assertBookingInvariants(h.db);
    },
    SLOW,
  );
});
