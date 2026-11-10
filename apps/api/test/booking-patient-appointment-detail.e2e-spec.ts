import request from 'supertest';
import { vi } from 'vitest';
import type { PatientAppointmentDetail } from './../src/appointments/lists/patient-appointments.dto.js';
import {
  AppointmentListFixtures,
  DOCTOR_PHONE,
} from './../src/appointments/testing/appointment-list-fixtures.js';
import { BookingFixtures } from './../src/appointments/testing/booking-fixtures.js';
import { T0 } from './../src/auth/testing/otp-int-helpers.js';
import {
  openRefreshHarness,
  type RefreshHarness,
} from './../src/auth/testing/refresh-http-helpers.js';
import { expectErrorResponse } from './../src/common/testing/error-assertions.js';
import { resetTables } from './../src/database/testing/test-database.js';

// Task B2 — GET /patient/appointments/:maLichHen qua HTTP THẬT: AppModule + MySQL thật + configureApp như main.ts (PLAN booking 5.9, 7.4, 7.9; TRACKING 3.15.3).
// Phần tầng dịch vụ và SQL: src/appointments/lists/patient-appointment-detail.int-spec.ts. Mã LSH-nn, QB-nn là PLAN 7.4, 7.9; LSH-22 là [đề xuất].
// QB-01 và QB-09 chỉ phần XEM CHI TIẾT (huỷ, tạo, các route :maLichHen khác: B10, B8, B3, B4, B5). Dữ liệu giả (email đuôi example.com).
const BASE = '/patient/appointments';
const NOT_LOGGED_IN = 'CHUA_DANG_NHAP';
const INVALID_TOKEN = 'TOKEN_KHONG_HOP_LE';
const FORBIDDEN = 'KHONG_DU_QUYEN';
const NOT_FOUND = 'KHONG_TIM_THAY';
const BAD_REQUEST = 'YEU_CAU_KHONG_HOP_LE';
// Thân 404 chung (patient Q27): giống từng ký tự ở mọi nhánh, kể cả mã sai dạng bị pipe từ chối
const NOT_FOUND_TEXT =
  '{"maLoi":"KHONG_TIM_THAY","thongBao":"Không tìm thấy dữ liệu."}';

// Mã mẫu đúng dạng Q13: năm ký tự Crockford (KHÔNG có I, L, O, U)
const MINE = 'CLX-20261110-AAA01';
const MINE_REL = 'CLX-20261110-AAA02';
const MINE_PENDING = 'CLX-20261110-AAA03';
const MINE_REPLACED = 'CLX-20261110-AAA04';
const THEIRS = 'CLX-20261110-BBB01';
const THEIRS_REL = 'CLX-20261110-BBB02';
const MISSING = 'CLX-20261110-ZZZZZ';

let h: RefreshHarness;
let fx: BookingFixtures;
let lf: AppointmentListFixtures;

beforeAll(async () => {
  h = await openRefreshHarness();
  fx = new BookingFixtures(h.db);
});

beforeEach(async () => {
  await resetTables(h.db);
  h.mail.reset();
  // Bộ nhớ khung giờ đã dùng của fixture phải làm lại sau mỗi lần xoá bảng
  lf = new AppointmentListFixtures(fx, h.db);
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

// `path` là phần SAU `/patient/appointments/` và được viết thẳng (đã mã hoá phần trăm nếu cần), để thử cả dạng supertest không tự dựng được
const get = (path: string, accessToken?: string) => {
  const req = request(h.app.getHttpServer()).get(`${BASE}/${path}`);
  return accessToken ? req.set('Authorization', `Bearer ${accessToken}`) : req;
};
const tokenOf = async (accountId: string) =>
  (await h.sessions.create(accountId)).accessToken;
const detailOf = (res: { body: unknown }) =>
  res.body as PatientAppointmentDetail;

const DETAIL_KEYS = [
  'bacSi',
  'chiNhanh',
  'choPhepHuy',
  'chuyenKhoa',
  'dichVu',
  'giaSnapshot',
  'hanThanhToan',
  'hoanTien',
  'lyDoKham',
  'maLichHen',
  'nguoiKham',
  'thanhToan',
  'thoiGian',
  'thoiGianMayChu',
  'tienCoc',
  'trangThai',
];

// Bệnh nhân A (đăng nhập) với bốn lịch (bản thân, người thân, chờ thanh toán, đã đổi), Bệnh nhân B với lịch của mình và của người thân, cùng MỘT bác sĩ có SĐT và email riêng
async function world() {
  const s = await lf.scene({
    doctorName: 'Bác Sĩ Chi Tiết',
    patientName: 'Bệnh Nhân Chi Tiết',
  });
  const relativeId = await fx.relative(s.patientId, {
    hoTen: 'Người Thân Chi Tiết',
  });
  const other = await fx.admin.patient({ hoTen: 'Bệnh Nhân Khác' });
  const otherId = other.account.taiKhoanId;
  const otherRelativeId = await fx.relative(otherId, {
    hoTen: 'Người Thân Khác',
  });
  const doctor = s.doctor.profile;
  await lf.book(doctor, 'DaXacNhan', {
    patientId: s.patientId,
    ngay: '2026-11-10',
    maLichHen: MINE,
    lyDoKham: 'Đau đầu ba ngày',
  });
  await lf.book(doctor, 'HoanThanh', {
    patientId: s.patientId,
    ngay: '2026-11-05',
    hoSoNguoiThanId: relativeId,
    maLichHen: MINE_REL,
  });
  await lf.book(doctor, 'ChoThanhToan', {
    patientId: s.patientId,
    ngay: '2026-11-12',
    maLichHen: MINE_PENDING,
  });
  await lf.book(doctor, 'DaDoiLich', {
    patientId: s.patientId,
    ngay: '2026-11-09',
    maLichHen: MINE_REPLACED,
  });
  await lf.book(doctor, 'DaXacNhan', {
    patientId: otherId,
    ngay: '2026-11-11',
    maLichHen: THEIRS,
  });
  await lf.book(doctor, 'DaXacNhan', {
    patientId: otherId,
    ngay: '2026-11-13',
    hoSoNguoiThanId: otherRelativeId,
    maLichHen: THEIRS_REL,
  });
  return {
    ...s,
    relativeId,
    otherId,
    token: await tokenOf(s.patientId),
  };
}

describe('GET /patient/appointments/:maLichHen', () => {
  it('LSH-10, LSH-14 chi tiết: đúng mười sáu khoá; thanhToan, hoanTien là null (chưa có module); lyDoKham và thoiGianMayChu đúng; không khoá nào lộ id, không lyDoHuy, không email, SĐT, băm', async () => {
    const w = await world();
    const res = await get(MINE, w.token);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body as object).sort()).toStrictEqual(DETAIL_KEYS);
    expect(detailOf(res)).toMatchObject({
      maLichHen: MINE,
      trangThai: 'DaXacNhan',
      bacSi: 'Bác Sĩ Chi Tiết',
      nguoiKham: { hoTen: 'Bệnh Nhân Chi Tiết', laBanThan: true },
      choPhepHuy: true,
      lyDoKham: 'Đau đầu ba ngày',
      thanhToan: null,
      hoanTien: null,
      hanThanhToan: null,
      thoiGianMayChu: T0.toISOString(),
    });

    const keys: string[] = [];
    const walk = (value: unknown) => {
      if (Array.isArray(value)) return value.forEach(walk);
      if (typeof value !== 'object' || value === null) return;
      for (const [key, inner] of Object.entries(value)) {
        keys.push(key);
        walk(inner);
      }
    };
    walk(res.body);
    expect(
      keys.filter((key) => /id$|email|dien_?thoai|mat_?khau|bam$/i.test(key)),
    ).toStrictEqual([]);
    expect(keys).not.toContain('lyDoHuy');

    const text = JSON.stringify(res.body);
    const doctorEmail = await h.db.query<{ email: string }[]>(
      'SELECT email FROM tai_khoan WHERE tai_khoan_id = ?',
      [w.doctor.account.taiKhoanId],
    );
    expect(text).not.toContain(DOCTOR_PHONE);
    expect(text).not.toContain(doctorEmail[0]?.email ?? '?');
    expect(text).not.toContain('argon2');
  });

  it('LSH-10, LSH-13 lịch người thân HoanThanh: laBanThan false, choPhepHuy false; lịch ChoThanhToan: hanThanhToan là ISO, choPhepHuy true', async () => {
    const w = await world();
    const rel = detailOf(await get(MINE_REL, w.token));
    expect(rel).toMatchObject({
      trangThai: 'HoanThanh',
      nguoiKham: { hoTen: 'Người Thân Chi Tiết', laBanThan: false },
      choPhepHuy: false,
      lyDoKham: null,
    });
    const pending = detailOf(await get(MINE_PENDING, w.token));
    expect(pending.trangThai).toBe('ChoThanhToan');
    expect(pending.choPhepHuy).toBe(true);
    expect(pending.hanThanhToan).toBe(
      new Date(T0.getTime() + 15 * 60 * 1000).toISOString(),
    );
  });

  it('QB-09 chữ thường, lẫn lộn và khoảng trắng hai đầu được chuẩn hoá: 200, cùng lịch, maLichHen trả về là chữ hoa', async () => {
    const w = await world();
    const canonical = detailOf(await get(MINE, w.token));
    for (const path of [
      MINE.toLowerCase(),
      'cLx-20261110-aAa01',
      `%20${MINE}%20`,
      `%09${MINE.toLowerCase()}%0A`,
    ]) {
      const res = await get(path, w.token);
      expect(res.status, path).toBe(200);
      expect(detailOf(res).maLichHen, path).toBe(MINE);
      expect(res.body, path).toStrictEqual(canonical);
    }
  });

  it('LSH-11, QB-09 mã sai dạng, quá dài, chữ cấm: 404 KHONG_TIM_THAY, thân giống TỪNG KÝ TỰ với "không tồn tại" (không bao giờ 400 hay 500)', async () => {
    const w = await world();
    const malformed = [
      'CLX-20261110-IBCDE',
      'CLX-20261110-7K3Q',
      'CLX-20261110-7K3QDX',
      'CLX-2026111-7K3QD',
      '0',
      'abc',
      `${'A'.repeat(2000)}`,
      '%20',
      "'%20OR%201=1--",
      'CLX-20261110-ABCD%C5%BF',
      encodeURIComponent('ＣＬＸ-20261110-7K3QD'),
    ];
    const missing = await get(MISSING, w.token);
    expectErrorResponse(missing, 404, NOT_FOUND);
    expect(missing.text).toBe(NOT_FOUND_TEXT);
    for (const path of malformed) {
      const res = await get(path, w.token);
      expectErrorResponse(res, 404, NOT_FOUND);
      expect(res.text, path.slice(0, 40)).toBe(NOT_FOUND_TEXT);
    }
  });

  it.each(['%', '%E0%A4%A'])(
    'QB-09 (ngoại lệ đã biết, ngoài tầm của ứng dụng) chuỗi phần trăm hỏng %s ⇒ 400 YEU_CAU_KHONG_HOP_LE do Express, không 404 và không 500',
    async (path) => {
      const w = await world();
      expectErrorResponse(await get(path, w.token), 400, BAD_REQUEST);
    },
  );

  it('LSH-11, QB-01 xem lịch của người khác (bản thân và người thân của họ), kể cả viết chữ thường hay gửi ?benhNhanId=<họ>: 404 giống hệt "không tồn tại"; lịch của chính mình vẫn 200', async () => {
    const w = await world();
    for (const path of [
      THEIRS,
      THEIRS_REL,
      THEIRS.toLowerCase(),
      `${THEIRS}?benhNhanId=${w.otherId}`,
      `${THEIRS_REL}?taiKhoanId=${w.otherId}`,
    ]) {
      const res = await get(path, w.token);
      expectErrorResponse(res, 404, NOT_FOUND);
      expect(res.text, path).toBe(NOT_FOUND_TEXT);
    }
    // Query lạ không đổi chủ sở hữu: lịch của mình vẫn đúng lịch của mình
    const own = await get(`${MINE}?benhNhanId=${w.otherId}`, w.token);
    expect(own.status).toBe(200);
    expect(detailOf(own).maLichHen).toBe(MINE);
    // Phía bên kia: B xem được lịch của mình, không xem được lịch của A
    const otherToken = await tokenOf(w.otherId);
    expect(detailOf(await get(THEIRS, otherToken)).maLichHen).toBe(THEIRS);
    expectErrorResponse(await get(MINE, otherToken), 404, NOT_FOUND);
  });

  it('LSH-22 lịch DaDoiLich của CHÍNH MÌNH ⇒ 404 giống hệt "không tồn tại"', async () => {
    const w = await world();
    const res = await get(MINE_REPLACED, w.token);
    expectErrorResponse(res, 404, NOT_FOUND);
    expect(res.text).toBe(NOT_FOUND_TEXT);
  });

  it('QB-02 (route chi tiết) Bệnh nhân 200; Bác sĩ, Lễ tân, QTV Chi nhánh, QTV Toàn hệ thống 403 KHONG_DU_QUYEN; chưa đăng nhập 401; token sai 401', async () => {
    const w = await world();
    const reception = await fx.admin.receptionist(w.branch);
    const systemAdmin = await fx.admin.admin();
    const branchAdmin = await fx.admin.admin(w.branch);
    expect((await get(MINE, w.token)).status).toBe(200);
    for (const accountId of [
      w.doctor.account.taiKhoanId,
      reception.account.taiKhoanId,
      branchAdmin.account.taiKhoanId,
      systemAdmin.account.taiKhoanId,
    ])
      expectErrorResponse(
        await get(MINE, await tokenOf(accountId)),
        403,
        FORBIDDEN,
      );
    expectErrorResponse(await get(MINE), 401, NOT_LOGGED_IN);
    expectErrorResponse(await get(MINE, 'khong.phai.jwt'), 401, INVALID_TOKEN);
  });

  it('QB-02, QB-09 guard chạy TRƯỚC pipe: người sai vai trò gửi mã sai dạng vẫn nhận 403 (không biết mã đúng hay sai dạng), chưa đăng nhập gửi mã sai dạng nhận 401', async () => {
    const w = await world();
    expectErrorResponse(
      await get('khong-phai-ma', await tokenOf(w.doctor.account.taiKhoanId)),
      403,
      FORBIDDEN,
    );
    expectErrorResponse(await get('khong-phai-ma'), 401, NOT_LOGGED_IN);
  });

  it('QB-08 Cache-Control: no-store ở 200, ở 404 do service (của người khác, không tồn tại, DaDoiLich) và ở 404 do pipe (mã sai dạng)', async () => {
    const w = await world();
    for (const path of [MINE, THEIRS, MISSING, MINE_REPLACED, 'sai-dang']) {
      const res = await get(path, w.token);
      expect(res.headers['cache-control'], path).toBe('no-store');
    }
  });
});
