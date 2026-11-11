import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { SystemConfigRepository } from '../../admin/system-config/system-config.repository.js';
import { SystemConfigService } from '../../admin/system-config/system-config.service.js';
import { AppException } from '../../common/errors/app.exception.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { ExamPriceReader } from '../../pricing/exam-price.reader.js';
import { BranchHoursReader } from '../../scheduling/branch-hours/branch-hours.reader.js';
import { BookabilityReader } from '../slots/bookability.reader.js';
import { BOOKABLE_DAY, BookingFixtures } from '../testing/booking-fixtures.js';
import {
  FakeDoctorLeavePort,
  FakePendingBranchChangesPort,
  FakeWalletBalancePort,
} from '../testing/fake-ports.js';
import {
  recordStatements,
  WRITE_OR_LOCK_SQL,
} from '../testing/statement-recorder.js';
import { BookingChecksService } from './booking-checks.service.js';
import { BookingSummaryReader } from './booking-summary.reader.js';
import { RefundPolicyReader } from './refund-policy.js';

// Task B7 — `BookingChecksService` trên MySQL 8.4 THẬT, MỌI phụ thuộc là bản thật trừ ba cổng Fake (nghỉ phép, đổi chi nhánh, ví): DL-06…DL-12, DL-17, DL-18, DL-19, DL-24, CG-05, CG-06 (mức dịch vụ,
// phần HTTP ở test/booking-checks.e2e-spec.ts) và BCK-05, BCK-06, BCK-08, BCK-09 (TRACKING booking 3.18.3). Ô i của thế giới đặt được bắt đầu lúc 08:00 + 30 phút × i giờ Việt Nam ngày 10/11/2026;
// đồng hồ giả của `useIntegrationHooks` là 08:00 ngày 02/11/2026. Dữ liệu giả. Mã BCK-nn là [đề xuất].
let db: DataSource;
let fx: BookingFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
});

const SLOT_8H = new Date('2026-11-10T08:00:00+07:00');
const BIG_A = '9007199254740993'; // 2^53 + 1

async function world() {
  const w = await fx.world();
  const leave = new FakeDoctorLeavePort();
  const pending = new FakePendingBranchChangesPort();
  const wallet = new FakeWalletBalancePort();
  const service = new BookingChecksService(
    db,
    new SystemConfigService(new SystemConfigRepository(db)),
    new BookabilityReader(new BranchHoursReader(), leave, pending),
    new BookingSummaryReader(new ExamPriceReader(db), new RefundPolicyReader()),
    wallet,
  );
  const patientId = w.patient.account.taiKhoanId;
  const slot = (index: number) => w.slotIds[index]!;
  /** `slotIdOrIndex` là chỉ số ô của thế giới hoặc id viết thẳng; `accountId` mặc định là Bệnh nhân của thế giới. */
  const check = (
    slotIdOrIndex: number | string,
    hoSoNguoiThanId: string | null = null,
    accountId: string = patientId,
  ) =>
    service.check(accountId, {
      khungGioId:
        typeof slotIdOrIndex === 'number' ? slot(slotIdOrIndex) : slotIdOrIndex,
      hoSoNguoiThanId,
    });
  const book = (
    trangThai: Parameters<BookingFixtures['appointmentIn']>[0],
    index: number,
    options: { hoSoNguoiThanId?: string | null } = {},
  ) =>
    fx.appointmentIn(trangThai, {
      doctor: w.doctor.profile,
      khungGioId: slot(index),
      patientId,
      ...options,
    });
  /** Bác sĩ thứ hai cùng chi nhánh với một ca sáng ngày 10/11: ô i cùng GIỜ với ô i của bác sĩ thế giới. */
  const secondDoctor = async () => {
    const doctor = await fx.admin.doctor(w.branch);
    const { slotIds } = await fx.doctor.shiftWithSlots(doctor.profile, {
      ngay: BOOKABLE_DAY,
      ca: 'CaSang',
    });
    return { doctor, slotIds };
  };
  /** Lịch `DaXacNhan` ở ô 0 của MỘT bác sĩ khác (cùng giờ với ô 0 của bác sĩ thế giới); mặc định của Bệnh nhân của thế giới, hồ sơ bản thân. Trả lịch hẹn vừa tạo. */
  const bookAtOtherDoctor = async (
    options: { patientId?: string; hoSoNguoiThanId?: string | null } = {},
  ) => {
    const { doctor, slotIds } = await secondDoctor();
    return fx.appointmentIn('DaXacNhan', {
      doctor: doctor.profile,
      khungGioId: slotIds[0]!,
      patientId,
      ...options,
    });
  };
  return {
    ...w,
    leave,
    pending,
    wallet,
    patientId,
    dichVuKhamId: w.doctor.profile.dichVuKhamId,
    slot,
    check,
    book,
    secondDoctor,
    bookAtOtherDoctor,
  };
}

async function failureOf(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AppException);
  const exception = error as AppException;
  return {
    status: exception.getStatus(),
    body: exception.getResponse() as {
      maLoi: string;
      thongBao: string;
      chiTiet?: unknown;
    },
  };
}

/** Ảnh chụp dữ liệu ghi được: lịch hẹn, khung giờ (trạng thái và hạn giữ), số thông báo, cờ no-show. */
async function dataState() {
  return {
    lichHen: await db.query(
      'SELECT lich_hen_id, trang_thai, khung_gio_id FROM lich_hen ORDER BY lich_hen_id',
    ),
    khungGio: await db.query(
      'SELECT khung_gio_id, trang_thai, giu_cho_den FROM khung_gio ORDER BY khung_gio_id',
    ),
    thongBao: await db.query('SELECT COUNT(*) AS n FROM thong_bao'),
    khoa: await db.query(
      'SELECT tai_khoan_id, khoa_dat_lich_do_no_show FROM benh_nhan ORDER BY tai_khoan_id',
    ),
  };
}

const setDeposit = (dichVuKhamId: string, tienCoc: string) =>
  db.query(
    'UPDATE dich_vu_kham SET muc_dat_coc = ? WHERE dich_vu_kham_id = ?',
    [tienCoc, dichVuKhamId],
  );
const lockNoShow = (accountId: string) =>
  db.query(
    'UPDATE benh_nhan SET khoa_dat_lich_do_no_show = 1 WHERE tai_khoan_id = ?',
    [accountId],
  );

describe('đường thành công và CHỈ ĐỌC (DL-24, BCK-05, BCK-09)', () => {
  it('DL-24, BCK-05 trả đủ tomTat (12 khoá) và thoiGianMayChu; KHÔNG đổi dữ liệu (lịch hẹn, khung giờ, thông báo, cờ no-show trước và sau bằng nhau)', async () => {
    const w = await world();
    const before = await dataState();

    const result = await w.check(0);

    expect(Object.keys(result).sort()).toStrictEqual([
      'thoiGianMayChu',
      'tomTat',
    ]);
    expect(Object.keys(result.tomTat)).toHaveLength(12);
    expect(result.tomTat).toMatchObject({
      dichVu: { thoiLuongPhut: 30 },
      bacSi: { hoTen: w.doctor.account.hoTen, chucDanh: 'BS' },
      chiNhanh: { ten: w.branch.ten, diaChi: w.branch.diaChi },
      thoiGian: '2026-11-10T01:00:00.000Z',
      nguoiKham: { hoTen: w.patient.account.hoTen, laBanThan: true },
      giaDichVu: '100000.00',
      phuPhi: '0.00',
      giaApDung: '100000.00',
      tienCoc: '0.00',
      chinhSachHoan: null,
      soDuVi: null,
    });
    // đồng hồ giả: 08:00 ngày 02/11/2026 giờ Việt Nam = 01:00Z
    expect(result.thoiGianMayChu).toBe('2026-11-02T01:00:00.000Z');
    expect(await dataState()).toStrictEqual(before);
  });

  it('BCK-09 mọi câu SQL của một lần gọi chỉ là SELECT (và SET/START/COMMIT của giao dịch): không FOR UPDATE, FOR SHARE, INSERT, UPDATE, DELETE; MỘT giao dịch READ ONLY', async () => {
    const w = await world();
    const statements = recordStatements(db);

    await w.check(0);

    expect(statements.length).toBeGreaterThan(5);
    for (const sql of statements) {
      expect(sql, sql).toMatch(
        /^\s*(SELECT|SET TRANSACTION|START TRANSACTION|COMMIT)\b/i,
      );
      expect(sql, sql).not.toMatch(WRITE_OR_LOCK_SQL);
    }
    const starts = statements.filter((sql) =>
      /^\s*START TRANSACTION/i.test(sql),
    );
    const commits = statements.filter((sql) => /^\s*COMMIT/i.test(sql));
    expect(starts).toHaveLength(1);
    expect(commits).toHaveLength(1);
    const readOnlyAt = statements.findIndex((sql) =>
      /SET TRANSACTION READ ONLY/i.test(sql),
    );
    expect(readOnlyAt).toBeGreaterThanOrEqual(0);
    expect(readOnlyAt).toBeLessThan(
      statements.findIndex((sql) => /^\s*START TRANSACTION/i.test(sql)),
    );
  });

  it('BCK-09 lỗi nghiệp vụ cũng không ghi gì: khung giờ đã đặt ⇒ 409, dữ liệu trước và sau bằng nhau', async () => {
    const w = await world();
    await w.book('DaXacNhan', 1);
    const before = await dataState();

    const { status, body } = await failureOf(w.check(1));

    expect(status).toBe(409);
    expect(body.maLoi).toBe('KHUNG_GIO_DA_DAT');
    expect(await dataState()).toStrictEqual(before);
  });

  it('BCK-06 cọc > 0: soDuVi lấy từ cổng ví đúng MỘT lần với accountId của token; cọc 0 thì không gọi; chính sách hoàn kèm theo', async () => {
    const w = await world();
    w.wallet.availableCall.returns('120000.00');

    const free = await w.check(0);
    expect(free.tomTat.soDuVi).toBeNull();
    expect(w.wallet.availableCall.calls).toHaveLength(0);

    await setDeposit(w.dichVuKhamId, '50000.00');
    await db.query(
      'INSERT INTO moc_hoan_tien (dich_vu_kham_id, so_gio_truoc_toi_thieu, ty_le_hoan) VALUES (?, 2, 50), (?, 24, 100)',
      [w.dichVuKhamId, w.dichVuKhamId],
    );
    const paid = await w.check(0);

    expect(paid.tomTat.tienCoc).toBe('50000.00');
    expect(paid.tomTat.soDuVi).toBe('120000.00');
    expect(w.wallet.availableCall.calls).toStrictEqual([[w.patientId]]);
    expect(paid.tomTat.chinhSachHoan).toStrictEqual([
      { soGioTruocToiThieu: 24, tyLeHoan: 100 },
      { soGioTruocToiThieu: 2, tyLeHoan: 50 },
    ]);
  });

  it('BCK-06 cổng ví trả null (chưa có ví thật) ⇒ soDuVi null dù cọc > 0; khoá vẫn có mặt', async () => {
    const w = await world();
    await setDeposit(w.dichVuKhamId, '50000.00');

    const result = await w.check(0);

    expect('soDuVi' in result.tomTat).toBe(true);
    expect(result.tomTat.soDuVi).toBeNull();
  });
});

describe('số lịch, trùng giờ, đồng hồ (DL-06 đến DL-10)', () => {
  it('DL-06 trùng giờ với lịch của CHÍNH hồ sơ này ⇒ 409 LICH_HEN_TRUNG_THOI_GIAN, chiTiet đúng hai khoá', async () => {
    const w = await world();
    const existing = await w.bookAtOtherDoctor();

    const { status, body } = await failureOf(w.check(0));

    expect(status).toBe(409);
    expect(body.maLoi).toBe('LICH_HEN_TRUNG_THOI_GIAN');
    expect(Object.keys(body.chiTiet as object).sort()).toStrictEqual([
      'maLichHen',
      'thoiGian',
    ]);
    expect(body.chiTiet).toMatchObject({ maLichHen: existing.maLichHen });
  });

  it('DL-06 lịch của HỒ SƠ KHÁC (người thân cùng tài khoản) hoặc của bệnh nhân khác cùng giờ KHÔNG gây lỗi và không lộ', async () => {
    const w = await world();
    await w.bookAtOtherDoctor({ hoSoNguoiThanId: w.relativeId });
    const stranger = await fx.admin.patient();
    await w.bookAtOtherDoctor({ patientId: stranger.account.taiKhoanId });

    const result = await w.check(0);

    expect(result.tomTat.nguoiKham.laBanThan).toBe(true);
  });

  it('DL-07 biên chạm đầu mút (lịch kết thúc đúng lúc ô này bắt đầu) ⇒ 200', async () => {
    const w = await world();
    await w.bookAtOtherDoctor();

    await expect(w.check(1)).resolves.toMatchObject({
      tomTat: { thoiGian: '2026-11-10T01:30:00.000Z' },
    });
  });

  it('DL-08 hai hồ sơ CÙNG giờ ⇒ 200 cho cả hai; cùng bác sĩ khác giờ ⇒ 200', async () => {
    const w = await world();
    await w.bookAtOtherDoctor();
    await w.book('DaXacNhan', 3, { hoSoNguoiThanId: w.relativeId });

    const forRelative = await w.check(0, w.relativeId);
    const sameDoctorOtherTime = await w.check(1, w.relativeId);

    expect(forRelative.tomTat.nguoiKham.laBanThan).toBe(false);
    expect(sameDoctorOtherTime.tomTat.nguoiKham.laBanThan).toBe(false);
  });

  it('DL-09 số lịch tối đa (cấu hình 2): thiếu 1 ⇒ 200; đúng bằng ⇒ 409 chiTiet.toiDa; đổi cấu hình thì kết quả đổi theo', async () => {
    const w = await world();
    await fx.systemConfig({ soLichHenToiDaMoiHoSo: 2 });
    await w.book('DaXacNhan', 4);

    await expect(w.check(0)).resolves.toBeDefined();
    await w.book('DaXacNhan', 5);
    const { status, body } = await failureOf(w.check(0));
    await fx.systemConfig({ soLichHenToiDaMoiHoSo: 3 });

    expect(status).toBe(409);
    expect(body.maLoi).toBe('VUOT_SO_LICH_HEN_TOI_DA');
    expect(body.chiTiet).toStrictEqual({ toiDa: 2 });
    await expect(w.check(0)).resolves.toBeDefined();
  });

  it.each(['DaHuy', 'HoanThanh', 'VangMat', 'DaDoiLich'] as const)(
    'DL-09 lịch %s KHÔNG tính vào số lịch tối đa',
    async (trangThai) => {
      const w = await world();
      await fx.systemConfig({ soLichHenToiDaMoiHoSo: 2 });
      await w.book(trangThai, 4);
      await w.book(trangThai, 5);

      await expect(w.check(0)).resolves.toBeDefined();
    },
  );

  it('DL-09 lịch ChoThanhToan của chính mình CÓ tính', async () => {
    const w = await world();
    await fx.systemConfig({ soLichHenToiDaMoiHoSo: 2 });
    await w.book('ChoThanhToan', 4);
    await w.book('ChoThanhToan', 5);

    const { body } = await failureOf(w.check(0));

    expect(body.maLoi).toBe('VUOT_SO_LICH_HEN_TOI_DA');
  });

  it('DL-10 đồng hồ giả: ngay_gio = now và now - 1s ⇒ 409 KHUNG_GIO_DA_QUA; now + 1s trước giờ bắt đầu ⇒ 200', async () => {
    const w = await world();

    vi.setSystemTime(SLOT_8H);
    expect((await failureOf(w.check(0))).body.maLoi).toBe('KHUNG_GIO_DA_QUA');
    vi.setSystemTime(new Date(SLOT_8H.getTime() + 1000));
    expect((await failureOf(w.check(0))).body.maLoi).toBe('KHUNG_GIO_DA_QUA');
    vi.setSystemTime(new Date(SLOT_8H.getTime() - 1000));
    await expect(w.check(0)).resolves.toBeDefined();
  });
});

describe('hồ sơ đi khám (DL-11, DL-12) và id lớn hơn 2^53', () => {
  it('DL-11 hồ sơ của mình đã ngừng ⇒ 409 HO_SO_NGUOI_THAN_DA_NGUNG; không ghi gì', async () => {
    const w = await world();
    const before = await dataState();

    const { status, body } = await failureOf(w.check(0, w.stoppedRelativeId));

    expect(status).toBe(409);
    expect(body.maLoi).toBe('HO_SO_NGUOI_THAN_DA_NGUNG');
    expect(await dataState()).toStrictEqual(before);
  });

  it('DL-12 hồ sơ của người khác và id không tồn tại ⇒ CÙNG 404 KHONG_TIM_THAY, thân giống nhau từng chữ', async () => {
    const w = await world();
    const stranger = await fx.admin.patient();
    const theirs = await fx.relative(stranger.account.taiKhoanId);

    const ofOther = await failureOf(w.check(0, theirs));
    const missing = await failureOf(w.check(0, '999999999'));

    expect(ofOther.status).toBe(404);
    expect(ofOther.body.maLoi).toBe('KHONG_TIM_THAY');
    expect(JSON.stringify(ofOther.body)).toBe(JSON.stringify(missing.body));
  });

  it('khungGioId lớn hơn 2^53 đi bằng CHUỖI: id 2^53 + 1 tìm thấy, id kề bên (2^53 và 2^53 + 2) ⇒ 404 KHUNG_GIO_KHONG_TON_TAI', async () => {
    const w = await world();
    await db.query(
      'UPDATE khung_gio SET khung_gio_id = ? WHERE khung_gio_id = ?',
      [BIG_A, w.slot(7)],
    );

    const found = await w.check(BIG_A);
    const below = await failureOf(w.check('9007199254740992'));
    const above = await failureOf(w.check('9007199254740994'));

    expect(found.tomTat.thoiGian).toBe('2026-11-10T04:30:00.000Z');
    expect(below.body.maLoi).toBe('KHUNG_GIO_KHONG_TON_TAI');
    expect(above.body.maLoi).toBe('KHUNG_GIO_KHONG_TON_TAI');
  });

  it('hoSoNguoiThanId lớn hơn 2^53 đi bằng CHUỖI: id 2^53 + 1 ⇒ 200 với tên người thân; id kề bên ⇒ 404 KHONG_TIM_THAY', async () => {
    const w = await world();
    const relativeId = await fx.relative(w.patientId, {
      hoTen: 'Người Thân Số Lớn',
    });
    await db.query(
      'UPDATE ho_so_nguoi_than SET ho_so_nguoi_than_id = ? WHERE ho_so_nguoi_than_id = ?',
      [BIG_A, relativeId],
    );

    const found = await w.check(0, BIG_A);
    const below = await failureOf(w.check(0, '9007199254740992'));
    const above = await failureOf(w.check(0, '9007199254740994'));

    expect(found.tomTat.nguoiKham).toStrictEqual({
      hoTen: 'Người Thân Số Lớn',
      laBanThan: false,
    });
    expect(below.body.maLoi).toBe('KHONG_TIM_THAY');
    expect(above.body.maLoi).toBe('KHONG_TIM_THAY');
  });
});

describe('khoá no-show, cấu hình, cổng (DL-13, DL-17, DL-18, DL-19, CG-05, CG-06)', () => {
  it('DL-13 bị khoá no-show ⇒ 403 DAT_LICH_BI_KHOA_NO_SHOW; khoá áp cả hồ sơ người thân (Q14); cờ bật giữa hai lần gọi thì lần sau thấy ngay', async () => {
    const w = await world();
    await expect(w.check(0)).resolves.toBeDefined();

    await lockNoShow(w.patientId);
    const self = await failureOf(w.check(0));
    const relative = await failureOf(w.check(0, w.relativeId));

    expect(self.status).toBe(403);
    expect(self.body.maLoi).toBe('DAT_LICH_BI_KHOA_NO_SHOW');
    expect(relative.status).toBe(403);
    expect(relative.body.maLoi).toBe('DAT_LICH_BI_KHOA_NO_SHOW');
  });

  it('DL-19 không có dòng cau_hinh_he_thong ⇒ 409 HE_THONG_CHUA_CAU_HINH; không ghi gì', async () => {
    const w = await world();
    await db.query('DELETE FROM cau_hinh_he_thong');
    const before = await dataState();

    const { status, body } = await failureOf(w.check(0));

    expect(status).toBe(409);
    expect(body.maLoi).toBe('HE_THONG_CHUA_CAU_HINH');
    expect(await dataState()).toStrictEqual(before);
  });

  it.each(['DaDuyet', 'ChoDuyet'] as const)(
    'DL-17, CG-05 cổng nghỉ phép giả báo %s ⇒ 409 BAC_SI_NGHI_PHEP; cổng nhận đúng bác sĩ, ngày, ca',
    async (trangThai) => {
      const w = await world();
      w.leave.blocks({}, trangThai);

      const { status, body } = await failureOf(w.check(0));

      expect(status).toBe(409);
      expect(body.maLoi).toBe('BAC_SI_NGHI_PHEP');
      expect(w.leave.findBlockingLeaveCall.calls[0]?.[1]).toMatchObject({
        bacSiId: w.doctor.account.taiKhoanId,
        ngay: BOOKABLE_DAY,
        ca: 'CaSang',
      });
    },
  );

  it('DL-17, CG-05 cổng chỉ chặn ca KHÁC (chiều) ⇒ 200', async () => {
    const w = await world();
    w.leave.blocks({ ca: 'CaChieu' });

    await expect(w.check(0)).resolves.toBeDefined();
  });

  it('DL-18, CG-06 cổng đổi chi nhánh giả báo vùng bị loại ⇒ 409 KHUNG_GIO_NGOAI_LICH_MOI; cổng nhận đúng chi nhánh, giờ, thời lượng, dịch vụ', async () => {
    const w = await world();
    w.pending.blocks();

    const { status, body } = await failureOf(w.check(0));

    expect(status).toBe(409);
    expect(body.maLoi).toBe('KHUNG_GIO_NGOAI_LICH_MOI');
    const sent = w.pending.findBlockingCall.calls[0]?.[1];
    expect(sent).toMatchObject({
      chiNhanhId: w.branch.chiNhanhId,
      thoiLuongPhut: 30,
      dichVuKhamId: w.dichVuKhamId,
    });
    expect(sent?.ngayGio.getTime()).toBe(SLOT_8H.getTime());
  });

  it('DL-18, CG-06 cổng chỉ chặn chi nhánh khác ⇒ 200', async () => {
    const w = await world();
    w.pending.blocks({ chiNhanhId: '999999' });

    await expect(w.check(0)).resolves.toBeDefined();
  });
});

describe('thứ tự lỗi (BCK-08)', () => {
  it('BCK-08 cấu hình hệ thống thắng mọi thứ: không cấu hình + tài khoản không phải Bệnh nhân + khung giờ không có ⇒ 409 HE_THONG_CHUA_CAU_HINH', async () => {
    const w = await world();
    await db.query('DELETE FROM cau_hinh_he_thong');

    const { body } = await failureOf(
      w.check('99999999', null, w.doctor.account.taiKhoanId),
    );

    expect(body.maLoi).toBe('HE_THONG_CHUA_CAU_HINH');
  });

  it('BCK-08 hàng benh_nhan thắng hồ sơ và khung giờ: tài khoản không có hàng benh_nhan (Bác sĩ) ⇒ 403 KHONG_DU_QUYEN dù hồ sơ và khung giờ đều sai', async () => {
    const w = await world();

    const { status, body } = await failureOf(
      w.check('99999999', '999999999', w.doctor.account.taiKhoanId),
    );

    expect(status).toBe(403);
    expect(body.maLoi).toBe('KHONG_DU_QUYEN');
  });

  it('BCK-08 hồ sơ thắng khung giờ không có và no-show: hồ sơ của người khác ⇒ 404 KHONG_TIM_THAY dù khung giờ không có và Bệnh nhân bị khoá', async () => {
    const w = await world();
    await lockNoShow(w.patientId);

    const { body } = await failureOf(w.check('99999999', '999999999'));

    expect(body.maLoi).toBe('KHONG_TIM_THAY');
  });

  it('BCK-08 hồ sơ đã ngừng thắng khung giờ không có ⇒ 409 HO_SO_NGUOI_THAN_DA_NGUNG', async () => {
    const w = await world();

    const { body } = await failureOf(w.check('99999999', w.stoppedRelativeId));

    expect(body.maLoi).toBe('HO_SO_NGUOI_THAN_DA_NGUNG');
  });

  it('BCK-08 khung giờ không có thắng no-show (no-show là kiểm tra đầu của LUẬT, sau bước đọc khung giờ) ⇒ 404 KHUNG_GIO_KHONG_TON_TAI', async () => {
    const w = await world();
    await lockNoShow(w.patientId);

    const { status, body } = await failureOf(w.check('99999999'));

    expect(status).toBe(404);
    expect(body.maLoi).toBe('KHUNG_GIO_KHONG_TON_TAI');
  });

  it('BCK-08 no-show thắng khung giờ đã đặt (kiểm tra đầu của luật, A4) ⇒ 403 DAT_LICH_BI_KHOA_NO_SHOW', async () => {
    const w = await world();
    await w.book('DaXacNhan', 1);
    await lockNoShow(w.patientId);

    const { body } = await failureOf(w.check(1));

    expect(body.maLoi).toBe('DAT_LICH_BI_KHOA_NO_SHOW');
  });
});
