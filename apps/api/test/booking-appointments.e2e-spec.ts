import request from 'supertest';
import { vi } from 'vitest';
import {
  APPOINTMENT_NOTIFIER,
  type AppointmentNotifier,
} from './../src/appointments/ports/appointment-notifier.port.js';
import {
  PAYMENT_PORT,
  type PaymentPort,
} from './../src/appointments/ports/payment.port.js';
import { APPOINTMENT_CODE_PATTERN } from './../src/appointments/appointment-code.js';
import type { CreatedAppointment } from './../src/appointments/create/create-appointment.dto.js';
import { BookingFixtures } from './../src/appointments/testing/booking-fixtures.js';
import {
  dataState,
  lichHenRows,
} from './../src/appointments/testing/create-appointment-world.js';
import { T0 } from './../src/auth/testing/otp-int-helpers.js';
import {
  openRefreshHarness,
  type RefreshHarness,
} from './../src/auth/testing/refresh-http-helpers.js';
import { expectErrorResponse } from './../src/common/testing/error-assertions.js';
import { resetTables } from './../src/database/testing/test-database.js';

// Task B8 — POST /booking/appointments qua HTTP THẬT: AppModule + MySQL thật + configureApp như main.ts (PLAN booking 5.9, 7.1, 7.9; TRACKING booking 3.21 B8-G, B8-H). Tầng dịch vụ và SQL:
// src/appointments/create/create-appointment.service.int-spec.ts. Mã DL-nn, QB-nn là PLAN 7.1, 7.9; TAO-nn là [đề xuất]. Các cổng (thanh toán, thông báo) là bản Noop của module, được
// theo dõi bằng `vi.spyOn` từng ca. Ô i của thế giới bắt đầu 08:00 + 30 phút × i giờ Việt Nam ngày 10/11/2026; đồng hồ giả là 08:00 ngày 02/11/2026. Dữ liệu giả.
const PATH = '/booking/appointments';
const NOT_LOGGED_IN = 'CHUA_DANG_NHAP';
const INVALID_TOKEN = 'TOKEN_KHONG_HOP_LE';
const FORBIDDEN = 'KHONG_DU_QUYEN';
const NOT_FOUND = 'KHONG_TIM_THAY';
const INVALID_DATA = 'DU_LIEU_KHONG_HOP_LE';
const NOT_ALLOWED = 'TRUONG_KHONG_DUOC_PHEP';

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

const post = (body: unknown, accessToken?: string) => {
  const req = request(h.app.getHttpServer()).post(PATH);
  return (accessToken ? req.set('Authorization', `Bearer ${accessToken}`) : req)
    .set('Content-Type', 'application/json')
    .send(JSON.stringify(body));
};
const tokenOf = async (accountId: string) =>
  (await h.sessions.create(accountId)).accessToken;
const createdOf = (res: { body: unknown }) => res.body as CreatedAppointment;
const portOf = <T>(token: symbol) => h.app.get<T>(token, { strict: false });
const setDeposit = (dichVuKhamId: string, tienCoc: string) =>
  fx.depositService(dichVuKhamId, tienCoc, [
    [2, 50],
    [24, 100],
  ]);

async function world() {
  const w = await fx.world();
  const patientId = w.patient.account.taiKhoanId;
  const slot = (index: number) => w.slotIds[index]!;
  const token = await tokenOf(patientId);
  const book = (
    index: number,
    body: Record<string, unknown> = {},
    accessToken: string = token,
  ) => post({ khungGioId: slot(index), ...body }, accessToken);
  return {
    ...w,
    patientId,
    slot,
    token,
    book,
    dichVuKhamId: w.doctor.profile.dichVuKhamId,
  };
}

const TAO_KEYS = [
  'canThanhToan',
  'giaApDung',
  'hanThanhToan',
  'maLichHen',
  'thoiGianMayChu',
  'tienCoc',
  'trangThai',
];

describe('POST /booking/appointments: 201 (DL-01, DL-02, TAO-08)', () => {
  it('DL-01, TAO-08 cọc 0đ ⇒ 201 với ĐÚNG 7 khoá, DaXacNhan, hanThanhToan null, canThanhToan false; lịch ghi đúng, khung giờ DaDat; hai cổng được gọi MỘT lần', async () => {
    const w = await world();
    const payment = vi.spyOn(
      portOf<PaymentPort>(PAYMENT_PORT),
      'recordZeroPayment',
    );
    const notifier = vi.spyOn(
      portOf<AppointmentNotifier>(APPOINTMENT_NOTIFIER),
      'notify',
    );

    const res = await w.book(0);

    expect(res.status).toBe(201);
    expect(Object.keys(res.body as object).sort()).toStrictEqual(TAO_KEYS);
    expect(createdOf(res)).toMatchObject({
      trangThai: 'DaXacNhan',
      hanThanhToan: null,
      giaApDung: '100000.00',
      tienCoc: '0.00',
      canThanhToan: false,
    });
    expect(createdOf(res).maLichHen).toMatch(APPOINTMENT_CODE_PATTERN);
    expect(createdOf(res).thoiGianMayChu).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
    const [row, ...rest] = await lichHenRows(h.db);
    expect(rest).toHaveLength(0);
    expect(row).toMatchObject({
      ma: createdOf(res).maLichHen,
      trangThai: 'DaXacNhan',
      han: null,
      benhNhanId: w.patientId,
      bacSiId: w.doctor.account.taiKhoanId,
      khungGioId: w.slot(0),
      thoiGian: '2026-11-10 08:00:00',
    });
    expect(await fx.slotState(w.slot(0))).toStrictEqual({
      trangThai: 'DaDat',
      giuChoDen: null,
    });
    expect(payment).toHaveBeenCalledTimes(1);
    expect(payment.mock.calls[0]?.[1]).toEqual({
      lichHenId: row!.id,
      benhNhanId: w.patientId,
    });
    expect(notifier).toHaveBeenCalledTimes(1);
    expect(notifier.mock.calls[0]?.[1]).toEqual({
      loaiSuKien: 'LichHenDaXacNhan',
      lichHenId: row!.id,
      taiKhoanId: w.patientId,
    });
  });

  it('DL-02 cọc > 0 ⇒ 201 ChoThanhToan, hanThanhToan = now + 15 phút (ISO UTC), canThanhToan true; KHÔNG gọi recordZeroPayment và notify', async () => {
    const w = await world();
    await setDeposit(w.dichVuKhamId, '50000.00');
    const payment = vi.spyOn(
      portOf<PaymentPort>(PAYMENT_PORT),
      'recordZeroPayment',
    );
    const notifier = vi.spyOn(
      portOf<AppointmentNotifier>(APPOINTMENT_NOTIFIER),
      'notify',
    );

    const res = await w.book(0);

    expect(res.status).toBe(201);
    expect(createdOf(res)).toMatchObject({
      trangThai: 'ChoThanhToan',
      hanThanhToan: '2026-11-02T01:15:00.000Z',
      tienCoc: '50000.00',
      canThanhToan: true,
    });
    expect(await fx.slotState(w.slot(0))).toStrictEqual({
      trangThai: 'DangGiuCho',
      giuChoDen: '2026-11-02 08:15:00',
    });
    expect(payment).not.toHaveBeenCalled();
    expect(notifier).not.toHaveBeenCalled();
  });

  it('TAO-08 thân JSON không lộ id nội bộ (không khoá nào kết thúc bằng Id, không lich_hen_id), email, SĐT hay lý do khám', async () => {
    const w = await world();

    const res = await w.book(0, { lyDoKham: 'Đau đầu bí mật' });

    const keys: string[] = [];
    const walk = (value: unknown) => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (typeof value === 'object' && value !== null)
        for (const [key, child] of Object.entries(value)) {
          keys.push(key);
          walk(child);
        }
    };
    walk(res.body);
    expect(res.status).toBe(201);
    expect(keys.filter((key) => /Id$/i.test(key))).toStrictEqual([]);
    expect(res.text).not.toContain(w.patient.account.email);
    expect(res.text).not.toContain('Đau đầu bí mật');
  });
});

describe('POST /booking/appointments: lyDoKham và thân (DL-23, DL-25, QB-03)', () => {
  it('DL-23 không gửi, null, rỗng hay chỉ khoảng trắng ⇒ 201 và ly_do_kham NULL', async () => {
    const w = await world();

    expect((await w.book(0)).status).toBe(201);
    expect((await w.book(1, { lyDoKham: null })).status).toBe(201);
    expect((await w.book(2, { lyDoKham: '' })).status).toBe(201);

    expect((await lichHenRows(h.db)).map((r) => r.lyDoKham)).toStrictEqual([
      null,
      null,
      null,
    ]);
  });

  it('DL-23 chuẩn hoá: cắt khoảng trắng ASCII hai đầu và đổi NFD thành NFC trước khi ghi; 500 ký tự (điểm mã) hợp lệ', async () => {
    const w = await world();

    await w.book(0, { lyDoKham: '  Ho khan, mêt  ' });
    await w.book(1, { lyDoKham: '😀'.repeat(500) });

    const [first, second] = await lichHenRows(h.db);
    expect(first!.lyDoKham).toBe('Ho khan, mêt');
    expect(second!.lyDoKham).toBe('😀'.repeat(500));
  });

  it.each([
    ['501 ký tự', 'a'.repeat(501)],
    ['501 emoji', '😀'.repeat(501)],
    ['ký tự điều khiển (NUL)', 'a\u0000b'],
    ['tab ở giữa', 'a\tb'],
    ['số JSON', 12],
    ['mảng', ['a']],
  ])(
    'DL-23 lyDoKham sai (%s) ⇒ 400 DU_LIEU_KHONG_HOP_LE với loi[].ma = LY_DO_KHAM_KHONG_HOP_LE; không ghi gì',
    async (_name, lyDoKham) => {
      const w = await world();

      const res = await w.book(0, { lyDoKham });

      const body = expectErrorResponse(res, 400, INVALID_DATA);
      expect(body.loi).toStrictEqual([
        { truong: 'lyDoKham', ma: 'LY_DO_KHAM_KHONG_HOP_LE' },
      ]);
      expect(await lichHenRows(h.db)).toHaveLength(0);
    },
  );

  it.each(['bacSiId', 'chiNhanhId', 'dichVuKhamId', 'benhNhanId', 'trangThai'])(
    'DL-25, QB-03 thân có khoá "%s" ⇒ 400 TRUONG_KHONG_DUOC_PHEP; không ghi gì (bác sĩ, chi nhánh, dịch vụ chỉ suy từ khung giờ, chủ sở hữu chỉ từ token)',
    async (key) => {
      const w = await world();

      const res = await w.book(0, { [key]: '1' });

      const body = expectErrorResponse(res, 400, INVALID_DATA);
      expect(body.loi).toStrictEqual([{ truong: key, ma: NOT_ALLOWED }]);
      expect(await lichHenRows(h.db)).toHaveLength(0);
    },
  );

  it('DL-25 lịch tạo luôn lấy bác sĩ, chi nhánh, dịch vụ và giờ từ khung giờ và bác sĩ (so với dữ liệu của thế giới)', async () => {
    const w = await world();

    await w.book(3);

    const [row] = await lichHenRows(h.db);
    expect(row).toMatchObject({
      bacSiId: w.doctor.account.taiKhoanId,
      chiNhanhId: w.doctor.profile.chiNhanhId,
      dichVuKhamId: w.dichVuKhamId,
      thoiGian: '2026-11-10 09:30:00',
    });
  });

  it('thân sai ⇒ 400 DU_LIEU_KHONG_HOP_LE: khungGioId vắng, số JSON, rỗng, chữ; hoSoNguoiThanId sai; thân là mảng', async () => {
    const w = await world();
    const bodies: unknown[] = [
      {},
      { khungGioId: 5 },
      { khungGioId: '' },
      { khungGioId: 'abc' },
      { khungGioId: '0' },
      { khungGioId: w.slot(0), hoSoNguoiThanId: 'abc' },
      { khungGioId: w.slot(0), hoSoNguoiThanId: 9 },
      [],
    ];

    for (const body of bodies)
      expectErrorResponse(await post(body, w.token), 400, INVALID_DATA);
    expect(await lichHenRows(h.db)).toHaveLength(0);
  });
});

describe('POST /booking/appointments: lỗi nghiệp vụ không ghi gì (DL-03, DL-04, DL-06, DL-11, DL-12, DL-13, DL-15, DL-19, QB-01)', () => {
  const expectUntouched = async (before: unknown) =>
    expect(await dataState(h.db)).toStrictEqual(before);

  it('DL-03 khung giờ đã DaDat ⇒ 409 KHUNG_GIO_DA_DAT; DL-04 đang giữ chỗ còn hạn ⇒ 409 KHUNG_GIO_DANG_GIU', async () => {
    const w = await world();
    const other = await fx.admin.patient();
    await fx.appointmentIn('DaXacNhan', {
      doctor: w.doctor.profile,
      khungGioId: w.slot(0),
      patientId: other.account.taiKhoanId,
    });
    await fx.appointmentIn('ChoThanhToan', {
      doctor: w.doctor.profile,
      khungGioId: w.slot(1),
      patientId: other.account.taiKhoanId,
    });
    const before = await dataState(h.db);

    expectErrorResponse(await w.book(0), 409, 'KHUNG_GIO_DA_DAT');
    expectErrorResponse(await w.book(1), 409, 'KHUNG_GIO_DANG_GIU');

    await expectUntouched(before);
  });

  it('DL-06 trùng giờ với lịch của chính hồ sơ ⇒ 409 LICH_HEN_TRUNG_THOI_GIAN, chiTiet đúng hai khoá', async () => {
    const w = await world();
    const doctor2 = await fx.admin.doctor(w.branch);
    const { slotIds } = await fx.doctor.shiftWithSlots(doctor2.profile, {
      ngay: '2026-11-10',
      ca: 'CaSang',
    });
    const existing = await fx.appointmentIn('DaXacNhan', {
      doctor: doctor2.profile,
      khungGioId: slotIds[0]!,
      patientId: w.patientId,
    });
    const before = await dataState(h.db);

    const body = expectErrorResponse(
      await w.book(0),
      409,
      'LICH_HEN_TRUNG_THOI_GIAN',
    );

    expect(Object.keys(body.chiTiet as object).sort()).toStrictEqual([
      'maLichHen',
      'thoiGian',
    ]);
    expect(body.chiTiet).toMatchObject({ maLichHen: existing.maLichHen });
    await expectUntouched(before);
  });

  it('DL-11 hồ sơ của mình đã ngừng ⇒ 409 HO_SO_NGUOI_THAN_DA_NGUNG; DL-12, QB-01 hồ sơ của bệnh nhân khác ⇒ 404 KHONG_TIM_THAY, thân GIỐNG HỆT hồ sơ không tồn tại; hồ sơ của mình ⇒ 201', async () => {
    const w = await world();
    const stranger = await fx.admin.patient();
    const theirs = await fx.relative(stranger.account.taiKhoanId);
    const before = await dataState(h.db);

    const stopped = await w.book(0, { hoSoNguoiThanId: w.stoppedRelativeId });
    const ofOther = await w.book(0, { hoSoNguoiThanId: theirs });
    const missing = await w.book(0, { hoSoNguoiThanId: '999999999' });

    expectErrorResponse(stopped, 409, 'HO_SO_NGUOI_THAN_DA_NGUNG');
    expectErrorResponse(ofOther, 404, NOT_FOUND);
    expect(ofOther.text).toBe(missing.text);
    await expectUntouched(before);
    const mine = await w.book(0, { hoSoNguoiThanId: w.relativeId });
    expect(mine.status).toBe(201);
    expect((await lichHenRows(h.db))[0]!.hoSoNguoiThanId).toBe(w.relativeId);
  });

  it('DL-13 khoá no-show (cả bản thân và người thân) ⇒ 403 DAT_LICH_BI_KHOA_NO_SHOW; không ghi gì', async () => {
    const w = await world();
    await h.db.query(
      'UPDATE benh_nhan SET khoa_dat_lich_do_no_show = 1 WHERE tai_khoan_id = ?',
      [w.patientId],
    );
    const before = await dataState(h.db);

    expectErrorResponse(await w.book(0), 403, 'DAT_LICH_BI_KHOA_NO_SHOW');
    expectErrorResponse(
      await w.book(0, { hoSoNguoiThanId: w.relativeId }),
      403,
      'DAT_LICH_BI_KHOA_NO_SHOW',
    );

    await expectUntouched(before);
  });

  it('DL-15 chi nhánh nghỉ ngày đó ⇒ 409 CHI_NHANH_NGHI; khung giờ không có ⇒ 404 KHUNG_GIO_KHONG_TON_TAI', async () => {
    const w = await world();
    await h.db.query(
      'UPDATE chi_nhanh_lich_hoat_dong SET hoat_dong = 0, gio_bat_dau_sang = NULL, gio_ket_thuc_sang = NULL, gio_bat_dau_chieu = NULL, gio_ket_thuc_chieu = NULL WHERE chi_nhanh_id = ? AND thu_trong_tuan = 2',
      [w.doctor.profile.chiNhanhId],
    );
    const before = await dataState(h.db);

    expectErrorResponse(await w.book(0), 409, 'CHI_NHANH_NGHI');
    expectErrorResponse(
      await post({ khungGioId: '99999999' }, w.token),
      404,
      'KHUNG_GIO_KHONG_TON_TAI',
    );

    await expectUntouched(before);
  });

  it('DL-19 chưa có cấu hình hệ thống ⇒ 409 HE_THONG_CHUA_CAU_HINH; không ghi gì', async () => {
    const w = await world();
    await h.db.query('DELETE FROM cau_hinh_he_thong');
    const before = await dataState(h.db);

    expectErrorResponse(await w.book(0), 409, 'HE_THONG_CHUA_CAU_HINH');

    await expectUntouched(before);
  });
});

describe('POST /booking/appointments: quyền (QB-02, TAO-07)', () => {
  it('QB-02 Bệnh nhân 201; Bác sĩ, Lễ tân, QTV Chi nhánh, QTV Toàn hệ thống 403 KHONG_DU_QUYEN; chưa đăng nhập 401; token sai 401', async () => {
    const w = await world();
    expect((await w.book(0)).status).toBe(201);

    for (const accountId of [
      w.doctor.account.taiKhoanId,
      w.receptionist.account.taiKhoanId,
      w.branchAdmin.account.taiKhoanId,
      w.systemAdmin.account.taiKhoanId,
    ])
      expectErrorResponse(
        await w.book(1, {}, await tokenOf(accountId)),
        403,
        FORBIDDEN,
      );
    expectErrorResponse(
      await post({ khungGioId: w.slot(1) }),
      401,
      NOT_LOGGED_IN,
    );
    expectErrorResponse(
      await post({ khungGioId: w.slot(1) }, 'khong.phai.jwt'),
      401,
      INVALID_TOKEN,
    );
    expect(await lichHenRows(h.db)).toHaveLength(1);
  });

  it('TAO-07 (ĐA-9b) sai vai trò ⇒ ĐÚNG 403 KHONG_DU_QUYEN dù gửi thân có khoá lạ (RolesGuard chạy TRƯỚC pipe: nếu guard để lọt thì 400); khung giờ đã DaDat và khung giờ không có cũng 403; không ghi gì', async () => {
    const w = await world();
    const other = await fx.admin.patient();
    await fx.appointmentIn('DaXacNhan', {
      doctor: w.doctor.profile,
      khungGioId: w.slot(0),
      patientId: other.account.taiKhoanId,
    });
    const before = await dataState(h.db);

    for (const accountId of [
      w.doctor.account.taiKhoanId,
      w.receptionist.account.taiKhoanId,
      w.branchAdmin.account.taiKhoanId,
      w.systemAdmin.account.taiKhoanId,
    ]) {
      const roleToken = await tokenOf(accountId);
      // Phép thử này KHÔNG phân biệt được RolesGuard với dịch vụ: tài khoản không có hàng `benh_nhan` cũng nhận 403 KHONG_DU_QUYEN từ dịch vụ (đã đo bằng đột biến "bỏ @Roles", TRACKING 3.21);
      // phép thử PHÂN BIỆT là thân có khoá lạ ngay dưới (guard để lọt thì pipe trả 400). Bệnh nhân gửi cùng thân này thì dịch vụ trả 409 KHUNG_GIO_DA_DAT.
      expectErrorResponse(await w.book(0, {}, roleToken), 403, FORBIDDEN);
      expectErrorResponse(
        await post({ khungGioId: w.slot(0), benhNhanId: '1' }, roleToken),
        403,
        FORBIDDEN,
      );
      expectErrorResponse(
        await post({ khungGioId: '99999999' }, roleToken),
        403,
        FORBIDDEN,
      );
    }
    expectErrorResponse(await w.book(0), 409, 'KHUNG_GIO_DA_DAT');
    expect(await dataState(h.db)).toStrictEqual(before);
  });

  it('QB-02 guard chạy TRƯỚC pipe: chưa đăng nhập gửi thân sai nhận 401', async () => {
    expectErrorResponse(await post({ benhNhanId: '1' }), 401, NOT_LOGGED_IN);
  });
});

describe('POST /booking/appointments: Cache-Control (QB-08)', () => {
  it('QB-08 no-store ở 201 (cọc 0đ và cọc > 0), ở lỗi nghiệp vụ do dịch vụ ném (404 khung giờ, 404 hồ sơ, 409 đã đặt, 403 no-show) và ở 400 do DTO (thiếu khungGioId, khoá lạ, lyDoKham sai)', async () => {
    const w = await world();
    const responses = [
      await w.book(0),
      await post({ khungGioId: '99999999' }, w.token),
      await w.book(1, { hoSoNguoiThanId: '999999999' }),
      await post({}, w.token),
      await w.book(2, { benhNhanId: '1' }),
      await w.book(2, { lyDoKham: 'a'.repeat(501) }),
      await w.book(0),
    ];
    await setDeposit(w.dichVuKhamId, '50000.00');
    responses.push(await w.book(3));
    await h.db.query(
      'UPDATE benh_nhan SET khoa_dat_lich_do_no_show = 1 WHERE tai_khoan_id = ?',
      [w.patientId],
    );
    responses.push(await w.book(4));

    expect(responses.map((res) => res.status)).toStrictEqual([
      201, 404, 404, 400, 400, 400, 409, 201, 403,
    ]);
    for (const res of responses)
      expect(res.headers['cache-control'], String(res.status)).toBe('no-store');
  });

  it('QB-08 chưa đăng nhập ⇒ 401 và sai vai trò ⇒ 403 do guard: chỉ khẳng định mã trạng thái, KHÔNG khẳng định gì về cache-control ở hai nhánh này', async () => {
    const w = await world();

    const unauthenticated = await post({ khungGioId: w.slot(0) });
    const wrongRole = await w.book(
      0,
      {},
      await tokenOf(w.doctor.account.taiKhoanId),
    );

    // Số đo ngày 11/11/2026 (TRACKING booking B7-N và mục 5): guard chạy trước `@Header`, nên hai nhánh này không có `cache-control`; không ghim thiếu sót đó để test không đỏ vô cớ khi guard được sửa sau.
    expect(unauthenticated.status).toBe(401);
    expect(wrongRole.status).toBe(403);
  });
});

describe('POST /booking/appointments: bấm đúp (DL-29)', () => {
  it.each([
    ['cọc 0đ', '0.00', 'KHUNG_GIO_DA_DAT', 'DaXacNhan'],
    ['cọc > 0', '50000.00', 'KHUNG_GIO_DANG_GIU', 'ChoThanhToan'],
  ])(
    'DL-29 (%s) hai POST giống hệt cùng lúc ⇒ đúng MỘT 201 và một 409 %s; một lịch duy nhất',
    async (_name, tienCoc, loserCode, winnerState) => {
      const w = await world();
      await setDeposit(w.dichVuKhamId, tienCoc);

      const [a, b] = await Promise.all([w.book(0), w.book(0)]);

      const statuses = [a.status, b.status].sort((x, y) => x - y);
      expect(statuses).toStrictEqual([201, 409]);
      const loser = a.status === 409 ? a : b;
      expectErrorResponse(loser, 409, loserCode);
      const rows = await lichHenRows(h.db);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.trangThai).toBe(winnerState);
    },
  );
});
