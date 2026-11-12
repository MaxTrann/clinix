import type { DataSource } from 'typeorm';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import { SystemConfigRepository } from '../../admin/system-config/system-config.repository.js';
import { SystemConfigService } from '../../admin/system-config/system-config.service.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';
import { ReceptionScopeRepository } from '../../rbac/reception-scope.repository.js';
import { ReceptionScopeService } from '../../rbac/reception-scope.service.js';
import { AppointmentCancellationService } from '../cancel/appointment-cancellation.service.js';
import { withBookingTransaction } from '../locking/booking-transaction.js';
import { SlotHoldService } from '../slots/slot-hold.service.js';
import {
  AppointmentTransitionService,
  type CheckInInput,
  type CheckInOutcome,
  type MarkNoShowInput,
  type MarkNoShowOutcome,
  type StatusConfig,
} from '../state/appointment-transition.service.js';
import { ReceptionStatusService } from '../status/reception-status.service.js';
import type { BookingFixtures } from './booking-fixtures.js';
import { cancelWorld, SLOT0_TIME } from './cancel-world.js';
import { createFakePorts } from './fake-ports.js';
import {
  insertFakePaymentRow,
  RecordingAppointmentNotifier,
} from './payment-doctor-fakes.js';

// Hạ tầng test dùng chung của `checkIn`, `markNoShow` và route Lễ tân (task B12; PLAN booking 7.32 `[đề xuất]`; TRACKING 3.26 B12-H): int-spec, int-spec đồng thời và e2e cùng dựng MỘT thế giới và MỘT bộ dịch vụ, để jscpd (vốn quét
// cả `*.int-spec.ts`) không thấy cùng một đoạn dựng ở nhiều ca. BỌC `cancelWorld` (chính nó bọc `expiryWorld` và `BookingFixtures.world`), không chép. Nằm trong `testing/` nên AR-01 và AR-06 bỏ qua (có `UPDATE benh_nhan`
// bằng SQL thẳng). Mọi giá trị là MINH HOẠ cho test: cửa sổ tiếp đón 30 phút trước và 15 phút sau giờ hẹn, ngưỡng no-show 3 (`BookingFixtures.systemConfig`).

const MINUTE_MS = 60_000;
/** Giờ hẹn của khung giờ số 0: 08:00 ngày 10/11/2026; mốc `now` TRONG cửa sổ tiếp đón của lịch ở khung giờ số 0 (đúng giờ hẹn) */
export const IN_WINDOW = SLOT0_TIME;
/** Hai đầu cửa sổ tiếp đón của lịch ở khung giờ số 0 (đóng hai đầu, Q22) */
export const WINDOW_START = new Date(SLOT0_TIME.getTime() - 30 * MINUTE_MS);
export const WINDOW_END = new Date(SLOT0_TIME.getTime() + 15 * MINUTE_MS);
/** Sau hết cửa sổ của MỌI khung giờ trong ngày (ô cuối 11:30 cộng 15 phút): Lễ tân đánh Vắng mặt được với lịch ở bất kỳ ô nào */
export const AFTER_ALL_WINDOWS = new Date('2026-11-10T12:00:00+07:00');

export const ALL_STATES: readonly TrangThaiLichHen[] = [
  'ChoThanhToan',
  'DaXacNhan',
  'DaTiepDon',
  'HoanThanh',
  'DaHuy',
  'VangMat',
  'DaDoiLich',
];

/**
 * Thế giới huỷ (`cancelWorld`: một chi nhánh, một bác sĩ, Lễ tân, hai Quản trị viên, Bệnh nhân kèm hồ sơ người thân, 8 khung giờ ngày 10/11/2026 từ 08:00) cộng chi nhánh THỨ HAI kèm Lễ tân riêng (để thử "lịch ngoài chi nhánh")
 * và Bệnh nhân thứ hai (để thử hai tài khoản khác nhau). Lịch dựng bằng `w.booked(trangThai, slot, tuỳ chọn)`.
 */
export async function statusWorld(db: DataSource, fx: BookingFixtures) {
  const w = await cancelWorld(db, fx);
  const otherBranch = await fx.admin.branch();
  const otherReceptionist = await fx.admin.receptionist(otherBranch);
  const second = await fx.admin.patient();
  return {
    ...w,
    otherBranch,
    otherReceptionist,
    receptionId: w.receptionist.account.taiKhoanId,
    otherReceptionId: otherReceptionist.account.taiKhoanId,
    secondPatientId: second.account.taiKhoanId,
  };
}

export type StatusWorld = Awaited<ReturnType<typeof statusWorld>>;

export interface NoShowState {
  soLan: number;
  khoa: boolean;
}

/** Đặt bộ đếm no-show và cờ khoá của một tài khoản (SQL thẳng: `benh_nhan` là dữ liệu dựng của test). */
export async function setNoShow(
  db: DataSource,
  taiKhoanId: string,
  state: NoShowState,
): Promise<void> {
  await db.query(
    'UPDATE benh_nhan SET so_lan_no_show = ?, khoa_dat_lich_do_no_show = ? WHERE tai_khoan_id = ?',
    [state.soLan, state.khoa ? 1 : 0, taiKhoanId],
  );
}

export async function readNoShow(
  db: DataSource,
  taiKhoanId: string,
): Promise<NoShowState> {
  const rows: { soLan: number | string; khoa: number | string }[] =
    await db.query(
      'SELECT so_lan_no_show AS soLan, khoa_dat_lich_do_no_show AS khoa FROM benh_nhan WHERE tai_khoan_id = ?',
      [taiKhoanId],
    );
  const row = rows[0];
  if (!row) throw new Error(`Không có benh_nhan ${taiKhoanId}`);
  return { soLan: Number(row.soLan), khoa: Number(row.khoa) === 1 };
}

/**
 * Bộ dịch vụ THẬT của B12 trên MySQL thật: `AppointmentTransitionService` và `AppointmentCancellationService` dùng thông báo GHI THẬT (`RecordingAppointmentNotifier`: dòng `thong_bao` thật, có khoá ngoại tới `lich_hen` và
 * `tai_khoan`, nên đường khoá ngoại của B12-F được chạy) và các cổng `Fake` còn lại (`ports`); `ReceptionStatusService` thật với `ReceptionScopeService` và `SystemConfigService` thật. "Một bản API" = một stack; hai stack
 * dùng chung MỘT `ports` thì đếm vào cùng bộ đếm hoàn tiền, mời chờ.
 */
export function createStatusStack(
  db: DataSource,
  ports: ReturnType<typeof createFakePorts> = createFakePorts(),
) {
  const notifier = new RecordingAppointmentNotifier();
  const transition = new AppointmentTransitionService(
    db,
    new SlotHoldService(),
    ports.waitlist,
    notifier,
  );
  const cancellation = new AppointmentCancellationService(
    db,
    transition,
    new BranchAccessPolicy(),
    ports.paymentSummary,
    ports.refund,
    ports.waitlist,
    notifier,
  );
  const configs = new SystemConfigService(new SystemConfigRepository(db));
  const reception = new ReceptionStatusService(
    db,
    new ReceptionScopeService(new ReceptionScopeRepository(db)),
    configs,
    transition,
    cancellation,
    ports.paymentSummary,
  );
  return { ports, notifier, transition, cancellation, configs, reception };
}

export type StatusStack = ReturnType<typeof createStatusStack>;

export interface CheckInOverrides {
  now?: Date;
  config?: StatusConfig | null;
  /** Chi nhánh của Lễ tân; mặc định chi nhánh của thế giới */
  chiNhanhId?: string;
  /** Số còn phải thu của `LeTan`; mặc định "0.00" */
  owed?: string;
}

/** Đầu vào `checkIn` của vai trò `role`; mặc định `now` là đúng giờ hẹn của khung giờ số 0 và cấu hình là dòng của thế giới. */
export function checkInInput(
  w: StatusWorld,
  lichHenId: string,
  role: 'LeTan' | 'ThanhToan',
  over: CheckInOverrides = {},
): CheckInInput {
  const base = {
    lichHenId,
    now: over.now ?? IN_WINDOW,
    config: over.config === undefined ? w.config : over.config,
  };
  if (role === 'ThanhToan') return { ...base, actor: 'ThanhToan' };
  return {
    ...base,
    actor: 'LeTan',
    chiNhanhId: over.chiNhanhId ?? w.branch.chiNhanhId,
    remainingToCollect: () => Promise.resolve(over.owed ?? '0.00'),
  };
}

export interface NoShowOverrides {
  now?: Date;
  config?: StatusConfig | null;
  chiNhanhId?: string;
  /** Phạm vi của Quản trị viên; mặc định Toàn hệ thống */
  scope?: AdminScope;
  /** `isDue` của job; mặc định `true` */
  isDue?: boolean;
}

/** Đầu vào `markNoShow` của vai trò `role`; mặc định `now` là sau hết cửa sổ của mọi khung giờ trong ngày. */
export function noShowInput(
  w: StatusWorld,
  lichHenId: string,
  role: 'LeTan' | 'QuanTriVien' | 'HeThong',
  over: NoShowOverrides = {},
): MarkNoShowInput {
  const base = {
    lichHenId,
    now: over.now ?? AFTER_ALL_WINDOWS,
    config: over.config === undefined ? w.config : over.config,
  };
  switch (role) {
    case 'LeTan':
      return {
        ...base,
        actor: 'LeTan',
        chiNhanhId: over.chiNhanhId ?? w.branch.chiNhanhId,
      };
    case 'QuanTriVien': {
      const scope: AdminScope = over.scope ?? { kind: 'ToanHeThong' };
      const policy = new BranchAccessPolicy();
      return {
        ...base,
        actor: 'QuanTriVien',
        canAct: (target) => policy.canAccessBranch(scope, target.chiNhanhId),
      };
    }
    case 'HeThong':
      return {
        ...base,
        actor: 'HeThong',
        isDue: () => Promise.resolve(over.isDue ?? true),
      };
  }
}

/** `checkIn` trong MỘT `withBookingTransaction` THẬT (READ COMMITTED, thử lại 1213 và 1205 bằng cách chạy lại thân), như route Lễ tân hay `payment` sẽ làm. */
export const runCheckIn = (
  db: DataSource,
  transition: AppointmentTransitionService,
  input: CheckInInput,
): Promise<CheckInOutcome> =>
  withBookingTransaction(db, (em) => transition.checkIn(em, input), {
    label: 'test-check-in',
  });

/** `markNoShow` trong MỘT `withBookingTransaction` THẬT, như route Lễ tân, job B13 hay Quản trị viên B14 sẽ làm. */
export const runNoShow = (
  db: DataSource,
  transition: AppointmentTransitionService,
  input: MarkNoShowInput,
): Promise<MarkNoShowOutcome> =>
  withBookingTransaction(db, (em) => transition.markNoShow(em, input), {
    label: 'test-no-show',
  });

export interface FakeCashCheckInInput {
  lichHenId: string;
  /** Tài khoản đặt (khoá ngoại của dòng ghi) */
  taiKhoanId: string;
  now: Date;
  config: StatusConfig | null;
  /**
   * `checkInFirst` (mặc định) = ĐÚNG điều kiện của `payment`: gọi `checkIn` TRƯỚC mọi ghi vào bảng có khoá ngoại tới `lich_hen`, rồi mới ghi dòng "thu tiền". `lockFirst` = đúng điều kiện thứ hai: chính `payment` đã
   * `SELECT … FOR UPDATE` hàng `lich_hen` theo khoá chính (quy tắc 46 bước 2), ghi dòng "thu tiền", rồi `checkIn`. `writeFirst` = ĐẢO thứ tự: ghi dòng có khoá ngoại TRƯỚC (khoá chia sẻ trên hàng cha `lich_hen`), rồi `checkIn`
   * xin khoá X trên chính hàng đó (nâng khoá), vi phạm điều kiện: chu trình thật là giữa HAI lần thu tiền cùng một lịch (cả hai giữ S rồi cùng nâng lên X, B12-S), KHÔNG phải với `cancel` (nâng S lên X được cấp vượt hàng đợi).
   */
  order?: 'checkInFirst' | 'lockFirst' | 'writeFirst';
  /** Loại sự kiện của dòng "thu tiền" (mặc định `FakeThanhToan`): HAI lần thu tiền cùng một lịch phải khác loại vì UNIQUE (lịch, tài khoản, loại) */
  loaiSuKien?: string;
  /** Gọi ngay SAU lần ghi đầu của `lockFirst` hay `writeFirst`, TRƯỚC `checkIn` (chạy lại mỗi lần thử lại: hook tự chống lặp) */
  afterFirstWrite?: () => Promise<void>;
}

/**
 * `payment` giả khi thu tiền mặt tại quầy (B17, quy tắc 46): MỘT `withBookingTransaction` THẬT gọi `checkIn` thật với `actor: 'ThanhToan'`; chỉ ghi dòng "thu tiền" (một dòng `thong_bao` loại `FakeThanhToan`, có khoá
 * ngoại tới `lich_hen` như `giao_dich_thanh_toan` sẽ có) khi kết quả là `CheckedIn` (với `checkInFirst`); `lockFirst` và `writeFirst` ghi trước nên có dòng cả khi kết quả không phải `CheckedIn`.
 */
export function fakeCashCheckIn(
  db: DataSource,
  transition: AppointmentTransitionService,
  input: FakeCashCheckInInput,
): Promise<CheckInOutcome> {
  const order = input.order ?? 'checkInFirst';
  return withBookingTransaction(
    db,
    async (em) => {
      if (order === 'lockFirst')
        await em.query(
          'SELECT lich_hen_id FROM lich_hen WHERE lich_hen_id = ? FOR UPDATE',
          [input.lichHenId],
        );
      if (order !== 'checkInFirst') {
        await insertFakePaymentRow(em, input);
        await input.afterFirstWrite?.();
      }
      const outcome = await transition.checkIn(em, {
        lichHenId: input.lichHenId,
        now: input.now,
        config: input.config,
        actor: 'ThanhToan',
      });
      if (order === 'checkInFirst' && outcome.kind === 'CheckedIn')
        await insertFakePaymentRow(em, input);
      return outcome;
    },
    { label: 'fake-cash-check-in' },
  );
}
