import request from 'supertest';
import { vi } from 'vitest';
import type {
  OperationsAppointmentsPage,
  ReceptionAppointmentDetail,
} from './../src/appointments/lists/operations-appointments.dto.js';
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

// Task B3 — GET /reception/appointments và /:maLichHen qua HTTP THẬT: AppModule + MySQL thật + configureApp như main.ts (PLAN booking 5.9, 7.7, 7.9; TRACKING 3.17.3).
// Phần tầng dịch vụ và SQL: src/appointments/lists/operations-appointments.int-spec.ts, reception-appointments.int-spec.ts. Mã DSV-nn, CT-nn, QB-nn là PLAN 7.5, 7.7, 7.9; DSV-13, DSV-14 là [đề xuất].
// QB-02, QB-04, QB-08, QB-09, QB-10 chỉ phần route của B3 (các route khác: B4, B5, B8, B10, B12, B14). Dữ liệu giả (email đuôi example.com, SĐT minh hoạ).
const PATH = '/reception/appointments';
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
let lf: AppointmentListFixtures;
let ofx: OperationsListFixtures;

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

// `path` là phần SAU `/reception/appointments` (bắt đầu bằng `?` hoặc `/`), viết thẳng (đã mã hoá phần trăm nếu cần), để thử cả dạng supertest không dựng được (khoá lặp, `%` hỏng)
const get = (path: string, accessToken?: string) => {
  const req = request(h.app.getHttpServer()).get(`${PATH}${path}`);
  return accessToken ? req.set('Authorization', `Bearer ${accessToken}`) : req;
};
const tokenOf = async (accountId: string) =>
  (await h.sessions.create(accountId)).accessToken;
const pageOf = (res: { body: unknown }) =>
  res.body as OperationsAppointmentsPage;
const detailOf = (res: { body: unknown }) =>
  res.body as ReceptionAppointmentDetail;
const codesOf = (res: { body: unknown }) =>
  pageOf(res).items.map((item) => item.maLichHen);

const ROOT_KEYS = ['items', 'page', 'pageSize', 'total'];
const ITEM_KEYS = [
  'bacSi',
  'chiNhanh',
  'chuyenKhoa',
  'dichVu',
  'giaSnapshot',
  'maLichHen',
  'nguoiDat',
  'nguoiKham',
  'thoiGian',
  'tienCoc',
  'trangThai',
];
const DETAIL_KEYS = [
  'bacSi',
  'chiNhanh',
  'chuyenDuoc',
  'chuyenKhoa',
  'conPhaiThu',
  'dichVu',
  'giaSnapshot',
  'hanThanhToan',
  'lyDoHuy',
  'lyDoKham',
  'maLichHen',
  'nguoiDat',
  'nguoiKham',
  'thoiGian',
  'tienCoc',
  'trangThai',
];
const DEFAULT_A = [CODES.a1, CODES.a2, CODES.a3, CODES.a4, CODES.a6, CODES.a7];

// Hai chi nhánh (`OperationsListFixtures.world`) kèm token của Lễ tân A và B
async function world() {
  const w = await ofx.world();
  return {
    ...w,
    tokenA: await tokenOf(w.receptionA.account.taiKhoanId),
    tokenB: await tokenOf(w.receptionB.account.taiKhoanId),
  };
}

describe('GET /reception/appointments — phạm vi và hình dạng', () => {
  it('DSV-01 Lễ tân A chỉ thấy lịch chi nhánh A (sắp giờ tăng dần), Lễ tân B chỉ thấy lịch chi nhánh B; `chiNhanhId` đúng dạng (chi nhánh khác, không tồn tại) bị BỎ QUA', async () => {
    const w = await world();
    const a = await get('', w.tokenA);
    expect(a.status).toBe(200);
    expect(codesOf(a)).toStrictEqual(DEFAULT_A);
    expect(pageOf(a)).toMatchObject({ total: 6, page: 1, pageSize: 20 });
    expect(codesOf(await get('', w.tokenB))).toStrictEqual([CODES.b1]);
    for (const chiNhanhId of [w.branchB.chiNhanhId, '999999999'])
      expect(
        (await get(`?chiNhanhId=${chiNhanhId}`, w.tokenA)).body,
      ).toStrictEqual(a.body);
    expect(
      codesOf(await get(`?chiNhanhId=${w.branchA.chiNhanhId}`, w.tokenB)),
    ).toStrictEqual([CODES.b1]);
  });

  it('DSV-08, DSV-13 quét JSON danh sách: bốn khoá ở gốc, mười một khoá mỗi dòng; không khoá lộ id, email, băm, ngày sinh, địa chỉ; SĐT chỉ là của NGƯỜI ĐẶT; không SĐT, email bác sĩ', async () => {
    const w = await world();
    const res = await get('', w.tokenA);
    expect(Object.keys(res.body as object).sort()).toStrictEqual(ROOT_KEYS);
    for (const item of pageOf(res).items)
      expect(Object.keys(item).sort()).toStrictEqual(ITEM_KEYS);
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

  it('DSV-12 mặc định không có DaDoiLich; `trangThai=DaDoiLich` hiện đúng dòng đó', async () => {
    const w = await world();
    expect(codesOf(await get('', w.tokenA))).not.toContain(CODES.a5);
    expect(codesOf(await get('?trangThai=DaDoiLich', w.tokenA))).toStrictEqual([
      CODES.a5,
    ]);
    expect(
      codesOf(await get('?trangThai=DaDoiLich,DaHuy', w.tokenA)),
    ).toStrictEqual([CODES.a4, CODES.a5]);
  });

  it('DSV-05 (A1) chi nhánh chưa có lịch: 200, items rỗng, total 0; DSV-06 trang vượt cuối và page cực lớn: 200 rỗng, total đúng', async () => {
    const empty = await ofx.branchWith('Bác Sĩ Trống');
    const emptyPage = await get(
      '',
      await tokenOf(empty.reception.account.taiKhoanId),
    );
    expect(emptyPage.status).toBe(200);
    expect(emptyPage.body).toStrictEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });
    const w = await world();
    expect((await get('?page=4&pageSize=2', w.tokenA)).body).toStrictEqual({
      items: [],
      total: 6,
      page: 4,
      pageSize: 2,
    });
    const huge = await get('?page=9007199254740991&pageSize=100', w.tokenA);
    expect(huge.status).toBe(200);
    expect(pageOf(huge)).toMatchObject({ items: [], total: 6 });
    expect(codesOf(await get('?page=2&pageSize=2', w.tokenA))).toStrictEqual([
      CODES.a3,
      CODES.a4,
    ]);
  });

  it('DSV-04, DSV-07 bộ lọc và ô tìm qua HTTP: bác sĩ, chuyên khoa, dịch vụ, khoảng ngày, `q` mã chữ thường và SĐT; `%` là ký tự thường', async () => {
    const w = await world();
    const a2 = w.doctorA2;
    expect(
      codesOf(await get(`?bacSiId=${a2.account.taiKhoanId}`, w.tokenA)),
    ).toStrictEqual([CODES.a3, CODES.a4, CODES.a7]);
    expect(
      codesOf(await get(`?chuyenKhoaId=${a2.profile.chuyenKhoaId}`, w.tokenA)),
    ).toStrictEqual([CODES.a3, CODES.a4, CODES.a7]);
    expect(
      codesOf(
        await get(
          `?dichVuKhamId=${a2.profile.dichVuKhamId}&tuNgay=2026-11-12`,
          w.tokenA,
        ),
      ),
    ).toStrictEqual([CODES.a4, CODES.a7]);
    expect(
      codesOf(await get('?tuNgay=2026-11-11&denNgay=2026-11-11', w.tokenA)),
    ).toStrictEqual([CODES.a3]);
    expect(
      codesOf(await get(`?q=${CODES.a3.toLowerCase()}`, w.tokenA)),
    ).toStrictEqual([CODES.a3]);
    expect(
      codesOf(await get(`?q=${PATIENT_TWO.soDienThoai}`, w.tokenA)),
    ).toStrictEqual([CODES.a3, CODES.a4, CODES.a6]);
    expect(codesOf(await get('?q=%25%25', w.tokenA))).toStrictEqual([]);
  });
});

describe('GET /reception/appointments — kiểm query (DSV-14)', () => {
  it('DSV-14 `trangThai`: lặp khoá, một giá trị và dấu phẩy đều lọc đúng; giá trị lạ, chuỗi rỗng ⇒ 400 DU_LIEU_KHONG_HOP_LE kèm IS_IN', async () => {
    const w = await world();
    for (const query of [
      '?trangThai=DaHuy&trangThai=VangMat',
      '?trangThai=DaHuy,VangMat',
      '?trangThai=DaHuy,VangMat,DaHuy',
    ])
      expect(codesOf(await get(query, w.tokenA)), query).toStrictEqual([
        CODES.a4,
        CODES.a6,
      ]);
    for (const query of ['?trangThai=HoanTat', '?trangThai=']) {
      const res = await get(query, w.tokenA);
      expectErrorResponse(res, 400, INVALID_DATA);
      expect(JSON.stringify(res.body)).toContain('IS_IN');
    }
  });

  it('DSV-14 id lọc sai dạng, ngày sai, khoảng ngày đảo, `q` sai ⇒ 400 DU_LIEU_KHONG_HOP_LE kèm đúng mã ràng buộc', async () => {
    const w = await world();
    for (const [query, code] of [
      ['?bacSiId=abc', 'IS_BIGINT_ID'],
      ['?chuyenKhoaId=0', 'IS_BIGINT_ID'],
      ['?dichVuKhamId=9223372036854775808', 'IS_BIGINT_ID'],
      ['?chiNhanhId=x', 'IS_BIGINT_ID'],
      ['?tuNgay=2026-13-45', 'IS_CALENDAR_DATE'],
      ['?tuNgay=2026-11-10&denNgay=2026-11-09', 'IS_NOT_BEFORE_FROM'],
      ['?q=a', KEYWORD],
      ['?q=', KEYWORD],
      ['?page=0', 'MIN'],
      ['?pageSize=101', 'MAX'],
    ] as const) {
      const res = await get(query, w.tokenA);
      expectErrorResponse(res, 400, INVALID_DATA);
      expect(JSON.stringify(res.body), query).toContain(code);
    }
    // `q` dài đúng 100 ký tự vẫn hợp lệ
    expect((await get(`?q=${'a'.repeat(100)}`, w.tokenA)).status).toBe(200);
  });

  it('DSV-14, QB-03 khoá không khai (chủ thể, của Bệnh nhân, chờ payment, sắp xếp) ⇒ 400 TRUONG_KHONG_DUOC_PHEP; quyền không đổi', async () => {
    const w = await world();
    for (const query of [
      `?benhNhanId=${w.oneId}`,
      '?thanhToan=DaThanhToanDu',
      '?nhom=SapToi',
      '?hoSoNguoiThanId=BanThan',
      '?sapXep=MoiNhat',
    ]) {
      const body = expectErrorResponse(
        await get(query, w.tokenA),
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

describe('GET /reception/appointments/:maLichHen', () => {
  it('DSV-13, DSV-08 chi tiết: đúng mười sáu khoá; lịch bản thân có lyDoKham; không khoá lộ id, email, băm; không SĐT bác sĩ', async () => {
    const w = await world();
    const res = await get(`/${CODES.a1}`, w.tokenA);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body as object).sort()).toStrictEqual(DETAIL_KEYS);
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
    });
    expect(
      collectKeys(res.body).filter((key) => FORBIDDEN_KEY.test(key)),
    ).toStrictEqual([]);
    expect(JSON.stringify(res.body)).not.toContain(DOCTOR_PHONE);
    const cancelled = await get(`/${CODES.a4}`, w.tokenA);
    expect(detailOf(cancelled).lyDoHuy).toBe('Fixture huỷ lịch');
  });

  it('CT-11, DSV-10 chi tiết qua HTTP: lịch đã thu đủ (giá 0) trong cửa sổ có DaTiepDon và DaHuy; lịch còn phải thu chỉ DaHuy và `conPhaiThu` bằng giá (bản Noop); lịch ChoThanhToan: conPhaiThu null', async () => {
    const w = await world();
    await fx.systemConfig();
    const paid = await ofx.book(w.doctorA1.profile, 'DaXacNhan', {
      patientId: w.twoId,
      ngay: '2026-11-10',
      gio: '08:30:00',
      giaSnapshot: '0.00',
    });
    // Đồng hồ 08:10 giờ VN ngày 10/11 nằm trong cửa sổ [08:00, 08:45] của lịch 08:30 và [07:30, 08:15] của a1 (08:00); MỚI tạo phiên sau khi đặt đồng hồ: access token sống 15 phút theo đồng hồ giả
    vi.setSystemTime(new Date('2026-11-10T01:10:00.000Z'));
    const token = await tokenOf(w.receptionA.account.taiKhoanId);
    const free = detailOf(await get(`/${paid.maLichHen}`, token));
    expect(free).toMatchObject({
      chuyenDuoc: ['DaTiepDon', 'DaHuy'],
      conPhaiThu: '0.00',
    });
    const owing = detailOf(await get(`/${CODES.a1}`, token));
    expect(owing).toMatchObject({
      chuyenDuoc: ['DaHuy'],
      conPhaiThu: '100000.00',
    });
    expect(detailOf(await get(`/${CODES.a2}`, token))).toMatchObject({
      chuyenDuoc: ['DaHuy'],
      conPhaiThu: null,
    });
    expect(detailOf(await get(`/${CODES.a3}`, token))).toMatchObject({
      chuyenDuoc: [],
      conPhaiThu: null,
    });
  });

  it('DSV-09, QB-04 lịch CHI NHÁNH KHÁC và mã không tồn tại: 404 KHONG_TIM_THAY, thân giống từng ký tự; lịch của chính chi nhánh vẫn 200; hai chiều A và B', async () => {
    const w = await world();
    for (const [path, token] of [
      [`/${CODES.b1}`, w.tokenA],
      [`/${CODES.a1}`, w.tokenB],
      [`/${CODES.missing}`, w.tokenA],
      [`/${CODES.b1.toLowerCase()}`, w.tokenA],
      [`/${CODES.b1}?chiNhanhId=${w.branchB.chiNhanhId}`, w.tokenA],
    ] as const) {
      const res = await get(path, token);
      expectErrorResponse(res, 404, NOT_FOUND);
      expect(res.text, path).toBe(NOT_FOUND_TEXT);
    }
    expect((await get(`/${CODES.b1}`, w.tokenB)).status).toBe(200);
    expect((await get(`/${CODES.a1}`, w.tokenA)).status).toBe(200);
  });

  it('QB-09 chữ thường, lẫn lộn và khoảng trắng hai đầu được chuẩn hoá (200, cùng lịch); mã sai dạng, quá dài, chữ cấm: 404 thân giống "không tồn tại", không bao giờ 400 hay 500', async () => {
    const w = await world();
    const canonical = detailOf(await get(`/${CODES.a1}`, w.tokenA));
    for (const path of [
      CODES.a1.toLowerCase(),
      'cLx-20261110-aAa01',
      `%20${CODES.a1}%20`,
      `%09${CODES.a1.toLowerCase()}%0A`,
    ]) {
      const res = await get(`/${path}`, w.tokenA);
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
      const res = await get(`/${path}`, w.tokenA);
      expectErrorResponse(res, 404, NOT_FOUND);
      expect(res.text, path.slice(0, 40)).toBe(NOT_FOUND_TEXT);
    }
  });

  it.each(['%', '%E0%A4%A'])(
    'QB-09 (ngoại lệ đã biết, ngoài tầm của ứng dụng) chuỗi phần trăm hỏng %s ⇒ 400 YEU_CAU_KHONG_HOP_LE do Express, không 404 và không 500',
    async (path) => {
      const w = await world();
      expectErrorResponse(await get(`/${path}`, w.tokenA), 400, BAD_REQUEST);
    },
  );
});

describe('GET /reception/appointments — vai trò, header, tài khoản', () => {
  it('QB-02 (cả hai route) Lễ tân 200; Bệnh nhân, Bác sĩ, QTV Chi nhánh, QTV Toàn hệ thống 403 KHONG_DU_QUYEN; chưa đăng nhập 401; token sai 401', async () => {
    const w = await world();
    const systemAdmin = await fx.admin.admin();
    const branchAdmin = await fx.admin.admin(w.branchA);
    for (const path of ['', `/${CODES.a1}`]) {
      expect((await get(path, w.tokenA)).status, path).toBe(200);
      for (const accountId of [
        w.oneId,
        w.doctorA1.account.taiKhoanId,
        branchAdmin.account.taiKhoanId,
        systemAdmin.account.taiKhoanId,
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

  it('QB-02, QB-09 guard chạy TRƯỚC pipe: người sai vai trò gửi query hay mã sai vẫn nhận 403, chưa đăng nhập nhận 401', async () => {
    const w = await world();
    const doctorToken = await tokenOf(w.doctorA1.account.taiKhoanId);
    expectErrorResponse(
      await get('?q=a&bacSiId=x', doctorToken),
      403,
      FORBIDDEN,
    );
    expectErrorResponse(
      await get('/khong-phai-ma', doctorToken),
      403,
      FORBIDDEN,
    );
    expectErrorResponse(await get('?q=a'), 401, NOT_LOGGED_IN);
    expectErrorResponse(await get('/khong-phai-ma'), 401, NOT_LOGGED_IN);
  });

  it('QB-08 Cache-Control: no-store ở 200, 200 rỗng, 404 do service, 404 do pipe và 400 do DTO (dự kiến: @Header áp trước pipe)', async () => {
    const w = await world();
    for (const path of [
      '',
      '?bacSiId=999999999',
      `/${CODES.a1}`,
      `/${CODES.b1}`,
      `/${CODES.missing}`,
      '/sai-dang',
      '?q=a',
    ]) {
      const res = await get(path, w.tokenA);
      expect(res.headers['cache-control'], path).toBe('no-store');
    }
  });

  it('QB-10 đổi chi nhánh của Lễ tân giữa hai request: request sau thấy chi nhánh mới; khoá tài khoản giữa hai request: request sau bị 401 PHIEN_HET_HIEU_LUC ở cả hai route (không có dữ liệu)', async () => {
    const w = await world();
    expect((await get('', w.tokenA)).status).toBe(200);
    await h.db.query(
      'UPDATE le_tan SET chi_nhanh_id = ? WHERE tai_khoan_id = ?',
      [w.branchB.chiNhanhId, w.receptionA.account.taiKhoanId],
    );
    expect(codesOf(await get('', w.tokenA))).toStrictEqual([CODES.b1]);
    expectErrorResponse(await get(`/${CODES.a1}`, w.tokenA), 404, NOT_FOUND);

    await h.db.query(
      "UPDATE tai_khoan SET trang_thai = 'NgungHoatDong' WHERE tai_khoan_id = ?",
      [w.receptionA.account.taiKhoanId],
    );
    // Tài khoản không còn hoạt động: `JwtAuthGuard` (APP_GUARD, chạy TRƯỚC @Roles và TRƯỚC phạm vi) thu hồi phiên dù access token còn hạn ⇒ 401 PHIEN_HET_HIEU_LUC (đo thật, thân
    // `{maLoi, thongBao}`). Ca này kiểm lớp XÁC THỰC; lớp PHẠM VI (403 KHONG_DU_QUYEN của `ReceptionScopeService`) là ca ngay dưới và ở reception-appointments.int-spec.ts.
    for (const path of ['', `/${CODES.b1}`]) {
      const res = await get(path, w.tokenA);
      expectErrorResponse(res, 401, SESSION_INACTIVE);
      expect(JSON.stringify(res.body)).not.toContain('items');
      expect(JSON.stringify(res.body)).not.toContain(CODES.b1);
    }
  });

  it('QB-04, QB-10 Lễ tân mất hồ sơ le_tan giữa hai request (token và tài khoản vẫn hợp lệ): lớp phạm vi chặn 403 KHONG_DU_QUYEN ở cả hai route, không có dữ liệu', async () => {
    const w = await world();
    expect((await get('', w.tokenA)).status).toBe(200);
    await h.db.query('DELETE FROM le_tan WHERE tai_khoan_id = ?', [
      w.receptionA.account.taiKhoanId,
    ]);
    for (const path of ['', `/${CODES.a1}`]) {
      const res = await get(path, w.tokenA);
      expectErrorResponse(res, 403, FORBIDDEN);
      expect(JSON.stringify(res.body)).not.toContain('items');
      expect(JSON.stringify(res.body)).not.toContain(CODES.a1);
    }
  });
});
