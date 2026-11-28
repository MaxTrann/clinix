import request from 'supertest';
import { vi } from 'vitest';
import {
  collectKeys,
  collectStrings,
} from './../src/appointments/testing/response-keys.js';
import { captureNestLogger } from './../src/auth/testing/otp-int-helpers.js';
import {
  openRefreshHarness,
  type RefreshHarness,
} from './../src/auth/testing/refresh-http-helpers.js';
import { expectErrorResponse } from './../src/common/testing/error-assertions.js';
import type { AdminDashboard } from './../src/dashboard/admin/admin-dashboard.dto.js';
import { ADMIN_DASHBOARD_KEYS } from './../src/dashboard/admin/admin-dashboard.dto.js';
import {
  D0_NOW,
  DashboardFixtures,
  type D0World,
} from './../src/dashboard/testing/dashboard-fixtures.js';
import { resetTables } from './../src/database/testing/test-database.js';

// dashboard B1, B2 — `GET /admin/dashboard` qua HTTP THẬT (AppModule, MySQL thật, `configureApp` như main.ts): DQP-01…DQP-04, DBL-01…DBL-07, DRG-04 (B1); DRG-01, DCD-02, DCD-03 (B2) (PLAN dashboard 7.1, 7.2, 7.4, 7.5).
// Số liệu chi tiết từng chỉ số ở `src/dashboard/admin/admin-dashboard.int-spec.ts`. ĐỒNG HỒ: `vi.setSystemTime` đổi giờ của cả token, nên tạo token SAU khi đặt giờ.
const PATH = '/admin/dashboard';
const RANGE = '?tuNgay=2026-12-01&denNgay=2026-12-07';
const INVALID_DATA = 'DU_LIEU_KHONG_HOP_LE';
const NOT_FOUND_TEXT =
  '{"maLoi":"KHONG_TIM_THAY","thongBao":"Không tìm thấy dữ liệu."}';

let h: RefreshHarness;
let dfx: DashboardFixtures;

beforeAll(async () => {
  h = await openRefreshHarness();
  dfx = new DashboardFixtures(h.db);
});

beforeEach(async () => {
  await resetTables(h.db);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(D0_NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await resetTables(h.db);
  await h.close();
});

const get = (query: string, accessToken?: string) => {
  const req = request(h.app.getHttpServer()).get(`${PATH}${query}`);
  return accessToken ? req.set('Authorization', `Bearer ${accessToken}`) : req;
};
const tokenOf = async (accountId: string) =>
  (await h.sessions.create(accountId)).accessToken;
const bodyOf = (res: { body: unknown }) => res.body as AdminDashboard;

/** Bộ D0 kèm token của mọi vai trò cần thử. */
async function world(): Promise<
  D0World & {
    toan: string;
    a: string;
    b: string;
    patientToken: string;
    doctorToken: string;
    receptionToken: string;
  }
> {
  const w = await dfx.d0();
  return {
    ...w,
    toan: await tokenOf(w.systemAdmin.account.taiKhoanId),
    a: await tokenOf(w.adminA.account.taiKhoanId),
    b: await tokenOf(w.adminB.account.taiKhoanId),
    patientToken: await tokenOf(w.patient.account.taiKhoanId),
    doctorToken: await tokenOf(w.d1.account.taiKhoanId),
    receptionToken: await tokenOf(w.receptionistA.account.taiKhoanId),
  };
}

/** 400 `DU_LIEU_KHONG_HOP_LE` với đúng danh sách `loi`. */
function expectFieldErrors(
  res: request.Response,
  loi: { truong: string; ma: string }[],
): void {
  const body = expectErrorResponse(res, 400, INVALID_DATA);
  expect(body.loi).toStrictEqual(loi);
}

describe('GET /admin/dashboard — quyền và phạm vi', () => {
  it('DQP-01: khách 401; Bệnh nhân, Bác sĩ, Lễ tân 403 KHONG_DU_QUYEN (kể cả query sai); hai loại Quản trị viên 200', async () => {
    const w = await world();
    expectErrorResponse(await get(RANGE), 401, 'CHUA_DANG_NHAP');
    for (const token of [w.patientToken, w.doctorToken, w.receptionToken]) {
      expectErrorResponse(await get(RANGE, token), 403, 'KHONG_DU_QUYEN');
      // Guard chạy trước pipe: query sai vẫn là 403, không lộ hình dạng bộ lọc
      expectErrorResponse(
        await get('?tuNgay=abc&la=1', token),
        403,
        'KHONG_DU_QUYEN',
      );
    }
    expect((await get(RANGE, w.toan)).status).toBe(200);
    expect((await get(RANGE, w.a)).status).toBe(200);
  });

  it('DQP-02: Quản trị viên Chi nhánh không gửi `chiNhanhId` ⇒ số của chi nhánh được gán, `boLoc.chiNhanhId` là chi nhánh đó', async () => {
    const w = await world();
    const res = await get(RANGE, w.a);
    expect(res.status).toBe(200);
    expect(bodyOf(res)).toMatchObject({
      boLoc: { chiNhanhId: w.branchA },
      trongKhoang: { lichKham: 5, hoanThanh: 2 },
      vangMat: { tuSo: 1, mauSo: 4 },
    });
    expect(bodyOf(await get(RANGE, w.b)).boLoc.chiNhanhId).toBe(w.branchB);
  });

  it('DQP-03: Quản trị viên A gửi A ⇒ 200; gửi B ⇒ 404; gửi id không tồn tại ⇒ 404 CÙNG THÂN với gửi B', async () => {
    const w = await world();
    const own = await get(`${RANGE}&chiNhanhId=${w.branchA}`, w.a);
    expect(own.status).toBe(200);
    expect(bodyOf(own)).toStrictEqual(bodyOf(await get(RANGE, w.a)));
    const other = await get(`${RANGE}&chiNhanhId=${w.branchB}`, w.a);
    const missing = await get(`${RANGE}&chiNhanhId=999999999`, w.a);
    expectErrorResponse(other, 404, 'KHONG_TIM_THAY');
    expectErrorResponse(missing, 404, 'KHONG_TIM_THAY');
    expect(other.text).toBe(NOT_FOUND_TEXT);
    expect(missing.text).toBe(other.text);
  });

  it('DQP-04: Toàn hệ thống không gửi ⇒ tất cả; gửi B ⇒ số của B; gửi id không tồn tại ⇒ 404', async () => {
    const w = await world();
    const all = bodyOf(await get(RANGE, w.toan));
    expect(all.boLoc.chiNhanhId).toBeNull();
    expect(all.trongKhoang).toStrictEqual({ lichKham: 7, hoanThanh: 3 });
    const b = await get(`${RANGE}&chiNhanhId=${w.branchB}`, w.toan);
    expect(bodyOf(b)).toMatchObject({
      boLoc: { chiNhanhId: w.branchB },
      trongKhoang: { lichKham: 2, hoanThanh: 1 },
      khungGio: { tuSo: 2, mauSo: 4 },
    });
    const missing = await get(`${RANGE}&chiNhanhId=999999999`, w.toan);
    expectErrorResponse(missing, 404, 'KHONG_TIM_THAY');
    expect(missing.text).toBe(NOT_FOUND_TEXT);
  });
});

describe('GET /admin/dashboard — bộ lọc', () => {
  it.each([
    ['00:00:00', '2026-12-04T00:00:00+07:00', '2026-11-05', '2026-12-04'],
    ['23:59:59', '2026-12-04T23:59:59+07:00', '2026-11-05', '2026-12-04'],
    [
      '23:59:59 hôm trước',
      '2026-12-03T23:59:59+07:00',
      '2026-11-04',
      '2026-12-03',
    ],
  ])(
    'DBL-01 (E): không gửi ngày, đồng hồ ở %s giờ Việt Nam ⇒ 30 ngày kết thúc đúng hôm nay',
    async (_label, instant, tuNgay, denNgay) => {
      const w = await dfx.d0();
      vi.setSystemTime(new Date(instant));
      const token = await tokenOf(w.systemAdmin.account.taiKhoanId);
      const body = bodyOf(await get('', token));
      expect(body.boLoc).toStrictEqual({ tuNgay, denNgay, chiNhanhId: null });
      expect(body.homNay.ngay).toBe(denNgay);
    },
  );

  it('DBL-02: chỉ gửi `tuNgay` hoặc chỉ `denNgay` ⇒ 400, ngày đã gửi báo KHOANG_NGAY_KHONG_HOP_LE', async () => {
    const w = await world();
    expectFieldErrors(await get('?tuNgay=2026-12-01', w.toan), [
      { truong: 'tuNgay', ma: 'KHOANG_NGAY_KHONG_HOP_LE' },
    ]);
    expectFieldErrors(await get('?denNgay=2026-12-07', w.toan), [
      { truong: 'denNgay', ma: 'KHOANG_NGAY_KHONG_HOP_LE' },
    ]);
  });

  it('DBL-03: ngày không có thật, chữ ⇒ NGAY_KHONG_HOP_LE; `denNgay` trước `tuNgay` ⇒ KHOANG_NGAY_KHONG_HOP_LE', async () => {
    const w = await world();
    expectFieldErrors(
      await get('?tuNgay=2026-02-30&denNgay=2026-03-05', w.toan),
      [{ truong: 'tuNgay', ma: 'NGAY_KHONG_HOP_LE' }],
    );
    expectFieldErrors(await get('?tuNgay=2026-12-01&denNgay=abc', w.toan), [
      { truong: 'denNgay', ma: 'NGAY_KHONG_HOP_LE' },
    ]);
    expectFieldErrors(
      await get('?tuNgay=2026-12-07&denNgay=2026-12-01', w.toan),
      [{ truong: 'denNgay', ma: 'KHOANG_NGAY_KHONG_HOP_LE' }],
    );
  });

  it('DBL-04 (E): 366 ngày nhận (khoảng chứa 29/02/2028); 367 ngày ⇒ KHOANG_NGAY_QUA_DAI', async () => {
    const w = await world();
    const ok = await get('?tuNgay=2027-03-01&denNgay=2028-02-29', w.toan);
    expect(ok.status).toBe(200);
    expect(bodyOf(ok).boLoc).toMatchObject({
      tuNgay: '2027-03-01',
      denNgay: '2028-02-29',
    });
    expectFieldErrors(
      await get('?tuNgay=2027-02-28&denNgay=2028-02-29', w.toan),
      [{ truong: 'denNgay', ma: 'KHOANG_NGAY_QUA_DAI' }],
    );
  });

  it('DBL-05: khoá lạ ⇒ TRUONG_KHONG_DUOC_PHEP; `chiNhanhId` là chữ, số âm, 0, quá BIGINT ⇒ CHI_NHANH_KHONG_HOP_LE', async () => {
    const w = await world();
    expectFieldErrors(await get(`${RANGE}&trangThai=VangMat`, w.toan), [
      { truong: 'trangThai', ma: 'TRUONG_KHONG_DUOC_PHEP' },
    ]);
    for (const bad of ['abc', '-1', '0', '9223372036854775808', '1.5']) {
      expectFieldErrors(await get(`${RANGE}&chiNhanhId=${bad}`, w.toan), [
        { truong: 'chiNhanhId', ma: 'CHI_NHANH_KHONG_HOP_LE' },
      ]);
    }
    // Biên: số lớn nhất của BIGINT đúng dạng, không tồn tại ⇒ 404 (không phải 400)
    expectErrorResponse(
      await get(`${RANGE}&chiNhanhId=9223372036854775807`, w.toan),
      404,
      'KHONG_TIM_THAY',
    );
  });

  it('DBL-06: khoảng toàn ngày tương lai ⇒ 200 (khung giờ sắp tới vẫn đếm)', async () => {
    const w = await world();
    const res = await get('?tuNgay=2026-12-08&denNgay=2026-12-09', w.toan);
    expect(res.status).toBe(200);
    expect(bodyOf(res).khungGio).toStrictEqual({
      tuSo: 2,
      mauSo: 8,
      phanTram: 25,
    });
  });

  it('DBL-07: `Cache-Control: no-store` ở 200, 400 và 404', async () => {
    const w = await world();
    const responses = [
      await get(RANGE, w.toan),
      await get('?tuNgay=abc', w.toan),
      await get(`${RANGE}&chiNhanhId=${w.branchB}`, w.a),
    ];
    expect(responses.map((res) => res.status)).toStrictEqual([200, 400, 404]);
    for (const res of responses)
      expect(res.headers['cache-control']).toBe('no-store');
  });
});

describe('GET /admin/dashboard — riêng tư', () => {
  it('DRG-04: chỉ khoá cho phép; không họ tên, SĐT, email, mã lịch; log của request không có số liệu', async () => {
    const w = await world();
    const logs = captureNestLogger();
    const res = await get(`${RANGE}&chiNhanhId=${w.branchA}`, w.toan);
    expect(res.status).toBe(200);
    const body = bodyOf(res);
    expect(Object.keys(body).sort()).toStrictEqual([...ADMIN_DASHBOARD_KEYS]);
    const allowedKeys = new Set([
      ...ADMIN_DASHBOARD_KEYS,
      'tuNgay',
      'denNgay',
      'chiNhanhId',
      'ngay',
      'lichKham',
      'hoanThanh',
      'tuSo',
      'mauSo',
      'phanTram',
      'soKhoan',
      'tongTien',
      'soKhoanDangLoi',
      'donVi',
      'diem',
      'soLuong',
      'nghiPhep',
      'doiLich',
      'thayDoiChiNhanh',
      'rutTien',
    ]);
    expect(
      collectKeys(body).filter((key) => !allowedKeys.has(key)),
    ).toStrictEqual([]);
    // Chuỗi duy nhất là ngày, giờ cập nhật, id chi nhánh, đơn vị biểu đồ và tổng tiền: không dữ liệu nào của bệnh nhân, bác sĩ, lịch hay giao dịch
    const allowedStrings = new Set([
      ...[1, 2, 3, 4, 5, 6, 7].map((day) => `2026-12-0${day}`),
      D0_NOW.toISOString(),
      w.branchA,
      'Ngay',
      '620000.00',
      '230000.00',
    ]);
    expect(
      collectStrings(body).filter((s) => !allowedStrings.has(s)),
    ).toStrictEqual([]);
    const text = JSON.stringify(body);
    for (const secret of [
      w.patient.account.email,
      w.patient.account.hoTen,
      w.d1.account.hoTen,
    ])
      expect(text).not.toContain(secret);
    expect(logs.join('\n')).not.toMatch(
      /lichKham|vangMat|khungGio|tongTien|620000/,
    );
  });

  it('DRG-01: khoảng không có dữ liệu (03/2027) ⇒ số 0, tỉ lệ null, `coDuLieu` false, xu hướng đủ điểm 0; chờ duyệt và khoản lỗi vẫn đúng', async () => {
    const w = await world();
    const res = await get('?tuNgay=2027-03-01&denNgay=2027-03-31', w.toan);
    expect(res.status).toBe(200);
    const body = bodyOf(res);
    expect(body).toMatchObject({
      trongKhoang: { lichKham: 0, hoanThanh: 0 },
      vangMat: { tuSo: 0, mauSo: 0, phanTram: null },
      khungGio: { tuSo: 0, mauSo: 0, phanTram: null },
      tienCoc: { soKhoan: 0, tongTien: '0.00' },
      hoanTien: { soKhoan: 0, tongTien: '0.00', soKhoanDangLoi: 1 },
      choDuyet: { nghiPhep: 2, doiLich: 3, thayDoiChiNhanh: 1, rutTien: 2 },
      coDuLieu: false,
    });
    expect(body.xuHuong.donVi).toBe('Ngay');
    expect(body.xuHuong.diem).toHaveLength(31);
    expect(body.xuHuong.diem.every((point) => point.soLuong === 0)).toBe(true);
    // Đối chứng: khoảng chuẩn có dữ liệu
    expect(bodyOf(await get(RANGE, w.toan)).coDuLieu).toBe(true);
  });
});

describe('GET /admin/dashboard — yêu cầu chờ duyệt', () => {
  it('DCD-02: Quản trị viên Chi nhánh nhận `rutTien` là `null` (không phải 0); Toàn hệ thống nhận số', async () => {
    const w = await world();
    const a = bodyOf(await get(RANGE, w.a));
    expect(a.choDuyet).toStrictEqual({
      nghiPhep: 1,
      doiLich: 2,
      thayDoiChiNhanh: 1,
      rutTien: null,
    });
    expect('rutTien' in a.choDuyet).toBe(true);
    expect(bodyOf(await get(RANGE, w.toan)).choDuyet.rutTien).toBe(2);
  });

  it('DCD-03: số chờ duyệt bằng `total` của chính bốn danh sách duyệt hiện có, cùng phạm vi, trạng thái chờ', async () => {
    const w = await world();
    const totalOf = async (path: string, token: string) => {
      const res = await request(h.app.getHttpServer())
        .get(path)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      return (res.body as { total: number }).total;
    };
    for (const token of [w.toan, w.a, w.b]) {
      const choDuyet = bodyOf(await get(RANGE, token)).choDuyet;
      expect(choDuyet.nghiPhep).toBe(
        await totalOf('/admin/leave-requests?trangThai=ChoDuyet', token),
      );
      expect(choDuyet.doiLich).toBe(
        await totalOf('/admin/reschedule-requests?trangThai=ChoDuyet', token),
      );
      expect(choDuyet.thayDoiChiNhanh).toBe(
        await totalOf(
          '/admin/branch-change-requests?trangThai=ChoDuyet',
          token,
        ),
      );
    }
    // Rút tiền chỉ Toàn hệ thống xem được (trang duyệt cũng chỉ cho Toàn hệ thống)
    expect(bodyOf(await get(RANGE, w.toan)).choDuyet.rutTien).toBe(
      await totalOf('/admin/wallet/withdrawals?trangThai=ChoDuyet', w.toan),
    );
  });
});
