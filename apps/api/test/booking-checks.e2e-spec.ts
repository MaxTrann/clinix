import request from 'supertest';
import { vi } from 'vitest';
import {
  DOCTOR_LEAVE_PORT,
  type DoctorLeavePort,
} from './../src/appointments/ports/doctor-leave.port.js';
import {
  PENDING_BRANCH_CHANGES_PORT,
  type PendingBranchChangesPort,
} from './../src/appointments/ports/pending-branch-changes.port.js';
import {
  WALLET_BALANCE_PORT,
  type WalletBalancePort,
} from './../src/appointments/ports/wallet.port.js';
import { BookingFixtures } from './../src/appointments/testing/booking-fixtures.js';
import type { BookingCheckResult } from './../src/appointments/create/booking-checks.dto.js';
import { T0 } from './../src/auth/testing/otp-int-helpers.js';
import {
  openRefreshHarness,
  type RefreshHarness,
} from './../src/auth/testing/refresh-http-helpers.js';
import { expectErrorResponse } from './../src/common/testing/error-assertions.js';
import { resetTables } from './../src/database/testing/test-database.js';

// Task B7 — POST /booking/checks qua HTTP THẬT: AppModule + MySQL thật + configureApp như main.ts (PLAN booking 5.9, 7.1, 7.9; TRACKING booking 3.18.3). Tầng dịch vụ và SQL: src/appointments/create/
// booking-checks.service.int-spec.ts. Mã DL-nn, QB-nn là PLAN 7.1, 7.9; BCK-nn là [đề xuất]. Ba cổng (nghỉ phép, đổi chi nhánh, ví) là bản Noop của module, được thay bằng `vi.spyOn` từng ca. Dữ liệu giả.
const PATH = '/booking/checks';
const NOT_LOGGED_IN = 'CHUA_DANG_NHAP';
const INVALID_TOKEN = 'TOKEN_KHONG_HOP_LE';
const FORBIDDEN = 'KHONG_DU_QUYEN';
const NOT_FOUND = 'KHONG_TIM_THAY';
const INVALID_DATA = 'DU_LIEU_KHONG_HOP_LE';
const NOT_ALLOWED = 'TRUONG_KHONG_DUOC_PHEP';
const BIG_A = '9007199254740993'; // 2^53 + 1

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
const resultOf = (res: { body: unknown }) => res.body as BookingCheckResult;
const lockNoShow = (accountId: string) =>
  h.db.query(
    'UPDATE benh_nhan SET khoa_dat_lich_do_no_show = 1 WHERE tai_khoan_id = ?',
    [accountId],
  );
const portOf = <T>(token: symbol) => h.app.get<T>(token, { strict: false });

async function world() {
  const w = await fx.world();
  const patientId = w.patient.account.taiKhoanId;
  const slot = (index: number) => w.slotIds[index]!;
  const checkSlot = (
    index: number,
    token: string,
    hoSoNguoiThanId?: string | null,
  ) =>
    post(
      {
        khungGioId: slot(index),
        ...(hoSoNguoiThanId === undefined ? {} : { hoSoNguoiThanId }),
      },
      token,
    );
  return {
    ...w,
    patientId,
    slot,
    checkSlot,
    dichVuKhamId: w.doctor.profile.dichVuKhamId,
    token: await tokenOf(patientId),
  };
}

const TOMTAT_KEYS = [
  'bacSi',
  'chiNhanh',
  'chinhSachHoan',
  'chuyenKhoa',
  'dichVu',
  'giaApDung',
  'giaDichVu',
  'nguoiKham',
  'phuPhi',
  'soDuVi',
  'thoiGian',
  'tienCoc',
];

describe('POST /booking/checks: đường thành công (DL-24, BCK-11)', () => {
  it('DL-24, BCK-11 200 (không phải 201) với ĐÚNG hai khoá gốc, đúng 12 khoá tomTat, thoiGianMayChu ISO có mili giây, không khoá thừa', async () => {
    const w = await world();

    const res = await w.checkSlot(0, w.token);

    expect(res.status).toBe(200);
    expect(Object.keys(res.body as object).sort()).toStrictEqual([
      'thoiGianMayChu',
      'tomTat',
    ]);
    expect(Object.keys(resultOf(res).tomTat).sort()).toStrictEqual(TOMTAT_KEYS);
    expect(resultOf(res).thoiGianMayChu).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
    expect(resultOf(res).tomTat.thoiGian).toBe('2026-11-10T01:00:00.000Z');
    expect(resultOf(res).tomTat.soDuVi).toBeNull();
  });

  it('DL-24, BCK-05 thân JSON không lộ id nội bộ, email, SĐT, mã lịch hay lý do khám', async () => {
    const w = await world();

    const res = await w.checkSlot(0, w.token);
    const json = JSON.stringify(res.body);
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

    expect(res.status).toBe(200);
    expect(keys.filter((key) => key.endsWith('Id'))).toStrictEqual([]);
    expect(json).not.toContain(w.doctor.account.email);
    expect(json).not.toContain(w.patient.account.email);
    expect(json).not.toMatch(/@|CLX-|lyDoKham/);
  });

  it('BCK-05 giaApDung, phuPhi, giaDichVu, tienCoc BẰNG giá mà thẻ bác sĩ của search trả cho cùng bác sĩ (GET /public/doctors/:id), có quy tắc phụ phí', async () => {
    const w = await world();
    await h.db.query(
      "INSERT INTO phu_phi_bac_si (chuc_danh, so_nam_kinh_nghiem_tu, phu_phi, ap_dung) VALUES ('BS', 0, '50000.00', 1)",
    );
    await h.db.query(
      'UPDATE dich_vu_kham SET muc_dat_coc = ? WHERE dich_vu_kham_id = ?',
      ['20000.00', w.dichVuKhamId],
    );

    const checks = await w.checkSlot(0, w.token);
    const card = await request(h.app.getHttpServer()).get(
      `/public/doctors/${w.doctor.account.taiKhoanId}`,
    );

    expect(card.status).toBe(200);
    const { tomTat } = resultOf(checks);
    expect(tomTat.phuPhi).toBe('50000.00');
    expect(tomTat.giaApDung).toBe('150000.00');
    const gia = (card.body as { gia: Record<string, string> }).gia;
    expect(tomTat.giaDichVu).toBe(gia.giaMacDinh);
    expect(tomTat.phuPhi).toBe(gia.phuPhi);
    expect(tomTat.giaApDung).toBe(gia.giaKham);
    expect(tomTat.tienCoc).toBe(gia.mucDatCoc);
  });

  it('BCK-05, BCK-06 cọc > 0: chinhSachHoan từ moc_hoan_tien thật (chưa mốc ⇒ []; có mốc ⇒ giảm dần camelCase) và soDuVi từ cổng ví; cọc 0 thì chinhSachHoan null, soDuVi null', async () => {
    const w = await world();
    const wallet = portOf<WalletBalancePort>(WALLET_BALANCE_PORT);
    const available = vi
      .spyOn(wallet, 'available')
      .mockResolvedValue('99000.00');

    const free = resultOf(await w.checkSlot(0, w.token)).tomTat;
    expect(free.chinhSachHoan).toBeNull();
    expect(free.soDuVi).toBeNull();
    expect(available).not.toHaveBeenCalled();

    await h.db.query(
      'UPDATE dich_vu_kham SET muc_dat_coc = ? WHERE dich_vu_kham_id = ?',
      ['50000.00', w.dichVuKhamId],
    );
    const noTiers = resultOf(await w.checkSlot(0, w.token)).tomTat;
    expect(noTiers.chinhSachHoan).toStrictEqual([]);
    expect(noTiers.soDuVi).toBe('99000.00');
    expect(available).toHaveBeenCalledTimes(1);
    expect(available).toHaveBeenCalledWith(w.patientId);

    await h.db.query(
      'INSERT INTO moc_hoan_tien (dich_vu_kham_id, so_gio_truoc_toi_thieu, ty_le_hoan) VALUES (?, 2, 50), (?, 24, 100)',
      [w.dichVuKhamId, w.dichVuKhamId],
    );
    const withTiers = resultOf(await w.checkSlot(0, w.token)).tomTat;
    expect(withTiers.chinhSachHoan).toStrictEqual([
      { soGioTruocToiThieu: 24, tyLeHoan: 100 },
      { soGioTruocToiThieu: 2, tyLeHoan: 50 },
    ]);
  });

  it('BCK-06 bản Noop của cổng ví (chưa có ví thật) ⇒ soDuVi null dù cọc > 0; khoá vẫn có mặt', async () => {
    const w = await world();
    await h.db.query(
      'UPDATE dich_vu_kham SET muc_dat_coc = ? WHERE dich_vu_kham_id = ?',
      ['50000.00', w.dichVuKhamId],
    );

    const res = await w.checkSlot(0, w.token);

    expect(res.status).toBe(200);
    expect(Object.keys(resultOf(res).tomTat).sort()).toStrictEqual(TOMTAT_KEYS);
    expect(resultOf(res).tomTat.soDuVi).toBeNull();
  });

  it('DL-24 chỉ ĐỌC: gọi nhiều lần không đổi lịch hẹn, trạng thái khung giờ hay thông báo', async () => {
    const w = await world();
    const count = async () =>
      JSON.stringify([
        await h.db.query('SELECT COUNT(*) AS n FROM lich_hen'),
        await h.db.query('SELECT COUNT(*) AS n FROM thong_bao'),
        await h.db.query(
          'SELECT khung_gio_id, trang_thai, giu_cho_den FROM khung_gio ORDER BY khung_gio_id',
        ),
      ]);
    const before = await count();

    for (let i = 0; i < 3; i += 1) await w.checkSlot(i, w.token);
    await w.checkSlot(0, w.token, w.relativeId);

    expect(await count()).toBe(before);
  });
});

describe('POST /booking/checks: hồ sơ, quyền, thân (QB-01, QB-02, QB-03, DL-11, DL-12)', () => {
  it('QB-01, DL-12 A kiểm với hồ sơ người thân của B ⇒ 404 KHONG_TIM_THAY, thân GIỐNG HỆT hồ sơ không tồn tại; A kiểm hồ sơ người thân CỦA MÌNH ⇒ 200', async () => {
    const w = await world();
    const stranger = await fx.admin.patient();
    const theirs = await fx.relative(stranger.account.taiKhoanId);

    const ofOther = await w.checkSlot(0, w.token, theirs);
    const missing = await w.checkSlot(0, w.token, '999999999');
    const mine = await w.checkSlot(0, w.token, w.relativeId);

    expectErrorResponse(ofOther, 404, NOT_FOUND);
    expect(ofOther.text).toBe(missing.text);
    expect(mine.status).toBe(200);
    expect(resultOf(mine).tomTat.nguoiKham.laBanThan).toBe(false);
  });

  it('DL-11 hồ sơ của mình đã ngừng ⇒ 409 HO_SO_NGUOI_THAN_DA_NGUNG', async () => {
    const w = await world();

    expectErrorResponse(
      await w.checkSlot(0, w.token, w.stoppedRelativeId),
      409,
      'HO_SO_NGUOI_THAN_DA_NGUNG',
    );
  });

  it('QB-02 (route checks) Bệnh nhân 200; Bác sĩ, Lễ tân, QTV Chi nhánh, QTV Toàn hệ thống 403 KHONG_DU_QUYEN; chưa đăng nhập 401; token sai 401', async () => {
    const w = await world();
    expect((await w.checkSlot(0, w.token)).status).toBe(200);

    for (const accountId of [
      w.doctor.account.taiKhoanId,
      w.receptionist.account.taiKhoanId,
      w.branchAdmin.account.taiKhoanId,
      w.systemAdmin.account.taiKhoanId,
    ])
      expectErrorResponse(
        await w.checkSlot(0, await tokenOf(accountId)),
        403,
        FORBIDDEN,
      );
    expectErrorResponse(
      await post({ khungGioId: w.slot(0) }),
      401,
      NOT_LOGGED_IN,
    );
    expectErrorResponse(
      await post({ khungGioId: w.slot(0) }, 'khong.phai.jwt'),
      401,
      INVALID_TOKEN,
    );
  });

  it('QB-02 guard chạy TRƯỚC pipe: người sai vai trò gửi thân sai vẫn nhận 403, chưa đăng nhập gửi thân sai nhận 401', async () => {
    const w = await world();
    const doctorToken = await tokenOf(w.doctor.account.taiKhoanId);

    expectErrorResponse(
      await post({ benhNhanId: '1' }, doctorToken),
      403,
      FORBIDDEN,
    );
    expectErrorResponse(await post({ benhNhanId: '1' }), 401, NOT_LOGGED_IN);
  });

  it.each([
    'benhNhanId',
    'bacSiId',
    'chiNhanhId',
    'dichVuKhamId',
    'trangThai',
    'lyDoKham',
  ])(
    'QB-03 thân có khoá "%s" ⇒ 400 TRUONG_KHONG_DUOC_PHEP (chủ sở hữu chỉ từ access token)',
    async (key) => {
      const w = await world();

      const res = await post({ khungGioId: w.slot(0), [key]: '1' }, w.token);

      const body = expectErrorResponse(res, 400, INVALID_DATA);
      expect(body.loi).toStrictEqual([{ truong: key, ma: NOT_ALLOWED }]);
    },
  );

  it('BCK-02 thân sai ⇒ 400 DU_LIEU_KHONG_HOP_LE, lỗi ở đúng trường: khungGioId vắng, số JSON, rỗng, chữ; hoSoNguoiThanId sai; thân là mảng', async () => {
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
  });

  it('BCK-02 hoSoNguoiThanId là null ⇒ hồ sơ bản thân (200, laBanThan = true)', async () => {
    const w = await world();

    const res = await w.checkSlot(0, w.token, null);

    expect(res.status).toBe(200);
    expect(resultOf(res).tomTat.nguoiKham.laBanThan).toBe(true);
  });

  it('khungGioId và hoSoNguoiThanId lớn hơn 2^53 đi bằng CHUỖI: id 2^53 + 1 ⇒ 200; id kề bên ⇒ 404 (không khớp nhầm)', async () => {
    const w = await world();
    await h.db.query(
      'UPDATE khung_gio SET khung_gio_id = ? WHERE khung_gio_id = ?',
      [BIG_A, w.slot(7)],
    );
    const bigRelative = await fx.relative(w.patientId, {
      hoTen: 'Người Thân Lớn',
    });
    await h.db.query(
      'UPDATE ho_so_nguoi_than SET ho_so_nguoi_than_id = ? WHERE ho_so_nguoi_than_id = ?',
      [BIG_A, bigRelative],
    );

    const found = await post(
      { khungGioId: BIG_A, hoSoNguoiThanId: BIG_A },
      w.token,
    );
    const slotBelow = await post({ khungGioId: '9007199254740992' }, w.token);
    const relativeAbove = await post(
      { khungGioId: w.slot(0), hoSoNguoiThanId: '9007199254740994' },
      w.token,
    );

    expect(found.status).toBe(200);
    expect(resultOf(found).tomTat.nguoiKham.hoTen).toBe('Người Thân Lớn');
    expectErrorResponse(slotBelow, 404, 'KHUNG_GIO_KHONG_TON_TAI');
    expectErrorResponse(relativeAbove, 404, NOT_FOUND);
  });
});

describe('POST /booking/checks: lỗi nghiệp vụ (DL-06, DL-09, DL-13, DL-17, DL-18, DL-19)', () => {
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

    const body = expectErrorResponse(
      await w.checkSlot(0, w.token),
      409,
      'LICH_HEN_TRUNG_THOI_GIAN',
    );

    expect(Object.keys(body.chiTiet as object).sort()).toStrictEqual([
      'maLichHen',
      'thoiGian',
    ]);
    expect(body.chiTiet).toMatchObject({ maLichHen: existing.maLichHen });
  });

  it('DL-09 số lịch tối đa: đúng bằng ⇒ 409 VUOT_SO_LICH_HEN_TOI_DA, chiTiet.toiDa; đổi cấu hình thì kết quả đổi', async () => {
    const w = await world();
    await fx.systemConfig({ soLichHenToiDaMoiHoSo: 2 });
    for (const index of [4, 5])
      await fx.appointmentIn('DaXacNhan', {
        doctor: w.doctor.profile,
        khungGioId: w.slot(index),
        patientId: w.patientId,
      });

    const body = expectErrorResponse(
      await w.checkSlot(0, w.token),
      409,
      'VUOT_SO_LICH_HEN_TOI_DA',
    );
    await fx.systemConfig({ soLichHenToiDaMoiHoSo: 3 });

    expect(body.chiTiet).toStrictEqual({ toiDa: 2 });
    expect((await w.checkSlot(0, w.token)).status).toBe(200);
  });

  it('DL-13 bị khoá no-show ⇒ 403 DAT_LICH_BI_KHOA_NO_SHOW cho cả hồ sơ bản thân và người thân (Q14)', async () => {
    const w = await world();
    await lockNoShow(w.patientId);

    expectErrorResponse(
      await w.checkSlot(0, w.token),
      403,
      'DAT_LICH_BI_KHOA_NO_SHOW',
    );
    expectErrorResponse(
      await w.checkSlot(0, w.token, w.relativeId),
      403,
      'DAT_LICH_BI_KHOA_NO_SHOW',
    );
  });

  it('DL-19 chưa có cấu hình hệ thống ⇒ 409 HE_THONG_CHUA_CAU_HINH', async () => {
    const w = await world();
    await h.db.query('DELETE FROM cau_hinh_he_thong');

    expectErrorResponse(
      await w.checkSlot(0, w.token),
      409,
      'HE_THONG_CHUA_CAU_HINH',
    );
  });

  it.each(['DaDuyet', 'ChoDuyet'] as const)(
    'DL-17 cổng nghỉ phép báo %s ⇒ 409 BAC_SI_NGHI_PHEP; cổng chỉ chặn ca khác ⇒ 200',
    async (trangThai) => {
      const w = await world();
      const leave = portOf<DoctorLeavePort>(DOCTOR_LEAVE_PORT);
      const spy = vi
        .spyOn(leave, 'findBlockingLeave')
        .mockResolvedValue({ yeuCauNghiPhepId: '1', trangThai });

      expectErrorResponse(
        await w.checkSlot(0, w.token),
        409,
        'BAC_SI_NGHI_PHEP',
      );
      expect(spy.mock.calls[0]?.[1]).toMatchObject({
        bacSiId: w.doctor.account.taiKhoanId,
        ngay: '2026-11-10',
        ca: 'CaSang',
      });

      spy.mockResolvedValue(null);
      expect((await w.checkSlot(0, w.token)).status).toBe(200);
    },
  );

  it('DL-18 cổng đổi chi nhánh báo vùng bị loại ⇒ 409 KHUNG_GIO_NGOAI_LICH_MOI; không chặn ⇒ 200', async () => {
    const w = await world();
    const pending = portOf<PendingBranchChangesPort>(
      PENDING_BRANCH_CHANGES_PORT,
    );
    const spy = vi
      .spyOn(pending, 'findBlocking')
      .mockResolvedValue({ yeuCauThayDoiChiNhanhId: '1' });

    expectErrorResponse(
      await w.checkSlot(0, w.token),
      409,
      'KHUNG_GIO_NGOAI_LICH_MOI',
    );
    spy.mockResolvedValue(null);
    expect((await w.checkSlot(0, w.token)).status).toBe(200);
  });

  it('BCK-08 thứ tự lỗi qua HTTP: hồ sơ hỏng thắng no-show; khung giờ không có thắng no-show; no-show thắng khung giờ đã đặt', async () => {
    const w = await world();
    await lockNoShow(w.patientId);
    await fx.appointmentIn('DaXacNhan', {
      doctor: w.doctor.profile,
      khungGioId: w.slot(1),
      patientId: w.patientId,
    });

    expectErrorResponse(
      await w.checkSlot(0, w.token, '999999999'),
      404,
      NOT_FOUND,
    );
    expectErrorResponse(
      await post({ khungGioId: '99999999' }, w.token),
      404,
      'KHUNG_GIO_KHONG_TON_TAI',
    );
    expectErrorResponse(
      await w.checkSlot(1, w.token),
      403,
      'DAT_LICH_BI_KHOA_NO_SHOW',
    );
  });
});

describe('POST /booking/checks: Cache-Control (QB-08)', () => {
  it('QB-08 no-store ở 200, ở lỗi nghiệp vụ do dịch vụ ném (404 hồ sơ, 404 khung giờ, 409 đã đặt, 403 no-show) và ở 400 do DTO (thiếu khungGioId, khoá lạ)', async () => {
    const w = await world();
    const responses = [
      await w.checkSlot(0, w.token),
      await w.checkSlot(0, w.token, '999999999'),
      await post({ khungGioId: '99999999' }, w.token),
      await post({}, w.token),
      await post({ khungGioId: w.slot(0), benhNhanId: '1' }, w.token),
    ];
    await fx.appointmentIn('DaXacNhan', {
      doctor: w.doctor.profile,
      khungGioId: w.slot(1),
      patientId: w.patientId,
    });
    responses.push(await w.checkSlot(1, w.token));
    await lockNoShow(w.patientId);
    responses.push(await w.checkSlot(0, w.token));

    expect(responses.map((res) => res.status)).toStrictEqual([
      200, 404, 404, 400, 400, 409, 403,
    ]);
    for (const res of responses)
      expect(res.headers['cache-control'], String(res.status)).toBe('no-store');
  });

  it('QB-08 chưa đăng nhập ⇒ 401 và sai vai trò ⇒ 403 do guard: chỉ khẳng định mã trạng thái, KHÔNG khẳng định gì về cache-control ở hai nhánh này', async () => {
    const w = await world();

    const unauthenticated = await post({ khungGioId: w.slot(0) });
    const wrongRole = await post(
      { khungGioId: w.slot(0) },
      await tokenOf(w.doctor.account.taiKhoanId),
    );

    // Số đo ngày 11/11/2026 (ghi ở TRACKING booking B7-N và mục 5, không ghim ở đây): hai nhánh này KHÔNG có `cache-control` vì guard chạy trước `@Header`. Không ghim thiếu sót đó để test không đỏ vô cớ khi guard được sửa sau.
    expect(unauthenticated.status).toBe(401);
    expect(wrongRole.status).toBe(403);
  });
});
