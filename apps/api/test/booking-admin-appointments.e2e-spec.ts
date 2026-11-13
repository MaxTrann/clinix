import request from 'supertest';
import { vi } from 'vitest';
import type { AdminAppointmentDetail } from './../src/appointments/lists/admin-appointments.dto.js';
import type { OperationsAppointmentsPage } from './../src/appointments/lists/operations-appointments.dto.js';
import {
  ADMIN_DETAIL_KEYS,
  ADMIN_ITEM_KEYS,
  ADMIN_ROOT_KEYS,
  AdminListFixtures,
} from './../src/appointments/testing/admin-list-fixtures.js';
import {
  AppointmentListFixtures,
  DOCTOR_PHONE,
} from './../src/appointments/testing/appointment-list-fixtures.js';
import { BookingFixtures } from './../src/appointments/testing/booking-fixtures.js';
import {
  CODES,
  OperationsListFixtures,
  PATIENT_ONE,
  PATIENT_TWO,
} from './../src/appointments/testing/operations-list-fixtures.js';
import {
  collectKeys,
  collectStrings,
  FORBIDDEN_KEY,
} from './../src/appointments/testing/response-keys.js';
import { T0 } from './../src/auth/testing/otp-int-helpers.js';
import {
  openRefreshHarness,
  type RefreshHarness,
} from './../src/auth/testing/refresh-http-helpers.js';
import { expectErrorResponse } from './../src/common/testing/error-assertions.js';
import { resetTables } from './../src/database/testing/test-database.js';

// Task B4 — GET /admin/appointments và /:maLichHen qua HTTP THẬT: AppModule + MySQL thật + configureApp như main.ts (PLAN booking 5.9, 7.7, 7.9, 7.39; TRACKING 3.33.3). Phần tầng dịch vụ và SQL:
// src/appointments/lists/admin-appointments.int-spec.ts, appointment-history.reader.int-spec.ts. Mã DSV-nn, QB-nn là PLAN 7.7, 7.9; ADL-nn, LSD-nn là 7.39 `[đề xuất]`. QB-nn chỉ phần route đọc của B4 (route override là
// B14; chưa tính Pass khi một trong hai chưa ở `main`). Dòng nhật ký override ghi bằng SQL thô (không qua mã của B14). Dữ liệu giả (email đuôi example.com, SĐT minh hoạ).
// CA ADL-06 khẳng định ĐÚNG 403 KHONG_DU_QUYEN ở cả query sai lẫn mã sai dạng (guard chạy trước pipe). LƯU Ý: `@RequireAdminScope('Any')` đứng cạnh `@Roles('QuanTriVien')` và cũng trả 403 cho vai trò khác, nên bỏ
// riêng `@Roles` KHÔNG làm ca này đỏ; AR-02 (`architecture.spec.ts`) mới là lớp bắt đột biến đó.
// ĐỒNG HỒ: `vi.setSystemTime` đổi giờ của CẢ token truy cập, nên mọi token tạo SAU khi đặt giờ.
const PATH = '/admin/appointments';
const NOT_LOGGED_IN = 'CHUA_DANG_NHAP';
const INVALID_TOKEN = 'TOKEN_KHONG_HOP_LE';
const SESSION_INACTIVE = 'PHIEN_HET_HIEU_LUC';
const FORBIDDEN = 'KHONG_DU_QUYEN';
const INVALID_DATA = 'DU_LIEU_KHONG_HOP_LE';
const NOT_ALLOWED = 'TRUONG_KHONG_DUOC_PHEP';
const NOT_FOUND = 'KHONG_TIM_THAY';
const BAD_REQUEST = 'YEU_CAU_KHONG_HOP_LE';
const KEYWORD = 'TU_KHOA_KHONG_HOP_LE';
// Thân 404 chung (patient Q27): giống từng ký tự ở mọi nhánh, kể cả mã sai dạng bị pipe từ chối
const NOT_FOUND_TEXT =
  '{"maLoi":"KHONG_TIM_THAY","thongBao":"Không tìm thấy dữ liệu."}';

let h: RefreshHarness;
let fx: BookingFixtures;
let afx: AdminListFixtures;

beforeAll(async () => {
  h = await openRefreshHarness();
  fx = new BookingFixtures(h.db);
});

beforeEach(async () => {
  await resetTables(h.db);
  h.mail.reset();
  // Bộ nhớ khung giờ đã dùng của fixture phải làm lại sau mỗi lần xoá bảng
  const lf = new AppointmentListFixtures(fx, h.db);
  afx = new AdminListFixtures(
    fx,
    new OperationsListFixtures(fx, lf, h.db),
    h.db,
  );
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

// `path` là phần SAU `/admin/appointments` (bắt đầu bằng `?` hoặc `/`), viết thẳng (đã mã hoá phần trăm nếu cần)
const get = (path: string, accessToken?: string) => {
  const req = request(h.app.getHttpServer()).get(`${PATH}${path}`);
  return accessToken ? req.set('Authorization', `Bearer ${accessToken}`) : req;
};
const tokenOf = async (accountId: string) =>
  (await h.sessions.create(accountId)).accessToken;
const pageOf = (res: { body: unknown }) =>
  res.body as OperationsAppointmentsPage;
const detailOf = (res: { body: unknown }) => res.body as AdminAppointmentDetail;
const codesOf = (res: { body: unknown }) =>
  pageOf(res).items.map((item) => item.maLichHen);

// Giảm dần: a7 15/11, a6 14/11, a4 12/11, a3 11/11, a2 10/11 08:30, rồi a1 và b1 cùng 10/11 08:00 (`lich_hen_id` lớn hơn trước: b1 trước a1)
const DESC_A = [CODES.a7, CODES.a6, CODES.a4, CODES.a3, CODES.a2, CODES.a1];
const DESC_ALL = [
  CODES.a7,
  CODES.a6,
  CODES.a4,
  CODES.a3,
  CODES.a2,
  CODES.b1,
  CODES.a1,
];
const iso = (vn: string) =>
  new Date(`${vn.replace(' ', 'T')}+07:00`).toISOString();

// Hai chi nhánh (`AdminListFixtures.world`) kèm token của Quản trị viên Toàn hệ thống (`toan`) và của hai Quản trị viên Chi nhánh (`a`, `b`)
async function world() {
  const w = await afx.world();
  return {
    ...w,
    toan: await tokenOf(w.systemAdmin.account.taiKhoanId),
    a: await tokenOf(w.adminA.account.taiKhoanId),
    b: await tokenOf(w.adminB.account.taiKhoanId),
  };
}

describe('GET /admin/appointments — phạm vi, thứ tự, hình dạng', () => {
  it('DSV-02, ADL-01 Quản trị viên Chi nhánh chỉ thấy chi nhánh được gán, sắp GIẢM dần; `chiNhanhId` đúng dạng (chi nhánh khác, không tồn tại) bị BỎ QUA ở cả hai chi nhánh', async () => {
    const w = await world();
    const a = await get('', w.a);
    expect(a.status).toBe(200);
    expect(codesOf(a)).toStrictEqual(DESC_A);
    expect(pageOf(a)).toMatchObject({ total: 6, page: 1, pageSize: 20 });
    expect(codesOf(await get('', w.b))).toStrictEqual([CODES.b1]);
    for (const chiNhanhId of [w.branchB.chiNhanhId, '999999999'])
      expect((await get(`?chiNhanhId=${chiNhanhId}`, w.a)).body).toStrictEqual(
        a.body,
      );
    expect(
      codesOf(await get(`?chiNhanhId=${w.branchA.chiNhanhId}`, w.b)),
    ).toStrictEqual([CODES.b1]);
  });

  it('DSV-03, ADL-01 Toàn hệ thống: không `chiNhanhId` thấy mọi chi nhánh, có thì chỉ chi nhánh đó, chi nhánh không tồn tại ⇒ 200 rỗng (không 404)', async () => {
    const w = await world();
    const all = await get('', w.toan);
    expect(codesOf(all)).toStrictEqual(DESC_ALL);
    expect(pageOf(all).total).toBe(7);
    expect(
      codesOf(await get(`?chiNhanhId=${w.branchA.chiNhanhId}`, w.toan)),
    ).toStrictEqual(DESC_A);
    expect(
      codesOf(await get(`?chiNhanhId=${w.branchB.chiNhanhId}`, w.toan)),
    ).toStrictEqual([CODES.b1]);
    const none = await get('?chiNhanhId=999999999', w.toan);
    expect(none.status).toBe(200);
    expect(none.body).toStrictEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });
  });

  it('ADL-02, DSV-08 quét JSON danh sách: bốn khoá ở gốc, mười một khoá mỗi dòng; không khoá lộ id, email, băm, ngày sinh; SĐT chỉ của NGƯỜI ĐẶT; không SĐT, email bác sĩ', async () => {
    const w = await world();
    const res = await get('', w.toan);
    expect(Object.keys(res.body as object).sort()).toStrictEqual(
      ADMIN_ROOT_KEYS,
    );
    for (const item of pageOf(res).items)
      expect(Object.keys(item).sort()).toStrictEqual(ADMIN_ITEM_KEYS);
    expect(
      collectKeys(res.body).filter((key) => FORBIDDEN_KEY.test(key)),
    ).toStrictEqual([]);
    const text = JSON.stringify(res.body);
    const doctorEmail = await h.db.query<{ email: string }[]>(
      'SELECT email FROM tai_khoan WHERE tai_khoan_id = ?',
      [w.doctorA1.account.taiKhoanId],
    );
    expect(text).not.toContain(DOCTOR_PHONE);
    expect(text).not.toContain(doctorEmail[0]?.email ?? '?');
    expect(text).not.toContain('argon2');
    const phones = new Set(
      collectStrings(res.body).filter((value) => /^0\d{9}$/.test(value)),
    );
    expect([...phones].sort()).toStrictEqual(
      [PATIENT_ONE.soDienThoai, PATIENT_TWO.soDienThoai].sort(),
    );
  });

  it('DSV-12 mặc định không có DaDoiLich; `trangThai=DaDoiLich` hiện đúng dòng đó, ở cả hai phạm vi', async () => {
    const w = await world();
    expect(codesOf(await get('', w.toan))).not.toContain(CODES.a5);
    for (const token of [w.toan, w.a])
      expect(codesOf(await get('?trangThai=DaDoiLich', token))).toStrictEqual([
        CODES.a5,
      ]);
  });

  it('ADL-09 `pageSize` 100 được, 101 ⇒ 400 MAX; `page=0` ⇒ 400 MIN; trang vượt cuối và `page` cực lớn ⇒ 200 rỗng với `total` đúng, không 500', async () => {
    const w = await world();
    expect((await get('?pageSize=100', w.toan)).status).toBe(200);
    for (const [query, code] of [
      ['?pageSize=101', 'MAX'],
      ['?page=0', 'MIN'],
    ] as const) {
      const res = await get(query, w.toan);
      expectErrorResponse(res, 400, INVALID_DATA);
      expect(JSON.stringify(res.body), query).toContain(code);
    }
    expect((await get('?page=5&pageSize=2', w.toan)).body).toStrictEqual({
      items: [],
      total: 7,
      page: 5,
      pageSize: 2,
    });
    const huge = await get('?page=9007199254740991&pageSize=100', w.toan);
    expect(huge.status).toBe(200);
    expect(pageOf(huge)).toMatchObject({ items: [], total: 7 });
  });
});

describe('GET /admin/appointments — kiểm query (ADL-05, QB-03)', () => {
  it('ADL-05 `thanhToan` ẩn tới khi có `payment`: lọc `thanhToan` ⇒ 400 TRUONG_KHONG_DUOC_PHEP ở cả hai phạm vi; dòng và chi tiết không có khoá `thanhToan`', async () => {
    const w = await world();
    for (const token of [w.toan, w.a]) {
      const body = expectErrorResponse(
        await get('?thanhToan=DaThanhToanDu', token),
        400,
        INVALID_DATA,
      );
      expect(body.loi?.map((e) => e.ma)).toStrictEqual([NOT_ALLOWED]);
    }
    const list = await get('', w.toan);
    const detail = await get(`/${CODES.a1}`, w.toan);
    for (const res of [list, detail])
      expect(collectKeys(res.body)).not.toContain('thanhToan');
  });

  it('QB-03 khoá không khai (`benhNhanId`, `nhom`, `hoSoNguoiThanId`, `sapXep`) ⇒ 400 TRUONG_KHONG_DUOC_PHEP, quyền không đổi; id lọc sai dạng, trạng thái lạ, `q` sai ⇒ 400 đúng mã ràng buộc', async () => {
    const w = await world();
    for (const query of [
      `?benhNhanId=${w.oneId}`,
      '?nhom=SapToi',
      '?hoSoNguoiThanId=BanThan',
      '?sapXep=MoiNhat',
    ]) {
      const body = expectErrorResponse(
        await get(query, w.toan),
        400,
        INVALID_DATA,
      );
      expect(
        body.loi?.map((e) => e.ma),
        query,
      ).toStrictEqual([NOT_ALLOWED]);
    }
    for (const [query, code] of [
      ['?bacSiId=abc', 'IS_BIGINT_ID'],
      ['?chiNhanhId=x', 'IS_BIGINT_ID'],
      ['?trangThai=HoanTat', 'IS_IN'],
      ['?tuNgay=2026-13-45', 'IS_CALENDAR_DATE'],
      ['?q=a', KEYWORD],
    ] as const) {
      const res = await get(query, w.toan);
      expectErrorResponse(res, 400, INVALID_DATA);
      expect(JSON.stringify(res.body), query).toContain(code);
    }
  });
});

describe('GET /admin/appointments/:maLichHen — chi tiết', () => {
  it('ADL-02, ADL-03, ADL-04 đúng 17 khoá; lịch DaXacNhan: chuyenDuoc theo ma trận Q24, `conPhaiThu` bằng giá (bản Noop); không `thanhToan`, `lichHenId`, email, SĐT bác sĩ', async () => {
    const w = await world();
    const res = await get(`/${CODES.a1}`, w.a);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body as object).sort()).toStrictEqual(
      ADMIN_DETAIL_KEYS,
    );
    expect(detailOf(res)).toMatchObject({
      maLichHen: CODES.a1,
      trangThai: 'DaXacNhan',
      bacSi: 'Bác Sĩ Một',
      nguoiDat: {
        hoTen: PATIENT_ONE.hoTen,
        soDienThoai: PATIENT_ONE.soDienThoai,
      },
      nguoiKham: { hoTen: PATIENT_ONE.hoTen, laBanThan: true },
      lyDoKham: 'Đau đầu ba ngày',
      lyDoHuy: null,
      chuyenDuoc: ['DaTiepDon', 'DaHuy', 'VangMat'],
      conPhaiThu: '100000.00',
    });
    expect(
      collectKeys(res.body).filter((key) => FORBIDDEN_KEY.test(key)),
    ).toStrictEqual([]);
    expect(JSON.stringify(res.body)).not.toContain(DOCTOR_PHONE);
    expect(detailOf(await get(`/${CODES.a2}`, w.a))).toMatchObject({
      chuyenDuoc: ['DaHuy'],
      conPhaiThu: null,
    });
    expect(detailOf(await get(`/${CODES.a3}`, w.a))).toMatchObject({
      chuyenDuoc: [],
      conPhaiThu: null,
    });
    expect(
      detailOf(await get(`/${CODES.a6}`, w.toan)).chuyenDuoc,
    ).toStrictEqual(['DaXacNhan', 'DaTiepDon', 'DaHuy']);
  });

  it('DSV-09, QB-05 lịch CHI NHÁNH KHÁC và mã không tồn tại: 404 KHONG_TIM_THAY, thân giống từng ký tự; Toàn hệ thống và chi nhánh của lịch vẫn 200; hai chiều A và B', async () => {
    const w = await world();
    for (const [path, token] of [
      [`/${CODES.b1}`, w.a],
      [`/${CODES.a1}`, w.b],
      [`/${CODES.missing}`, w.a],
      [`/${CODES.b1.toLowerCase()}`, w.a],
      [`/${CODES.b1}?chiNhanhId=${w.branchB.chiNhanhId}`, w.a],
    ] as const) {
      const res = await get(path, token);
      expectErrorResponse(res, 404, NOT_FOUND);
      expect(res.text, path).toBe(NOT_FOUND_TEXT);
    }
    expect((await get(`/${CODES.b1}`, w.toan)).status).toBe(200);
    expect((await get(`/${CODES.b1}`, w.b)).status).toBe(200);
    expect((await get(`/${CODES.a1}`, w.a)).status).toBe(200);
  });

  it('QB-09 chữ thường, lẫn lộn và khoảng trắng hai đầu được chuẩn hoá (200, cùng lịch); mã sai dạng, quá dài, chữ cấm: 404 thân giống "không tồn tại", không bao giờ 400 hay 500', async () => {
    const w = await world();
    const canonical = detailOf(await get(`/${CODES.a1}`, w.a));
    for (const path of [
      CODES.a1.toLowerCase(),
      'cLx-20261110-aAa01',
      `%20${CODES.a1}%20`,
    ]) {
      const res = await get(`/${path}`, w.a);
      expect(res.status, path).toBe(200);
      expect(res.body, path).toStrictEqual(canonical);
    }
    for (const path of [
      'CLX-20261110-IBCDE',
      'CLX-20261110-AAA0',
      '0',
      'A'.repeat(2000),
      "'%20OR%201=1--",
    ]) {
      const res = await get(`/${path}`, w.a);
      expectErrorResponse(res, 404, NOT_FOUND);
      expect(res.text, path.slice(0, 40)).toBe(NOT_FOUND_TEXT);
    }
    expectErrorResponse(await get('/%', w.a), 400, BAD_REQUEST);
  });
});

describe('GET /admin/appointments/:maLichHen — panel "Lịch sử trạng thái" (LSD)', () => {
  it('LSD-01, LSD-02, LSD-04 lịch mới ⇒ một mục TaoLich; huỷ không qua override ⇒ thêm HuyLich; huỷ qua override ⇒ chỉ MỘT mục (override), không HuyLich trùng', async () => {
    const w = await world();
    const actorId = w.systemAdmin.account.taiKhoanId;
    for (const app of Object.values(w.apps))
      await afx.setMilestones(app.lichHenId, { tao: '2026-11-01 08:00:00' });
    const TAO = { thoiDiem: iso('2026-11-01 08:00:00'), loai: 'TaoLich' };
    expect(
      detailOf(await get(`/${CODES.a1}`, w.a)).lichSuTrangThai,
    ).toStrictEqual([TAO]);
    await afx.setMilestones(w.apps.a4.lichHenId, {
      huy: '2026-11-12 10:00:00',
      lyDoHuy: 'Bệnh nhân hủy',
    });
    expect(
      detailOf(await get(`/${CODES.a4}`, w.a)).lichSuTrangThai,
    ).toStrictEqual([
      TAO,
      {
        thoiDiem: iso('2026-11-12 10:00:00'),
        loai: 'HuyLich',
        denTrangThai: 'DaHuy',
        lyDo: 'Bệnh nhân hủy',
      },
    ]);
    await afx.override({
      lichHenId: w.apps.a6.lichHenId,
      chiNhanhId: w.branchA.chiNhanhId,
      actorId,
      at: '2026-11-14 09:00:00',
      from: 'DaXacNhan',
      to: 'DaHuy',
      lyDo: 'Trùng lịch',
    });
    await afx.setMilestones(w.apps.a6.lichHenId, {
      huy: '2026-11-14 09:00:01',
      lyDoHuy: 'Trùng lịch',
    });
    expect(
      detailOf(await get(`/${CODES.a6}`, w.a)).lichSuTrangThai,
    ).toStrictEqual([
      TAO,
      {
        thoiDiem: iso('2026-11-14 09:00:00'),
        loai: 'OverrideLichHen',
        tuTrangThai: 'DaXacNhan',
        denTrangThai: 'DaHuy',
        lyDo: 'Trùng lịch',
      },
    ]);
  });

  it('LSD-03, LSD-07 nhiều lần override chèn sai thứ tự giờ: ra theo thời điểm tăng; `lyDo` có ký tự đặc biệt giữ nguyên qua HTTP và không lọt sang khoá khác', async () => {
    const w = await world();
    const special =
      'Nói "đã gọi" \\ <script>alert(1)</script> Đặng Văn Cường 😀\nDòng hai 100% a_b !';
    const base = {
      lichHenId: w.apps.a1.lichHenId,
      chiNhanhId: w.branchA.chiNhanhId,
      actorId: w.systemAdmin.account.taiKhoanId,
    };
    await afx.override({
      ...base,
      at: '2026-11-05 09:00:00',
      from: 'VangMat',
      to: 'DaXacNhan',
      lyDo: 'sau',
    });
    await afx.override({
      ...base,
      at: '2026-11-03 09:00:00',
      from: 'DaXacNhan',
      to: 'VangMat',
      lyDo: special,
    });
    const history = detailOf(await get(`/${CODES.a1}`, w.a)).lichSuTrangThai;
    expect(history.map((entry) => entry.loai)).toStrictEqual([
      'TaoLich',
      'OverrideLichHen',
      'OverrideLichHen',
    ]);
    expect(history[1]).toStrictEqual({
      thoiDiem: iso('2026-11-03 09:00:00'),
      loai: 'OverrideLichHen',
      tuTrangThai: 'DaXacNhan',
      denTrangThai: 'VangMat',
      lyDo: special,
    });
    expect(history[2]).toMatchObject({ lyDo: 'sau' });
  });

  it('LSD-09 không lộ người thực hiện: JSON chi tiết không chứa email của Quản trị viên, khoá tài khoản, id nhật ký hay chi nhánh của dòng nhật ký', async () => {
    const w = await world();
    await afx.override({
      lichHenId: w.apps.a1.lichHenId,
      chiNhanhId: w.branchA.chiNhanhId,
      actorId: w.systemAdmin.account.taiKhoanId,
      at: '2026-11-03 09:00:00',
      from: 'DaXacNhan',
      to: 'VangMat',
    });
    const res = await get(`/${CODES.a1}`, w.a);
    const actor = await h.db.query<{ email: string }[]>(
      'SELECT email FROM tai_khoan WHERE tai_khoan_id = ?',
      [w.systemAdmin.account.taiKhoanId],
    );
    expect(JSON.stringify(res.body)).not.toContain(actor[0]?.email ?? '?');
    expect(
      collectKeys(detailOf(res).lichSuTrangThai).filter((key) =>
        /taiKhoan|nhatKy|chiNhanh|nguoiThucHien/i.test(key),
      ),
    ).toStrictEqual([]);
  });

  it('QB-05, LSD-09 nhật ký override của lịch chi nhánh khác không bao giờ lộ cho Quản trị viên Chi nhánh (404 trước khi đọc nhật ký)', async () => {
    const w = await world();
    await afx.override({
      lichHenId: w.apps.b1.lichHenId,
      chiNhanhId: w.branchB.chiNhanhId,
      actorId: w.systemAdmin.account.taiKhoanId,
      at: '2026-11-03 09:00:00',
      from: 'DaXacNhan',
      to: 'VangMat',
      lyDo: 'bí mật của chi nhánh B',
    });
    const res = await get(`/${CODES.b1}`, w.a);
    expectErrorResponse(res, 404, NOT_FOUND);
    expect(res.text).not.toContain('bí mật');
  });
});

describe('GET /admin/appointments — vai trò, header, phạm vi đọc từ DB', () => {
  it('ADL-06 (cả hai route) hai Quản trị viên 200; Bệnh nhân, Bác sĩ, Lễ tân 403 KHONG_DU_QUYEN; chưa đăng nhập 401; token sai 401', async () => {
    const w = await world();
    for (const path of ['', `/${CODES.a1}`]) {
      for (const token of [w.toan, w.a])
        expect((await get(path, token)).status, path).toBe(200);
      for (const accountId of [
        w.oneId,
        w.doctorA1.account.taiKhoanId,
        w.receptionA.account.taiKhoanId,
      ])
        expectErrorResponse(
          await get(path, await tokenOf(accountId)),
          403,
          FORBIDDEN,
        );
      expectErrorResponse(await get(path), 401, NOT_LOGGED_IN);
      expectErrorResponse(
        await get(path, 'khong.phai.jwt'),
        401,
        INVALID_TOKEN,
      );
    }
  });

  it('ADL-06, QB-09 guard chạy TRƯỚC pipe: người sai vai trò gửi query hay mã sai vẫn nhận 403 (kể cả mã không tồn tại, dù dịch vụ sẽ trả 404), chưa đăng nhập nhận 401', async () => {
    const w = await world();
    for (const accountId of [w.oneId, w.receptionA.account.taiKhoanId]) {
      const token = await tokenOf(accountId);
      expectErrorResponse(
        await get('?q=a&bacSiId=x&thanhToan=1', token),
        403,
        FORBIDDEN,
      );
      expectErrorResponse(await get('/khong-phai-ma', token), 403, FORBIDDEN);
      expectErrorResponse(
        await get(`/${CODES.missing}`, token),
        403,
        FORBIDDEN,
      );
    }
    expectErrorResponse(await get('?q=a'), 401, NOT_LOGGED_IN);
    expectErrorResponse(await get('/khong-phai-ma'), 401, NOT_LOGGED_IN);
  });

  it('QB-08 Cache-Control: no-store ở 200, 200 rỗng, 404 do dịch vụ, 404 do pipe và 400 do DTO, của cả hai route', async () => {
    const w = await world();
    for (const path of [
      '',
      '?bacSiId=999999999',
      `/${CODES.a1}`,
      `/${CODES.b1}`,
      `/${CODES.missing}`,
      '/sai-dang',
      '?q=a',
      '?thanhToan=1',
    ]) {
      const res = await get(path, w.a);
      expect(res.headers['cache-control'], path).toBe('no-store');
    }
  });

  it('ADL-07, QB-10 đổi chi nhánh được gán hay hạ phạm vi giữa hai request: request sau thấy phạm vi mới (guard đọc DB mỗi request, không cache)', async () => {
    const w = await world();
    expect(codesOf(await get('', w.a))).toStrictEqual(DESC_A);
    await h.db.query(
      'UPDATE quan_tri_vien SET chi_nhanh_id = ? WHERE tai_khoan_id = ?',
      [w.branchB.chiNhanhId, w.adminA.account.taiKhoanId],
    );
    expect(codesOf(await get('', w.a))).toStrictEqual([CODES.b1]);
    expectErrorResponse(await get(`/${CODES.a1}`, w.a), 404, NOT_FOUND);

    expect(codesOf(await get('', w.toan))).toStrictEqual(DESC_ALL);
    await h.db.query(
      "UPDATE quan_tri_vien SET pham_vi_quan_tri = 'ChiNhanh', chi_nhanh_id = ? WHERE tai_khoan_id = ?",
      [w.branchA.chiNhanhId, w.systemAdmin.account.taiKhoanId],
    );
    expect(codesOf(await get('', w.toan))).toStrictEqual(DESC_A);
    expectErrorResponse(await get(`/${CODES.b1}`, w.toan), 404, NOT_FOUND);
  });

  it('ADL-07, QB-10 khoá tài khoản giữa hai request: 401 PHIEN_HET_HIEU_LUC ở cả hai route; đổi vai trò (token và tài khoản vẫn hợp lệ): 403 KHONG_DU_QUYEN; không có dữ liệu ở cả hai ca', async () => {
    const w = await world();
    expect((await get('', w.a)).status).toBe(200);
    await h.db.query(
      "UPDATE tai_khoan SET loai_tai_khoan = 'BenhNhan' WHERE tai_khoan_id = ?",
      [w.adminA.account.taiKhoanId],
    );
    for (const path of ['', `/${CODES.a1}`]) {
      const res = await get(path, w.a);
      expectErrorResponse(res, 403, FORBIDDEN);
      expect(JSON.stringify(res.body)).not.toContain(CODES.a1);
    }
    await h.db.query(
      "UPDATE tai_khoan SET trang_thai = 'NgungHoatDong' WHERE tai_khoan_id = ?",
      [w.adminB.account.taiKhoanId],
    );
    for (const path of ['', `/${CODES.b1}`]) {
      const res = await get(path, w.b);
      expectErrorResponse(res, 401, SESSION_INACTIVE);
      expect(JSON.stringify(res.body)).not.toContain(CODES.b1);
    }
  });
});
