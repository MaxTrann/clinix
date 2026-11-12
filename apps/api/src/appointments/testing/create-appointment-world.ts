import type { DataSource } from 'typeorm';
import { expect } from 'vitest';
import { SystemConfigRepository } from '../../admin/system-config/system-config.repository.js';
import { SystemConfigService } from '../../admin/system-config/system-config.service.js';
import { AppException } from '../../common/errors/app.exception.js';
import { ExamPriceReader } from '../../pricing/exam-price.reader.js';
import { BranchHoursReader } from '../../scheduling/branch-hours/branch-hours.reader.js';
import {
  randomCodeSuffix,
  type CodeSuffixSource,
} from '../appointment-code.js';
import { BookingChecksService } from '../create/booking-checks.service.js';
import { BookingSummaryReader } from '../create/booking-summary.reader.js';
import { CreateAppointmentService } from '../create/create-appointment.service.js';
import { RefundPolicyReader } from '../create/refund-policy.js';
import { withBookingTransaction } from '../locking/booking-transaction.js';
import { BookabilityReader } from '../slots/bookability.reader.js';
import { SlotHoldService } from '../slots/slot-hold.service.js';
import { lockSlot } from '../slots/slot-lock.js';
import { BOOKABLE_DAY, BookingFixtures } from './booking-fixtures.js';
import { withRowLock } from './concurrency-harness.js';
import {
  FakeAppointmentNotifier,
  FakeDoctorLeavePort,
  FakePaymentPort,
  FakePendingBranchChangesPort,
  FakeWalletBalancePort,
} from './fake-ports.js';
import { assertBookingInvariants } from './invariants.js';

// Dựng "thế giới tạo lịch" cho int-spec và e2e của B8 (task B8; TRACKING 3.21 B8-H): `CreateAppointmentService` THẬT trên MySQL thật, mọi phụ thuộc là bản thật trừ các cổng `Fake` (nghỉ phép,
// đổi chi nhánh, thanh toán, thông báo, ví). Gom một chỗ vì ba file (service, đồng thời, hai lối vào) cùng cần, và jscpd quét `*.int-spec.ts`. Ô i của thế giới bắt đầu lúc 08:00 + 30 phút × i
// giờ Việt Nam ngày 10/11/2026 (thứ Ba); đồng hồ giả của `useIntegrationHooks` là 08:00 ngày 02/11/2026; hạn giữ chỗ mặc định 15 phút. Mọi dữ liệu là giả.

const TS = (column: string) => `DATE_FORMAT(${column}, '%Y-%m-%d %H:%i:%s')`;

/** Hàng `lich_hen` đọc ra để so (id là CHUỖI; ngày giờ là chuỗi giờ Việt Nam; tiền là chuỗi decimal). */
export interface LichHenRow {
  id: string;
  ma: string;
  khungGioId: string;
  benhNhanId: string;
  hoSoNguoiThanId: string | null;
  bacSiId: string;
  chiNhanhId: string;
  dichVuKhamId: string;
  thoiGian: string;
  gia: string;
  coc: string;
  /** Mảng JSON đã parse (X1 M7) hoặc `null` */
  chinhSach: unknown;
  /** `IS NULL` của SQL (1 khi SQL NULL; JSON `null` ghi nhầm cho 0) */
  chinhSachSqlNull: number | string;
  trangThai: string;
  han: string | null;
  thoiDiemTao: string;
  thoiDiemHuy: string | null;
  lyDoHuy: string | null;
  lyDoKham: string | null;
  dangGiu: string | null;
}

/** Mọi hàng `lich_hen` theo `lich_hen_id` tăng dần. */
export function lichHenRows(db: DataSource): Promise<LichHenRow[]> {
  return db.query(
    `SELECT CAST(lich_hen_id AS CHAR) AS id, ma_lich_hen AS ma, CAST(khung_gio_id AS CHAR) AS khungGioId, CAST(benh_nhan_id AS CHAR) AS benhNhanId,
      CAST(ho_so_nguoi_than_id AS CHAR) AS hoSoNguoiThanId, CAST(bac_si_id AS CHAR) AS bacSiId, CAST(chi_nhanh_id AS CHAR) AS chiNhanhId,
      CAST(dich_vu_kham_id AS CHAR) AS dichVuKhamId, ${TS('thoi_gian')} AS thoiGian, CAST(gia_snapshot AS CHAR) AS gia, CAST(tien_coc_snapshot AS CHAR) AS coc,
      chinh_sach_hoan_snapshot AS chinhSach, (chinh_sach_hoan_snapshot IS NULL) AS chinhSachSqlNull, trang_thai AS trangThai, ${TS('han_thanh_toan')} AS han,
      ${TS('thoi_diem_tao')} AS thoiDiemTao, ${TS('thoi_diem_huy')} AS thoiDiemHuy, ly_do_huy AS lyDoHuy, ly_do_kham AS lyDoKham,
      CAST(khung_gio_dang_giu AS CHAR) AS dangGiu
     FROM lich_hen ORDER BY lich_hen_id`,
  );
}

/** Ảnh chụp dữ liệu GHI được: lịch hẹn, khung giờ (trạng thái và hạn giữ), số thông báo, cờ no-show (như B7). Trước và sau một lần bị từ chối phải bằng nhau. */
export async function dataState(db: DataSource) {
  return {
    lichHen: await db.query(
      'SELECT lich_hen_id, trang_thai, khung_gio_id FROM lich_hen ORDER BY lich_hen_id',
    ),
    khungGio: await db.query(
      `SELECT khung_gio_id, trang_thai, ${TS('giu_cho_den')} AS giu_cho_den FROM khung_gio ORDER BY khung_gio_id`,
    ),
    thongBao: await db.query('SELECT COUNT(*) AS n FROM thong_bao'),
    khoa: await db.query(
      'SELECT tai_khoan_id, khoa_dat_lich_do_no_show FROM benh_nhan ORDER BY tai_khoan_id',
    ),
  };
}

/** Lỗi `AppException` của một lời gọi bị từ chối: trạng thái HTTP và thân. Ca nào KHÔNG bị từ chối thì đỏ ở `toBeInstanceOf`. */
export async function failureOf(promise: Promise<unknown>) {
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

/** Deadlock giả (1213) đúng hình lỗi mà `isDeadlockError` nhận ra; dùng với `failAfterStatement` để ép `withBookingTransaction` chạy lại thân (TAO-10). */
export const deadlockError = () =>
  Object.assign(new Error('Deadlock found when trying to get lock'), {
    errno: 1213,
    code: 'ER_LOCK_DEADLOCK',
  });

/** Chạy một câu khoá `NOWAIT` từ MỘT KẾT NỐI KHÁC: `null` nếu khoá được ngay (không ai giữ), ngược lại số lỗi MySQL (3572 = đang bị giữ). */
export function nowaitErrno(
  db: DataSource,
  sql: string,
  params: unknown[],
): Promise<number | null> {
  // `withRowLock` của harness: khoá được ngay thì chạy việc rỗng rồi nhả (trả null); câu khoá lỗi thì giữ nguyên lỗi MySQL để lấy số
  return withRowLock(db, { sql, params }, () =>
    Promise.resolve<number | null>(null),
  ).catch(
    (error: unknown) =>
      (error as { driverError?: { errno?: number } }).driverError?.errno ?? -1,
  );
}

/** Xoá mọi lịch hẹn và đặt mọi khung giờ về `ConTrong`: dựng lại trạng thái đầu mỗi vòng của ca đồng thời (không đụng bác sĩ, ca, khung giờ). */
export async function resetBookingData(db: DataSource): Promise<void> {
  await db.query('DELETE FROM lich_hen');
  await db.query(
    "UPDATE khung_gio SET trang_thai = 'ConTrong', giu_cho_den = NULL",
  );
}

type World = Awaited<ReturnType<BookingFixtures['world']>>;

/** Bác sĩ thứ hai cùng chi nhánh với một ca sáng ngày `BOOKABLE_DAY`: ô i cùng GIỜ với ô i của bác sĩ của thế giới (int-spec của B7 và B8 dùng chung). */
export async function secondDoctorOf(
  fx: BookingFixtures,
  branch: World['branch'],
) {
  const doctor = await fx.admin.doctor(branch);
  const { slotIds } = await fx.doctor.shiftWithSlots(doctor.profile, {
    ngay: BOOKABLE_DAY,
    ca: 'CaSang',
  });
  return { doctor, slotIds };
}

/** Lịch `DaXacNhan` ở ô 0 của MỘT bác sĩ khác (cùng giờ với ô 0 của bác sĩ thế giới) của `patientId` (mặc định) hay `extra.patientId`; trả lịch hẹn vừa tạo. */
export async function bookAtOtherDoctorOf(
  fx: BookingFixtures,
  branch: World['branch'],
  patientId: string,
  extra: { patientId?: string; hoSoNguoiThanId?: string | null } = {},
) {
  const { doctor, slotIds } = await secondDoctorOf(fx, branch);
  return fx.appointmentIn('DaXacNhan', {
    doctor: doctor.profile,
    khungGioId: slotIds[0]!,
    patientId,
    ...extra,
  });
}

export const ER_LOCK_NOWAIT = 3572;

/** Khoá `FOR UPDATE NOWAIT` của ba hàng mà luồng tạo xin: `benh_nhan`, `bac_si`, `khung_gio`. Tất cả `null` ⇒ không khoá nào còn bị giữ (sau commit hay hoàn tác). */
export async function lockErrnos(
  db: DataSource,
  ids: { benhNhanId: string; bacSiId: string; khungGioId: string },
) {
  return {
    benhNhan: await nowaitErrno(
      db,
      'SELECT tai_khoan_id FROM benh_nhan WHERE tai_khoan_id = ? FOR UPDATE NOWAIT',
      [ids.benhNhanId],
    ),
    bacSi: await nowaitErrno(
      db,
      'SELECT tai_khoan_id FROM bac_si WHERE tai_khoan_id = ? FOR UPDATE NOWAIT',
      [ids.bacSiId],
    ),
    khungGio: await nowaitErrno(
      db,
      'SELECT khung_gio_id FROM khung_gio WHERE khung_gio_id = ? FOR UPDATE NOWAIT',
      [ids.khungGioId],
    ),
  };
}

/** Các câu BÊN TRONG giao dịch (giữa `START TRANSACTION` cuối cùng và `COMMIT` kế tiếp) trong danh sách câu của `recordStatements`. */
export function transactionOf(statements: readonly string[]): string[] {
  const start = statements.findLastIndex((sql) =>
    /^START TRANSACTION/i.test(sql),
  );
  const end = statements.findIndex(
    (sql, index) => index > start && /^COMMIT/i.test(sql),
  );
  if (start < 0 || end < 0)
    throw new Error('không thấy một giao dịch trọn vẹn trong các câu đã ghi');
  return statements.slice(start + 1, end);
}

/** Nhãn `INSERT INTO lich_hen`, `UPDATE khung_gio`… của các câu GHI (INSERT, UPDATE, DELETE, REPLACE) trong một danh sách câu. */
export function writeTargets(statements: readonly string[]): string[] {
  return statements.flatMap((sql) => {
    const match =
      /^\s*(INSERT INTO|UPDATE|DELETE FROM|REPLACE INTO)\s+(\w+)/i.exec(sql);
    return match ? [`${match[1]!.toUpperCase()} ${match[2]!}`] : [];
  });
}

/**
 * Hàm GIẢ cho đường `confirmPaid` của B11 (chưa có): đi ĐÚNG chuỗi khoá của PLAN 5.3 (`khung_gio` rồi `lich_hen` theo khoá chính), đổi lịch `ChoThanhToan` → `DaXacNhan` với
 * `han_thanh_toan` NULL và khung giờ `DangGiuCho` → `DaDat`. Chỉ để TAO-11 chứng minh hai lối vào `DaXacNhan` (INSERT của B8 và confirmPaid) cùng giữ INV-01…INV-05; B11 thay bằng hàm thật.
 */
export function simulateConfirmPaid(
  db: DataSource,
  ids: { khungGioId: string; lichHenId: string },
): Promise<void> {
  return withBookingTransaction(
    db,
    async (em) => {
      const slot = await lockSlot(em, ids.khungGioId);
      if (slot === null) throw new Error('khung giờ không còn');
      await em.query(
        'SELECT lich_hen_id FROM lich_hen WHERE lich_hen_id = ? FOR UPDATE',
        [ids.lichHenId],
      );
      const updated: { affectedRows?: number } = await em.query(
        "UPDATE lich_hen SET trang_thai = 'DaXacNhan', han_thanh_toan = NULL WHERE lich_hen_id = ? AND trang_thai = 'ChoThanhToan'",
        [ids.lichHenId],
      );
      if (updated.affectedRows !== 1)
        throw new Error('lịch không còn ChoThanhToan');
      const booked = await new SlotHoldService().markBooked(em, slot);
      if (booked.kind !== 'Done') throw new Error('markBooked không Done');
    },
    { label: 'simulate-confirm-paid' },
  );
}

export interface CreateWorldOptions {
  /** Bộ sinh phần đuôi mã lịch; mặc định là bản thật (`crypto.randomInt`) */
  random?: CodeSuffixSource;
}

/** Thế giới đặt được của `BookingFixtures.world()` cộng `CreateAppointmentService` thật, `BookingChecksService` thật và các cổng `Fake`. */
export async function createAppointmentWorld(
  db: DataSource,
  fx: BookingFixtures,
  options: CreateWorldOptions = {},
) {
  const w = await fx.world();
  const leave = new FakeDoctorLeavePort();
  const pending = new FakePendingBranchChangesPort();
  const payment = new FakePaymentPort();
  const notifier = new FakeAppointmentNotifier();
  const wallet = new FakeWalletBalancePort();
  const config = new SystemConfigService(new SystemConfigRepository(db));
  const reader = new BookabilityReader(new BranchHoursReader(), leave, pending);
  const summaries = new BookingSummaryReader(
    new ExamPriceReader(db),
    new RefundPolicyReader(),
  );
  const service = new CreateAppointmentService(
    db,
    config,
    reader,
    new SlotHoldService(),
    summaries,
    payment,
    notifier,
    options.random ?? randomCodeSuffix,
  );
  const checks = new BookingChecksService(
    db,
    config,
    reader,
    summaries,
    wallet,
  );
  const patientId = w.patient.account.taiKhoanId;
  const doctorId = w.doctor.account.taiKhoanId;
  const dichVuKhamId = w.doctor.profile.dichVuKhamId;
  const slot = (index: number) => w.slotIds[index]!;
  const slotRef = (index: number | string) =>
    typeof index === 'number' ? slot(index) : index;
  /** `slotIdOrIndex` là chỉ số ô hay id viết thẳng; `accountId` mặc định là Bệnh nhân của thế giới. */
  const create = (
    slotIdOrIndex: number | string,
    extra: { hoSoNguoiThanId?: string | null; lyDoKham?: string | null } = {},
    accountId: string = patientId,
  ) =>
    service.create(accountId, {
      khungGioId: slotRef(slotIdOrIndex),
      hoSoNguoiThanId: extra.hoSoNguoiThanId ?? null,
      lyDoKham: extra.lyDoKham ?? null,
    });
  const check = (
    slotIdOrIndex: number | string,
    hoSoNguoiThanId: string | null = null,
  ) =>
    checks.check(patientId, {
      khungGioId: slotRef(slotIdOrIndex),
      hoSoNguoiThanId,
    });
  /** Lịch hẹn dựng sẵn bằng fixture (kèm khung giờ nhất quán) ở ô `index` của bác sĩ của thế giới. */
  const book = (
    trangThai: Parameters<BookingFixtures['appointmentIn']>[0],
    index: number,
    extra: {
      patientId?: string;
      hoSoNguoiThanId?: string | null;
      maLichHen?: string;
      hanThanhToan?: Date;
    } = {},
  ) =>
    fx.appointmentIn(trangThai, {
      doctor: w.doctor.profile,
      khungGioId: slot(index),
      patientId,
      ...extra,
    });
  /** Bác sĩ thứ hai cùng chi nhánh với một ca sáng ngày 10/11: ô i cùng GIỜ với ô i của bác sĩ thế giới. */
  const secondDoctor = () => secondDoctorOf(fx, w.branch);
  const bookAtOtherDoctor = (
    extra: { patientId?: string; hoSoNguoiThanId?: string | null } = {},
  ) => bookAtOtherDoctorOf(fx, w.branch, patientId, extra);
  const lockNoShow = (accountId: string = patientId) =>
    db.query(
      'UPDATE benh_nhan SET khoa_dat_lich_do_no_show = 1 WHERE tai_khoan_id = ?',
      [accountId],
    );
  /** Bất biến INV-01…INV-05 và không còn khoá nào bị giữ trên ba hàng của luồng tạo (sau commit hay hoàn tác). */
  const expectSettled = async (index: number = 0) => {
    await assertBookingInvariants(db);
    expect(
      await lockErrnos(db, {
        benhNhanId: patientId,
        bacSiId: doctorId,
        khungGioId: slot(index),
      }),
    ).toStrictEqual({ benhNhan: null, bacSi: null, khungGio: null });
  };
  return {
    ...w,
    leave,
    pending,
    payment,
    notifier,
    wallet,
    service,
    checks,
    patientId,
    doctorId,
    dichVuKhamId,
    slot,
    create,
    check,
    book,
    secondDoctor,
    bookAtOtherDoctor,
    lockNoShow,
    expectSettled,
    /** Đặt cọc của dịch vụ của bác sĩ thế giới (và mốc hoàn nếu có) */
    deposit: (
      tienCoc: string,
      tiers: readonly (readonly [number, number])[] = [],
    ) => fx.depositService(dichVuKhamId, tienCoc, tiers),
  };
}

export type CreateWorld = Awaited<ReturnType<typeof createAppointmentWorld>>;
