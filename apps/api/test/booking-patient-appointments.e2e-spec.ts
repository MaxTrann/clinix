import request from 'supertest';
import { vi } from 'vitest';
import {
  AppointmentListFixtures,
  DOCTOR_PHONE,
} from './../src/appointments/testing/appointment-list-fixtures.js';
import { BookingFixtures } from './../src/appointments/testing/booking-fixtures.js';
import type { PatientAppointmentsPage } from './../src/appointments/lists/patient-appointments.dto.js';
import { T0 } from './../src/auth/testing/otp-int-helpers.js';
import {
  openRefreshHarness,
  type RefreshHarness,
} from './../src/auth/testing/refresh-http-helpers.js';
import { expectErrorResponse } from './../src/common/testing/error-assertions.js';
import { resetTables } from './../src/database/testing/test-database.js';

// Task B1 — GET /patient/appointments qua HTTP THẬT: AppModule + MySQL thật + configureApp như main.ts (PLAN booking 5.9, 7.4, 7.9; TRACKING 3.13.4).
// Phần tầng dịch vụ và SQL: src/appointments/lists/patient-appointments.int-spec.ts. Mã LSH-nn, QB-nn là PLAN 7.4, 7.9; LSH-15…LSH-18 là [đề xuất].
// QB-01 và QB-09 chỉ phần DANH SÁCH (phần chi tiết, huỷ, tạo: B2, B10, B8). Dữ liệu giả (email đuôi example.com).
const PATH = '/patient/appointments';
const NOT_LOGGED_IN = 'CHUA_DANG_NHAP';
const INVALID_TOKEN = 'TOKEN_KHONG_HOP_LE';
const FORBIDDEN = 'KHONG_DU_QUYEN';
const INVALID_DATA = 'DU_LIEU_KHONG_HOP_LE';
const NOT_ALLOWED = 'TRUONG_KHONG_DUOC_PHEP';
const KEYWORD = 'TU_KHOA_KHONG_HOP_LE';

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

// `query` viết thẳng sau dấu ? (đã mã hoá phần trăm nếu cần), để thử cả dạng supertest không dựng được (khoá `trangThai[]`, lặp khoá)
const get = (query: string, accessToken?: string) => {
  const req = request(h.app.getHttpServer()).get(
    query === '' ? PATH : `${PATH}?${query}`,
  );
  return accessToken ? req.set('Authorization', `Bearer ${accessToken}`) : req;
};
const tokenOf = async (accountId: string) =>
  (await h.sessions.create(accountId)).accessToken;
const pageOf = (res: { body: unknown }) => res.body as PatientAppointmentsPage;
const codesOf = (res: { body: unknown }) =>
  pageOf(res).items.map((item) => item.maLichHen);

const ROOT_KEYS = ['demTheoTrangThai', 'items', 'page', 'pageSize', 'total'];
const ITEM_KEYS = [
  'bacSi',
  'chiNhanh',
  'choPhepHuy',
  'chuyenKhoa',
  'dichVu',
  'giaSnapshot',
  'hanThanhToan',
  'maLichHen',
  'nguoiKham',
  'thoiGian',
  'tienCoc',
  'trangThai',
];

// Bệnh nhân A (đăng nhập), một bác sĩ có SĐT và email riêng, Bệnh nhân B với lịch của mình và của người thân
async function world() {
  const s = await lf.scene({
    doctorName: 'Bác Sĩ Hình',
    patientName: 'Bệnh Nhân Hình',
  });
  const relativeId = await fx.relative(s.patientId, {
    hoTen: 'Người Thân Hình',
  });
  const other = await fx.admin.patient({ hoTen: 'Bệnh Nhân Khác' });
  const otherId = other.account.taiKhoanId;
  const otherRelativeId = await fx.relative(otherId, {
    hoTen: 'Người Thân Khác',
  });
  const mine = [
    await lf.book(s.doctor.profile, 'DaXacNhan', {
      patientId: s.patientId,
      ngay: '2026-11-10',
    }),
    await lf.book(s.doctor.profile, 'DaHuy', {
      patientId: s.patientId,
      ngay: '2026-11-08',
      hoSoNguoiThanId: relativeId,
    }),
    await lf.book(s.doctor.profile, 'ChoThanhToan', {
      patientId: s.patientId,
      ngay: '2026-11-12',
    }),
  ];
  const theirs = [
    await lf.book(s.doctor.profile, 'DaXacNhan', {
      patientId: otherId,
      ngay: '2026-11-11',
    }),
    await lf.book(s.doctor.profile, 'DaXacNhan', {
      patientId: otherId,
      ngay: '2026-11-13',
      hoSoNguoiThanId: otherRelativeId,
    }),
  ];
  return {
    ...s,
    relativeId,
    otherId,
    otherRelativeId,
    mine,
    theirs,
    token: await tokenOf(s.patientId),
  };
}

describe('GET /patient/appointments', () => {
  it('LSH-01, QB-01 (phần danh sách) Bệnh nhân A chỉ thấy lịch của mình (bản thân và người thân); lịch của B không lọt, dù B và A cùng bác sĩ', async () => {
    const w = await world();
    const res = await get('', w.token);
    expect(res.status).toBe(200);
    expect(String(res.headers['content-type'])).toContain('application/json');
    expect(codesOf(res).sort()).toStrictEqual(
      w.mine.map((a) => a.maLichHen).sort(),
    );
    expect(pageOf(res)).toMatchObject({ total: 3, page: 1, pageSize: 20 });
    expect(JSON.stringify(res.body)).not.toContain(
      w.theirs[0]?.maLichHen ?? '?',
    );
    expect(JSON.stringify(res.body)).not.toContain(
      w.theirs[1]?.maLichHen ?? '?',
    );
  });

  it('LSH-04, QB-01 hồ sơ người thân của NGƯỜI KHÁC cho 200 rỗng, giống hệt id không tồn tại; BanThan và id người thân của mình đúng', async () => {
    const w = await world();
    const ofOther = await get(`hoSoNguoiThanId=${w.otherRelativeId}`, w.token);
    const missing = await get('hoSoNguoiThanId=999999999', w.token);
    expect(ofOther.status).toBe(200);
    expect(ofOther.body).toStrictEqual(missing.body);
    expect(pageOf(ofOther)).toMatchObject({ items: [], total: 0 });

    expect(
      codesOf(await get('hoSoNguoiThanId=BanThan', w.token)).sort(),
    ).toStrictEqual([w.mine[0], w.mine[2]].map((a) => a?.maLichHen).sort());
    expect(
      codesOf(await get(`hoSoNguoiThanId=${w.relativeId}`, w.token)),
    ).toStrictEqual([w.mine[1]?.maLichHen]);
  });

  it('LSH-14, LSH-19 quét JSON: đúng năm khoá ở gốc và mười hai khoá mỗi item; không khoá nào kết thúc bằng Id, không email, SĐT, băm; giá trị nhạy cảm của bác sĩ và Bệnh nhân không xuất hiện', async () => {
    const w = await world();
    const res = await get('', w.token);
    expect(Object.keys(res.body as object).sort()).toStrictEqual(ROOT_KEYS);
    for (const item of pageOf(res).items)
      expect(Object.keys(item).sort()).toStrictEqual(ITEM_KEYS);

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

    const text = JSON.stringify(res.body);
    const doctorEmail = await h.db.query<{ email: string }[]>(
      'SELECT email FROM tai_khoan WHERE tai_khoan_id = ?',
      [w.doctor.account.taiKhoanId],
    );
    expect(text).not.toContain(DOCTOR_PHONE);
    expect(text).not.toContain(doctorEmail[0]?.email ?? '?');
    expect(text).not.toContain('argon2');
    expect(text).toContain('Bác Sĩ Hình');
  });

  it('QB-02 (route của B1) Bệnh nhân 200; Bác sĩ, Lễ tân, QTV Chi nhánh, QTV Toàn hệ thống 403 KHONG_DU_QUYEN; chưa đăng nhập 401; token sai 401', async () => {
    const w = await world();
    const reception = await fx.admin.receptionist(w.branch);
    const systemAdmin = await fx.admin.admin();
    const branchAdmin = await fx.admin.admin(w.branch);
    expect((await get('', w.token)).status).toBe(200);
    for (const accountId of [
      w.doctor.account.taiKhoanId,
      reception.account.taiKhoanId,
      branchAdmin.account.taiKhoanId,
      systemAdmin.account.taiKhoanId,
    ])
      expectErrorResponse(
        await get('', await tokenOf(accountId)),
        403,
        FORBIDDEN,
      );
    expectErrorResponse(await get(''), 401, NOT_LOGGED_IN);
    expectErrorResponse(await get('', 'khong.phai.jwt'), 401, INVALID_TOKEN);
  });

  it('QB-02 guard chạy TRƯỚC pipe: người sai vai trò gửi query sai vẫn nhận 403 (không biết query đúng hay sai), chưa đăng nhập gửi query sai nhận 401', async () => {
    const w = await world();
    expectErrorResponse(
      await get('q=a&bacSiId=x', await tokenOf(w.doctor.account.taiKhoanId)),
      403,
      FORBIDDEN,
    );
    expectErrorResponse(await get('q=a'), 401, NOT_LOGGED_IN);
  });

  it('QB-08 Cache-Control: no-store ở 200 có dữ liệu và ở 200 rỗng', async () => {
    const w = await world();
    const full = await get('', w.token);
    const empty = await get('hoSoNguoiThanId=999999999', w.token);
    expect(full.headers['cache-control']).toBe('no-store');
    expect(empty.headers['cache-control']).toBe('no-store');
    expect(pageOf(empty).items).toStrictEqual([]);
  });

  it('LSH-09 (A1) Bệnh nhân chưa có lịch: 200, items rỗng, total 0, đủ sáu số đếm bằng 0', async () => {
    const s = await lf.scene();
    const res = await get('', await tokenOf(s.patientId));
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      demTheoTrangThai: {
        ChoThanhToan: 0,
        DaXacNhan: 0,
        DaTiepDon: 0,
        HoanThanh: 0,
        DaHuy: 0,
        VangMat: 0,
      },
    });
  });

  it('LSH-02, LSH-05 nhom và demTheoTrangThai qua HTTP: SapToi tăng dần, LichSu giảm dần; số đếm không đổi khi chọn trangThai', async () => {
    const w = await world();
    const [confirmed, cancelled, pending] = w.mine.map((a) => a.maLichHen);
    expect(codesOf(await get('nhom=SapToi', w.token))).toStrictEqual([
      confirmed,
      pending,
    ]);
    expect(codesOf(await get('nhom=LichSu', w.token))).toStrictEqual([
      cancelled,
    ]);
    const picked = await get('trangThai=DaHuy', w.token);
    expect(codesOf(picked)).toStrictEqual([cancelled]);
    expect(pageOf(picked).demTheoTrangThai).toStrictEqual(
      pageOf(await get('', w.token)).demTheoTrangThai,
    );
    expect(pageOf(picked).demTheoTrangThai).toMatchObject({
      DaXacNhan: 1,
      DaHuy: 1,
      ChoThanhToan: 1,
    });
  });
});

describe('GET /patient/appointments — kiểm query', () => {
  it('LSH-03, LSH-15 trangThai: lặp khoá, một giá trị và dấu phẩy đều lọc đúng (đã đo M8: cần @Transform)', async () => {
    const w = await world();
    const [confirmed, cancelled] = w.mine.map((a) => a.maLichHen);
    for (const query of [
      'trangThai=DaHuy',
      'trangThai=DaHuy&trangThai=DaHuy',
      'trangThai=DaHuy,DaHuy',
    ])
      expect(codesOf(await get(query, w.token)), query).toStrictEqual([
        cancelled,
      ]);
    for (const query of [
      'trangThai=DaHuy&trangThai=DaXacNhan',
      'trangThai=DaHuy,DaXacNhan',
    ])
      expect(codesOf(await get(query, w.token)).sort(), query).toStrictEqual(
        [confirmed, cancelled].sort(),
      );
  });

  it.each([
    ['giá trị ngoài enum', 'trangThai=DaXong'],
    ['DaDoiLich (ẩn khỏi API Bệnh nhân)', 'trangThai=DaDoiLich'],
    ['rỗng', 'trangThai='],
    ['một giá trị lạ trong hai', 'trangThai=DaHuy&trangThai=DaXong'],
  ])(
    'LSH-03, LSH-15 ca âm: %s ⇒ 400 IS_IN ở trangThai',
    async (_name, query) => {
      const w = await world();
      const body = expectErrorResponse(
        await get(query, w.token),
        400,
        INVALID_DATA,
      );
      expect(body.loi).toStrictEqual([{ truong: 'trangThai', ma: 'IS_IN' }]);
    },
  );

  it.each(['trangThai[]=DaHuy', 'trangThai[]=', 'trangThai[0]=DaHuy'])(
    'LSH-15 ca âm: %s ⇒ 400 TRUONG_KHONG_DUOC_PHEP (đã đo M8)',
    async (query) => {
      const w = await world();
      const body = expectErrorResponse(
        await get(query, w.token),
        400,
        INVALID_DATA,
      );
      expect(body.loi?.map((e) => e.ma)).toStrictEqual([NOT_ALLOWED]);
    },
  );

  it.each([
    ['bacSiId chữ', 'bacSiId=abc', 'bacSiId', 'IS_BIGINT_ID'],
    ['chuyenKhoaId số 0', 'chuyenKhoaId=0', 'chuyenKhoaId', 'IS_BIGINT_ID'],
    ['id 20 chữ số', 'bacSiId=12345678901234567890', 'bacSiId', 'IS_BIGINT_ID'],
    [
      'hai bacSiId (lặp khoá)',
      'bacSiId=1&bacSiId=2',
      'bacSiId',
      'IS_BIGINT_ID',
    ],
    [
      'banthan viết thường',
      'hoSoNguoiThanId=banthan',
      'hoSoNguoiThanId',
      'IS_VISIT_PROFILE_FILTER',
    ],
    ['nhom sai', 'nhom=TatCa', 'nhom', 'IS_IN'],
    [
      'tuNgay không có thật (qua được @Matches)',
      'tuNgay=2026-13-45',
      'tuNgay',
      'IS_CALENDAR_DATE',
    ],
    ['denNgay sai dạng', 'denNgay=10/11/2026', 'denNgay', 'IS_CALENDAR_DATE'],
    [
      'denNgay trước tuNgay',
      'tuNgay=2026-11-10&denNgay=2026-11-09',
      'denNgay',
      'IS_NOT_BEFORE_FROM',
    ],
  ])('LSH-12, LSH-16 ca âm: %s ⇒ 400', async (_name, query, truong, ma) => {
    const w = await world();
    const body = expectErrorResponse(
      await get(query, w.token),
      400,
      INVALID_DATA,
    );
    expect(body.loi).toStrictEqual([{ truong, ma }]);
  });

  it.each([
    ['page 0', 'page=0'],
    ['pageSize 101', 'pageSize=101'],
    ['page chữ', 'page=abc'],
  ])('LSH-07 ca âm: %s ⇒ 400', async (_name, query) => {
    const w = await world();
    expectErrorResponse(await get(query, w.token), 400, INVALID_DATA);
  });

  it.each(['benhNhanId=1', 'chiNhanhId=1', 'foo=1'])(
    'QB-03 chủ sở hữu không do client gửi: %s ⇒ 400 TRUONG_KHONG_DUOC_PHEP, danh sách không đổi',
    async (query) => {
      const w = await world();
      const body = expectErrorResponse(
        await get(query, w.token),
        400,
        INVALID_DATA,
      );
      expect(body.loi?.map((e) => e.ma)).toStrictEqual([NOT_ALLOWED]);
    },
  );

  it('LSH-08 q hợp lệ: 100 ký tự ⇒ 200; mã lịch chữ thường tìm ra (QB-09 phần danh sách); %% là ký tự thường (không khớp tất cả)', async () => {
    const w = await world();
    const target = w.mine[0]?.maLichHen ?? '';
    expect(
      codesOf(
        await get(`q=${encodeURIComponent(target.toLowerCase())}`, w.token),
      ),
    ).toStrictEqual([target]);
    expect((await get(`q=${'x'.repeat(100)}`, w.token)).status).toBe(200);
    const percent = await get('q=%25%25', w.token);
    expect(percent.status).toBe(200);
    expect(pageOf(percent).items).toStrictEqual([]);
  });

  it.each([
    ['một ký tự', 'q=a'],
    ['101 ký tự', `q=${'x'.repeat(101)}`],
    ['rỗng', 'q='],
    ['hai khoá q', 'q=ab&q=cd'],
    ['ký tự điều khiển', 'q=a%00b'],
  ])(
    'LSH-08 ca âm: q %s ⇒ 400 đúng MỘT lỗi { q, TU_KHOA_KHONG_HOP_LE }',
    async (_name, query) => {
      const w = await world();
      const body = expectErrorResponse(
        await get(query, w.token),
        400,
        INVALID_DATA,
      );
      expect(body.loi).toStrictEqual([{ truong: 'q', ma: KEYWORD }]);
      expect(JSON.stringify(body)).not.toContain('xxxxx');
    },
  );

  it('LSH-12 khoảng ngày qua HTTP: đúng một lịch của ngày 10/11, loại ngày khác; hai đầu bằng nhau là hợp lệ', async () => {
    const w = await world();
    const res = await get('tuNgay=2026-11-10&denNgay=2026-11-10', w.token);
    expect(codesOf(res)).toStrictEqual([w.mine[0]?.maLichHen]);
    // Ngày 11/11 chỉ có lịch của Bệnh nhân khác: khoảng 10 đến 11 vẫn chỉ có một lịch của mình
    expect(
      pageOf(await get('tuNgay=2026-11-10&denNgay=2026-11-11', w.token)).total,
    ).toBe(1);
  });
});

describe('GET /patient/appointments — phân trang', () => {
  it('LSH-07 page và pageSize được phản chiếu; trang 2 cỡ 1 lấy lịch thứ hai; trang vượt cuối 200 rỗng, total đúng', async () => {
    const w = await world();
    const [confirmed, cancelled, pending] = w.mine.map((a) => a.maLichHen);
    const second = await get('page=2&pageSize=1', w.token);
    expect(codesOf(await get('page=1&pageSize=1', w.token))).toStrictEqual([
      pending,
    ]);
    expect(pageOf(second)).toMatchObject({ page: 2, pageSize: 1, total: 3 });
    expect(codesOf(second)).toStrictEqual([confirmed]);
    expect(codesOf(await get('page=3&pageSize=1', w.token))).toStrictEqual([
      cancelled,
    ]);
    const beyond = await get('page=4&pageSize=1', w.token);
    expect(beyond.status).toBe(200);
    expect(pageOf(beyond)).toMatchObject({ items: [], total: 3, page: 4 });
  });

  it.each([
    [
      'page lớn nhất là số nguyên an toàn',
      'page=9007199254740991&pageSize=100',
    ],
    ['page vượt số nguyên an toàn', 'page=9007199254740993&pageSize=100'],
    ['page 1e21', 'page=1000000000000000000000&pageSize=100'],
  ])('LSH-18 %s ⇒ 200 rỗng, total đúng, không 500', async (_name, query) => {
    const w = await world();
    const res = await get(query, w.token);
    expect(res.status).toBe(200);
    expect(pageOf(res)).toMatchObject({ items: [], total: 3 });
  });
});
