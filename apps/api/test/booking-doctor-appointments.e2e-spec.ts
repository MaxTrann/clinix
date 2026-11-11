import request from 'supertest';
import { vi } from 'vitest';
import type {
  DoctorAppointmentDetail,
  DoctorAppointmentsPage,
} from './../src/appointments/lists/doctor-appointments.dto.js';
import {
  AppointmentListFixtures,
  DOCTOR_PHONE,
} from './../src/appointments/testing/appointment-list-fixtures.js';
import { BookingFixtures } from './../src/appointments/testing/booking-fixtures.js';
import {
  DAUGHTER_FIELDS,
  DOCTOR_CODES,
  DOCTOR_DETAIL_KEYS,
  DOCTOR_EXAMINEE_KEYS,
  DOCTOR_ITEM_KEYS,
  DOCTOR_ROOT_KEYS,
  DoctorListFixtures,
  ISO_UTC,
  MOTHER_FIELDS,
  MOTHER_NAME,
  MOTHER_PHONE,
  ONE_ACCOUNT_FIELDS,
  ZERO_STATUS_COUNTS,
} from './../src/appointments/testing/doctor-list-fixtures.js';
import {
  CODES,
  OperationsListFixtures,
  PATIENT_ONE,
  PATIENT_TWO,
  RELATIVE_NAME,
} from './../src/appointments/testing/operations-list-fixtures.js';
import {
  collectKeys,
  collectStrings,
  DOCTOR_FORBIDDEN_KEY,
} from './../src/appointments/testing/response-keys.js';
import { T0 } from './../src/auth/testing/otp-int-helpers.js';
import {
  openRefreshHarness,
  type RefreshHarness,
} from './../src/auth/testing/refresh-http-helpers.js';
import { expectErrorResponse } from './../src/common/testing/error-assertions.js';
import { resetTables } from './../src/database/testing/test-database.js';

// Task B5 — GET /doctor/appointments và /:maLichHen qua HTTP THẬT: AppModule + MySQL thật + configureApp như main.ts (PLAN booking 5.9, 7.8, 7.9; TRACKING 3.20.3). Phần tầng dịch vụ và SQL:
// src/appointments/lists/doctor-appointments.int-spec.ts. Mã DSB-nn, QB-nn là PLAN 7.8, 7.9; DSB-10 đến DSB-14 là [đề xuất]. QB-02, QB-03, QB-08, QB-09, QB-10 chỉ phần route của B5 (các route khác: B3, B4, B8,
// B10, B12, B14). Dữ liệu giả (email đuôi example.com, SĐT minh hoạ).
// CA QB-02 / DSB-09 (ma trận vai trò) khẳng định ĐÚNG 403 KHONG_DU_QUYEN, không phải "khác 200": `RolesGuard` cho qua route không có `@Roles`, nên khi thiếu `@Roles` Bệnh nhân, Lễ tân, QTV nhận 200 rỗng ở
// danh sách và 404 ở chi tiết (SQL đã tự đóng cửa bằng `bac_si_id = <token>`). Chỉ e2e phân biệt được `RolesGuard` với lỗi của dịch vụ (bài học ĐA-9b của B7): hai ca đó ĐỎ khi bỏ `@Roles` ở route tương ứng (M9-ds, M9-ct).
const PATH = '/doctor/appointments';
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
const C = { ...CODES, ...DOCTOR_CODES };
// Thứ tự giờ của bác sĩ A1 (`DoctorListFixtures.world`): a1 10/11 08:00, a2 10/11 08:30, a6 14/11, c1 16/11 13:00, c2 16/11 13:30 (a5 DaDoiLich bị ẩn)
const NEWEST_A1 = [C.c2, C.c1, C.a6, C.a2, C.a1];
const COUNTS_A1 = {
  ...ZERO_STATUS_COUNTS,
  ChoThanhToan: 1,
  DaXacNhan: 2,
  DaTiepDon: 1,
  VangMat: 1,
};
const EMPTY_PAGE = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  demTheoTrangThai: ZERO_STATUS_COUNTS,
};

let h: RefreshHarness;
let fx: BookingFixtures;
let lf: AppointmentListFixtures;
let ofx: OperationsListFixtures;
let dfx: DoctorListFixtures;

beforeAll(async () => {
  h = await openRefreshHarness();
  fx = new BookingFixtures(h.db);
});

beforeEach(async () => {
  await resetTables(h.db);
  h.mail.reset();
  // Bộ nhớ khung giờ đã dùng của fixture phải làm lại sau mỗi lần xoá bảng
  lf = new AppointmentListFixtures(fx, h.db);
  ofx = new OperationsListFixtures(fx, lf, h.db);
  dfx = new DoctorListFixtures(fx, ofx, h.db);
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

// `path` là phần SAU `/doctor/appointments` (bắt đầu bằng `?` hoặc `/`), viết thẳng (đã mã hoá phần trăm nếu cần), để thử cả dạng supertest không dựng được (khoá lặp, `%` hỏng)
const get = (path: string, accessToken?: string) => {
  const req = request(h.app.getHttpServer()).get(`${PATH}${path}`);
  return accessToken ? req.set('Authorization', `Bearer ${accessToken}`) : req;
};
const tokenOf = async (accountId: string) =>
  (await h.sessions.create(accountId)).accessToken;
const idOf = (doctor: { account: { taiKhoanId: string } }) =>
  doctor.account.taiKhoanId;
const pageOf = (res: { body: unknown }) => res.body as DoctorAppointmentsPage;
const detailOf = (res: { body: unknown }) =>
  res.body as DoctorAppointmentDetail;
const codesOf = (res: { body: unknown }) =>
  pageOf(res).items.map((item) => item.maLichHen);
const queryOf = (q: string) => `?q=${encodeURIComponent(q)}`;

// Hai chi nhánh và ba bác sĩ (`DoctorListFixtures.world`) kèm token của A1, A2 (cùng chi nhánh) và B (chi nhánh khác)
async function world() {
  const w = await dfx.world();
  return {
    ...w,
    tokenA1: await tokenOf(idOf(w.doctorA1)),
    tokenA2: await tokenOf(idOf(w.doctorA2)),
    tokenB: await tokenOf(idOf(w.doctorB)),
  };
}
type World = Awaited<ReturnType<typeof world>>;

// Bốn vai trò KHÔNG phải Bác sĩ (QB-02)
async function wrongRoles(w: World) {
  const branchAdmin = await fx.admin.admin(w.branchA);
  const systemAdmin = await fx.admin.admin();
  return [
    ['Bệnh nhân', w.oneId],
    ['Lễ tân', idOf(w.receptionA)],
    ['QTV Chi nhánh', idOf(branchAdmin)],
    ['QTV Toàn hệ thống', idOf(systemAdmin)],
  ] as const;
}

describe('GET /doctor/appointments — phạm vi và hình dạng', () => {
  it('DSB-01, QB-06, QB-03 mỗi bác sĩ chỉ thấy lịch của mình (A1, A2 cùng chi nhánh, B khác chi nhánh), mới nhất trước; `bacSiId` đúng dạng (bác sĩ khác, không tồn tại) bị BỎ QUA', async () => {
    const w = await world();
    const a1 = await get('', w.tokenA1);
    expect(a1.status).toBe(200);
    expect(codesOf(a1)).toStrictEqual(NEWEST_A1);
    expect(pageOf(a1)).toMatchObject({ total: 5, page: 1, pageSize: 20 });
    expect(codesOf(await get('', w.tokenA2))).toStrictEqual([C.a7, C.a4, C.a3]);
    expect(codesOf(await get('', w.tokenB))).toStrictEqual([C.b1]);
    for (const bacSiId of [idOf(w.doctorA2), idOf(w.doctorB), '999999999'])
      expect((await get(`?bacSiId=${bacSiId}`, w.tokenA1)).body).toStrictEqual(
        a1.body,
      );
    expect(
      codesOf(await get(`?bacSiId=${idOf(w.doctorA1)}`, w.tokenB)),
    ).toStrictEqual([C.b1]);
  });

  it('DSB-06 quét JSON danh sách: năm khoá ở gốc, tám khoá mỗi dòng, năm khoá `nguoiKham`; không khoá khớp regex cấm riêng cho Bác sĩ; không email, băm, giá, SĐT hay tên chính bác sĩ; SĐT chỉ là của NGƯỜI KHÁM', async () => {
    const w = await world();
    const res = await get('', w.tokenA1);
    expect(Object.keys(res.body as object).sort()).toStrictEqual(
      DOCTOR_ROOT_KEYS,
    );
    for (const item of pageOf(res).items) {
      expect(Object.keys(item).sort()).toStrictEqual(DOCTOR_ITEM_KEYS);
      expect(Object.keys(item.nguoiKham).sort()).toStrictEqual(
        DOCTOR_EXAMINEE_KEYS,
      );
    }
    expect(
      collectKeys(res.body).filter((key) => DOCTOR_FORBIDDEN_KEY.test(key)),
    ).toStrictEqual([]);
    const doctorEmail = await h.db.query<{ email: string }[]>(
      'SELECT email FROM tai_khoan WHERE tai_khoan_id = ?',
      [idOf(w.doctorA1)],
    );
    const text = JSON.stringify(res.body);
    for (const banned of [
      DOCTOR_PHONE,
      doctorEmail[0]?.email ?? '?',
      'argon2',
      '100000.00',
      'Bác Sĩ',
    ])
      expect(text, banned).not.toContain(banned);
    const phones = new Set(
      collectStrings(res.body).filter((value) => /^0\d{9}$/.test(value)),
    );
    // Người khám: Bệnh nhân một (a1, c2), Bệnh nhân hai (a6), mẹ của hai (c1); con gái của một (a2) không có SĐT
    expect([...phones].sort()).toStrictEqual(
      [PATIENT_ONE.soDienThoai, PATIENT_TWO.soDienThoai, MOTHER_PHONE].sort(),
    );
  });

  it('DSB-10 `DaDoiLich` ẩn: không có ở danh sách mặc định (total 5, số đếm đủ sáu khoá, không DaDoiLich); `trangThai=DaDoiLich` (một mình hoặc kèm trạng thái khác) ⇒ 400 IS_IN', async () => {
    const w = await world();
    const res = await get('', w.tokenA1);
    expect(codesOf(res)).not.toContain(C.a5);
    expect(pageOf(res).total).toBe(5);
    expect(Object.keys(pageOf(res).demTheoTrangThai)).not.toContain(
      'DaDoiLich',
    );
    for (const query of [
      '?trangThai=DaDoiLich',
      '?trangThai=DaHuy,DaDoiLich',
    ]) {
      const bad = await get(query, w.tokenA1);
      expectErrorResponse(bad, 400, INVALID_DATA);
      expect(JSON.stringify(bad.body), query).toContain('IS_IN');
    }
  });

  it('DSB-11 `demTheoTrangThai`: đủ SÁU khoá, giá trị đúng; `trangThai[]` thu hẹp `items` và `total` nhưng KHÔNG đổi số đếm; `ca` đổi số đếm', async () => {
    const w = await world();
    const all = pageOf(await get('', w.tokenA1));
    expect(all.demTheoTrangThai).toStrictEqual(COUNTS_A1);
    const narrowed = await get('?trangThai=DaXacNhan,VangMat', w.tokenA1);
    expect(codesOf(narrowed)).toStrictEqual([C.c1, C.a6, C.a1]);
    expect(pageOf(narrowed)).toMatchObject({
      total: 3,
      demTheoTrangThai: COUNTS_A1,
    });
    expect(
      pageOf(await get('?ca=CaChieu', w.tokenA1)).demTheoTrangThai,
    ).toStrictEqual({ ...ZERO_STATUS_COUNTS, DaXacNhan: 1, DaTiepDon: 1 });
  });

  it('DSB-12 người khám qua HTTP: khám cho chính mình ⇒ trường của TÀI KHOẢN (chưa nhập ⇒ null); khám cho người thân ⇒ trường của HỒ SƠ; người thân không SĐT ⇒ null, KHÔNG SĐT người đặt', async () => {
    const w = await world();
    const byCode = new Map(
      pageOf(await get('', w.tokenA1)).items.map((item) => [
        item.maLichHen,
        item.nguoiKham,
      ]),
    );
    expect(byCode.get(C.a1)).toStrictEqual({
      hoTen: PATIENT_ONE.hoTen,
      quanHe: 'BanThan',
      ...ONE_ACCOUNT_FIELDS,
      soDienThoai: PATIENT_ONE.soDienThoai,
    });
    expect(byCode.get(C.a2)).toStrictEqual({
      hoTen: RELATIVE_NAME,
      quanHe: DAUGHTER_FIELDS.moiQuanHe,
      gioiTinh: DAUGHTER_FIELDS.gioiTinh,
      ngaySinh: DAUGHTER_FIELDS.ngaySinh,
      soDienThoai: null,
    });
    expect(byCode.get(C.a6)).toStrictEqual({
      hoTen: PATIENT_TWO.hoTen,
      quanHe: 'BanThan',
      gioiTinh: null,
      ngaySinh: null,
      soDienThoai: PATIENT_TWO.soDienThoai,
    });
    expect(byCode.get(C.c1)).toStrictEqual({
      hoTen: MOTHER_NAME,
      quanHe: MOTHER_FIELDS.moiQuanHe,
      gioiTinh: MOTHER_FIELDS.gioiTinh,
      ngaySinh: MOTHER_FIELDS.ngaySinh,
      soDienThoai: MOTHER_PHONE,
    });
  });

  it('DSB-05 (A1) bác sĩ chưa có lịch, tài khoản BacSi KHÔNG có hàng `bac_si`: 200 rỗng, `total` 0, đủ sáu khoá số đếm; trang vượt cuối và `page` cực lớn: 200 rỗng, `total` đúng', async () => {
    const empty = await ofx.branchWith('Bác Sĩ Trống');
    const orphan = await dfx.doctorAccountOnly();
    for (const accountId of [idOf(empty.doctor), orphan.taiKhoanId]) {
      const res = await get('', await tokenOf(accountId));
      expect(res.status).toBe(200);
      expect(res.body).toStrictEqual(EMPTY_PAGE);
    }
    const w = await world();
    expect((await get('?page=4&pageSize=2', w.tokenA1)).body).toStrictEqual({
      items: [],
      total: 5,
      page: 4,
      pageSize: 2,
      demTheoTrangThai: COUNTS_A1,
    });
    const huge = await get('?page=9007199254740991&pageSize=100', w.tokenA1);
    expect(huge.status).toBe(200);
    expect(pageOf(huge)).toMatchObject({ items: [], total: 5 });
    expect(codesOf(await get('?page=2&pageSize=2', w.tokenA1))).toStrictEqual([
      C.a6,
      C.a2,
    ]);
  });
});

describe('GET /doctor/appointments — bộ lọc, ô tìm, kiểm query', () => {
  it('DSB-03, DSB-04 `ca`, `sapXep`, `trangThai[]` qua HTTP: CaSang, CaChieu lọc đúng, CaToi hợp lệ nhưng rỗng; CuNhat đảo hẳn MoiNhat; lặp khoá, một giá trị, dấu phẩy, bỏ trùng đều lọc đúng', async () => {
    const w = await world();
    const codes = async (query: string) => codesOf(await get(query, w.tokenA1));
    expect(await codes('?ca=CaSang')).toStrictEqual([C.a6, C.a2, C.a1]);
    expect(await codes('?ca=CaChieu')).toStrictEqual([C.c2, C.c1]);
    expect(await codes('?ca=CaToi')).toStrictEqual([]);
    expect(await codes('?sapXep=CuNhat')).toStrictEqual(
      [...NEWEST_A1].reverse(),
    );
    expect(await codes('?sapXep=MoiNhat')).toStrictEqual(NEWEST_A1);
    for (const query of [
      '?trangThai=DaXacNhan&trangThai=VangMat',
      '?trangThai=DaXacNhan,VangMat',
      '?trangThai=DaXacNhan,VangMat,DaXacNhan',
    ])
      expect(await codes(query), query).toStrictEqual([C.c1, C.a6, C.a1]);
  });

  it('DSB-02 khoảng ngày giờ VN qua HTTP: một ngày, nhiều ngày, chỉ `tuNgay`, chỉ `denNgay`, `9999-12-31` bỏ cận trên', async () => {
    const w = await world();
    const codes = async (query: string) => codesOf(await get(query, w.tokenA1));
    expect(await codes('?tuNgay=2026-11-10&denNgay=2026-11-10')).toStrictEqual([
      C.a2,
      C.a1,
    ]);
    expect(await codes('?tuNgay=2026-11-14&denNgay=2026-11-16')).toStrictEqual([
      C.c2,
      C.c1,
      C.a6,
    ]);
    expect(await codes('?tuNgay=2026-11-11')).toStrictEqual([C.c2, C.c1, C.a6]);
    expect(await codes('?denNgay=2026-11-13')).toStrictEqual([C.a2, C.a1]);
    expect(await codes('?denNgay=9999-12-31')).toStrictEqual(NEWEST_A1);
  });

  it('DSB-13 `q` qua HTTP: tên người khám gấp `đ` (đặng, DANG, đào), mã chữ thường, SĐT NGƯỜI KHÁM có dấu cách hoặc dấu chấm; `%` là ký tự thường', async () => {
    const w = await world();
    const find = async (q: string) => codesOf(await get(queryOf(q), w.tokenA1));
    // c1 do Đặng Văn Cường đặt cho mẹ; a2 do Nguyễn Văn An đặt cho con gái (không SĐT): tên và SĐT người đặt không khớp
    expect(await find('đặng')).toStrictEqual([C.a6]);
    expect(await find('DANG')).toStrictEqual([C.a6]);
    expect(await find('đào')).toStrictEqual([C.c1]);
    expect(await find(C.a1.toLowerCase())).toStrictEqual([C.a1]);
    for (const q of ['0911111111', '0911 111 111', '0911.111.111'])
      expect(await find(q), q).toStrictEqual([C.c2, C.a1]);
    expect(await find(MOTHER_PHONE)).toStrictEqual([C.c1]);
    expect(await find(DOCTOR_PHONE)).toStrictEqual([]);
    expect(await find('%%')).toStrictEqual([]);
  });

  it('DSB-13 gõ họ tên của CHÍNH bác sĩ không khớp mọi dòng: 200, items rỗng, total 0, số đếm toàn 0 (còn bác sĩ B gõ tên mình cũng vậy)', async () => {
    const w = await world();
    for (const [token, name] of [
      [w.tokenA1, 'Bác Sĩ Một'],
      [w.tokenA1, 'bac si'],
      [w.tokenB, 'Bác Sĩ Ba'],
    ] as const) {
      const res = await get(queryOf(name), token);
      expect(res.status, name).toBe(200);
      expect(res.body, name).toStrictEqual(EMPTY_PAGE);
    }
  });

  it('DSB-14 id, ngày, `ca`, `sapXep`, `trangThai`, `q`, phân trang sai ⇒ 400 DU_LIEU_KHONG_HOP_LE kèm đúng mã ràng buộc; `q` dài đúng 100 ký tự vẫn hợp lệ', async () => {
    const w = await world();
    for (const [query, code] of [
      ['?ca=CaDem', 'IS_IN'],
      ['?ca=', 'IS_IN'],
      ['?ca=CaSang&ca=CaChieu', 'IS_IN'],
      ['?sapXep=TangDan', 'IS_IN'],
      ['?sapXep=', 'IS_IN'],
      ['?trangThai=HoanTat', 'IS_IN'],
      ['?trangThai=', 'IS_IN'],
      ['?bacSiId=abc', 'IS_BIGINT_ID'],
      ['?bacSiId=9223372036854775808', 'IS_BIGINT_ID'],
      ['?tuNgay=2026-13-45', 'IS_CALENDAR_DATE'],
      ['?tuNgay=2026-11-10&denNgay=2026-11-09', 'IS_NOT_BEFORE_FROM'],
      ['?q=a', KEYWORD],
      ['?q=', KEYWORD],
      ['?page=0', 'MIN'],
      ['?pageSize=101', 'MAX'],
    ] as const) {
      const res = await get(query, w.tokenA1);
      expectErrorResponse(res, 400, INVALID_DATA);
      expect(JSON.stringify(res.body), query).toContain(code);
    }
    expect((await get(`?q=${'a'.repeat(100)}`, w.tokenA1)).status).toBe(200);
  });

  it('DSB-14, QB-03 khoá không khai (chuyên khoa, dịch vụ, chi nhánh, chủ thể, của Bệnh nhân, chờ payment, khoá lạ) ⇒ 400 TRUONG_KHONG_DUOC_PHEP; quyền không đổi', async () => {
    const w = await world();
    for (const query of [
      '?chuyenKhoaId=1',
      '?dichVuKhamId=1',
      `?chiNhanhId=${w.branchB.chiNhanhId}`,
      `?benhNhanId=${w.oneId}`,
      '?hoSoNguoiThanId=BanThan',
      '?nhom=SapToi',
      '?thanhToan=DaThanhToanDu',
      '?foo=1',
    ]) {
      const body = expectErrorResponse(
        await get(query, w.tokenA1),
        400,
        INVALID_DATA,
      );
      expect(
        body.loi?.map((e) => e.ma),
        query,
      ).toStrictEqual([NOT_ALLOWED]);
    }
  });
});

describe('GET /doctor/appointments/:maLichHen', () => {
  it('DSB-06, DSB-08 chi tiết: đúng mười một khoá, giá trị đúng; `ghiChuKham` null (kể cả lịch HoanThanh); không khoá lộ id, email, băm, giá, lý do huỷ; không SĐT bác sĩ', async () => {
    const w = await world();
    const res = await get(`/${C.a1}`, w.tokenA1);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body as object).sort()).toStrictEqual(
      DOCTOR_DETAIL_KEYS,
    );
    expect(detailOf(res)).toMatchObject({
      maLichHen: C.a1,
      thoiGian: w.apps.a1.thoiGian.toISOString(),
      ca: 'CaSang',
      trangThai: 'DaXacNhan',
      nguoiKham: {
        hoTen: PATIENT_ONE.hoTen,
        quanHe: 'BanThan',
        ...ONE_ACCOUNT_FIELDS,
        soDienThoai: PATIENT_ONE.soDienThoai,
      },
      lyDoKham: 'Đau đầu ba ngày',
      ghiChuKham: null,
      chiNhanh: w.branchA.ten,
    });
    expect(detailOf(res).ngayDat).toMatch(ISO_UTC);
    expect(typeof detailOf(res).dichVu).toBe('string');
    expect(typeof detailOf(res).chuyenKhoa).toBe('string');
    expect(
      collectKeys(res.body).filter((key) => DOCTOR_FORBIDDEN_KEY.test(key)),
    ).toStrictEqual([]);
    expect(JSON.stringify(res.body)).not.toContain(DOCTOR_PHONE);
    const done = await get(`/${C.a3}`, w.tokenA2);
    expect(detailOf(done)).toMatchObject({
      trangThai: 'HoanThanh',
      ghiChuKham: null,
    });
  });

  it('DSB-06 lịch DaHuy có `ly_do_huy` ở DB: chi tiết 200, KHÔNG khoá `lyDoHuy` và không chữ nào của lý do (Figma 692:2); lịch ChoThanhToan không lộ hạn thanh toán, giá', async () => {
    const w = await world();
    const cancelled = await get(`/${C.a4}`, w.tokenA2);
    expect(detailOf(cancelled).trangThai).toBe('DaHuy');
    expect(Object.keys(cancelled.body as object).sort()).toStrictEqual(
      DOCTOR_DETAIL_KEYS,
    );
    expect(JSON.stringify(cancelled.body)).not.toContain('Fixture huỷ lịch');
    const pending = await get(`/${C.a2}`, w.tokenA1);
    expect(detailOf(pending).trangThai).toBe('ChoThanhToan');
    expect(JSON.stringify(pending.body)).not.toContain('100000.00');
    expect(Object.keys(pending.body as object).sort()).toStrictEqual(
      DOCTOR_DETAIL_KEYS,
    );
  });

  it('DSB-07, QB-06, DSB-10 lịch của bác sĩ KHÁC (cùng và khác chi nhánh, cả hai chiều), mã không tồn tại và lịch DaDoiLich của chính mình: 404 KHONG_TIM_THAY, thân giống từng ký tự; lịch của chính mình vẫn 200', async () => {
    const w = await world();
    for (const [path, token] of [
      [`/${C.a3}`, w.tokenA1],
      [`/${C.b1}`, w.tokenA1],
      [`/${C.a1}`, w.tokenA2],
      [`/${C.a1}`, w.tokenB],
      [`/${C.missing}`, w.tokenA1],
      [`/${C.a5}`, w.tokenA1],
      [`/${C.b1.toLowerCase()}`, w.tokenA1],
      [`/${C.b1}?bacSiId=${idOf(w.doctorB)}`, w.tokenA1],
    ] as const) {
      const res = await get(path, token);
      expectErrorResponse(res, 404, NOT_FOUND);
      expect(res.text, path).toBe(NOT_FOUND_TEXT);
    }
    expect((await get(`/${C.a1}`, w.tokenA1)).status).toBe(200);
    expect((await get(`/${C.a3}`, w.tokenA2)).status).toBe(200);
    expect((await get(`/${C.b1}`, w.tokenB)).status).toBe(200);
  });

  it('QB-09 chữ thường, lẫn lộn và khoảng trắng hai đầu được chuẩn hoá (200, cùng lịch); mã sai dạng, quá dài, chữ cấm: 404 thân giống "không tồn tại", không bao giờ 400 hay 500', async () => {
    const w = await world();
    const canonical = detailOf(await get(`/${C.a1}`, w.tokenA1));
    for (const path of [
      C.a1.toLowerCase(),
      'cLx-20261110-aAa01',
      `%20${C.a1}%20`,
      `%09${C.a1.toLowerCase()}%0A`,
    ]) {
      const res = await get(`/${path}`, w.tokenA1);
      expect(res.status, path).toBe(200);
      expect(res.body, path).toStrictEqual(canonical);
    }
    for (const path of [
      'CLX-20261110-IBCDE',
      'CLX-20261110-AAA0',
      'CLX-20261110-AAA011',
      '0',
      'abc',
      'A'.repeat(2000),
      "'%20OR%201=1--",
      'CLX-20261110-AAA0%C5%BF',
    ]) {
      const res = await get(`/${path}`, w.tokenA1);
      expectErrorResponse(res, 404, NOT_FOUND);
      expect(res.text, path.slice(0, 40)).toBe(NOT_FOUND_TEXT);
    }
  });

  it.each(['%', '%E0%A4%A'])(
    'QB-09 (ngoại lệ đã biết, ngoài tầm của ứng dụng) chuỗi phần trăm hỏng %s ⇒ 400 YEU_CAU_KHONG_HOP_LE do Express, không 404 và không 500',
    async (path) => {
      const w = await world();
      expectErrorResponse(await get(`/${path}`, w.tokenA1), 400, BAD_REQUEST);
    },
  );
});

describe('GET /doctor/appointments — vai trò, header, tài khoản', () => {
  it.each([
    ['danh sách', ''],
    ['chi tiết', `/${C.a1}`],
  ])(
    'QB-02, DSB-09 route %s: Bác sĩ 200; Bệnh nhân, Lễ tân, QTV Chi nhánh, QTV Toàn hệ thống ĐÚNG 403 KHONG_DU_QUYEN (ĐỎ khi bỏ @Roles ở route này: Bệnh nhân nhận 200 rỗng hoặc 404); chưa đăng nhập 401; token sai 401',
    async (_route, path) => {
      const w = await world();
      expect((await get(path, w.tokenA1)).status).toBe(200);
      for (const [role, accountId] of await wrongRoles(w)) {
        const res = await get(path, await tokenOf(accountId));
        expect(res.status, `${role} ${path}`).toBe(403);
        expectErrorResponse(res, 403, FORBIDDEN);
        expect(JSON.stringify(res.body), role).not.toContain('items');
        expect(JSON.stringify(res.body), role).not.toContain(C.a1);
      }
      expectErrorResponse(await get(path), 401, NOT_LOGGED_IN);
      expectErrorResponse(
        await get(path, 'khong.phai.jwt'),
        401,
        INVALID_TOKEN,
      );
    },
  );

  it.each([
    ['danh sách', '?q=a&bacSiId=x&ca=CaDem&trangThai=DaDoiLich'],
    ['chi tiết', '/khong-phai-ma'],
  ])(
    'DSB-09, QB-02 route %s: guard chạy TRƯỚC pipe và DTO: cả bốn vai trò sai gửi query hay mã sai vẫn nhận ĐÚNG 403 KHONG_DU_QUYEN (ĐỎ khi bỏ @Roles ở route này), chưa đăng nhập nhận 401',
    async (_route, path) => {
      const w = await world();
      for (const [role, accountId] of await wrongRoles(w)) {
        const res = await get(path, await tokenOf(accountId));
        expect(res.status, role).toBe(403);
        expectErrorResponse(res, 403, FORBIDDEN);
      }
      expectErrorResponse(await get(path), 401, NOT_LOGGED_IN);
    },
  );

  it('QB-08 Cache-Control: no-store ở 200, 200 rỗng, 404 do service, 404 do pipe và 400 do DTO (dự kiến: @Header áp trước pipe)', async () => {
    const w = await world();
    for (const path of [
      '',
      '?bacSiId=999999999',
      `?q=${encodeURIComponent('Bác Sĩ Một')}`,
      `/${C.a1}`,
      `/${C.b1}`,
      `/${C.missing}`,
      '/sai-dang',
      '?q=a',
      '?ca=CaDem',
    ]) {
      const res = await get(path, w.tokenA1);
      expect(res.headers['cache-control'], path).toBe('no-store');
    }
  });

  it('QB-10 khoá tài khoản Bác sĩ giữa hai request: request sau 401 PHIEN_HET_HIEU_LUC ở cả hai route, không có dữ liệu', async () => {
    const w = await world();
    expect((await get('', w.tokenA1)).status).toBe(200);
    await h.db.query(
      "UPDATE tai_khoan SET trang_thai = 'NgungHoatDong' WHERE tai_khoan_id = ?",
      [idOf(w.doctorA1)],
    );
    // `JwtAuthGuard` (APP_GUARD, TRƯỚC @Roles và TRƯỚC SQL) thu hồi phiên dù access token còn hạn
    for (const path of ['', `/${C.a1}`]) {
      const res = await get(path, w.tokenA1);
      expectErrorResponse(res, 401, SESSION_INACTIVE);
      expect(JSON.stringify(res.body)).not.toContain('items');
      expect(JSON.stringify(res.body)).not.toContain(C.a1);
    }
  });

  it('QB-10 đổi vai trò giữa hai request (token và tài khoản vẫn hợp lệ): request sau 403 KHONG_DU_QUYEN ở cả hai route, không có dữ liệu', async () => {
    const w = await world();
    expect((await get('', w.tokenA1)).status).toBe(200);
    await h.db.query(
      "UPDATE tai_khoan SET loai_tai_khoan = 'BenhNhan' WHERE tai_khoan_id = ?",
      [idOf(w.doctorA1)],
    );
    for (const path of ['', `/${C.a1}`]) {
      const res = await get(path, w.tokenA1);
      expectErrorResponse(res, 403, FORBIDDEN);
      expect(JSON.stringify(res.body)).not.toContain('items');
      expect(JSON.stringify(res.body)).not.toContain(C.a1);
    }
  });
});
