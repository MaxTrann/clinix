import type { DataSource } from 'typeorm';
import { expect, vi } from 'vitest';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import type { LichHen } from '../../admin/entities/lich-hen.entity.js';
import { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';
import { AppointmentCancellationService } from '../cancel/appointment-cancellation.service.js';
import { CancelPreviewService } from '../cancel/cancel-preview.service.js';
import type { CancelInput } from '../cancel/cancel.types.js';
import { withBookingTransaction } from '../locking/booking-transaction.js';
import { SlotHoldService } from '../slots/slot-hold.service.js';
import { lockSlot } from '../slots/slot-lock.js';
import { AppointmentTransitionService } from '../state/appointment-transition.service.js';
import type { BookingFixtures } from './booking-fixtures.js';
import { expiryWorld, readAppointment } from './expiry-fixtures.js';
import { createFakePorts } from './fake-ports.js';

// Hạ tầng test dùng chung của huỷ lịch hẹn (task B10; PLAN booking 7.3, 7.10, 7.29; TRACKING 3.23 B10-I): int-spec, int-spec đồng thời và e2e cùng dùng, để jscpd không thấy dựng dữ liệu hai lần.
// BỌC `expiryWorld` (chính nó bọc `BookingFixtures.world`), không chép. Nằm trong `testing/` nên AR-01 và AR-06 bỏ qua (có `UPDATE lich_hen` bằng SQL thẳng). Mọi số tiền, mốc hoàn là MINH HOẠ cho test.

export const HOUR_MS = 3_600_000;
/** Giờ của khung giờ số 0 trong `BookingFixtures.world()`: 08:00 ngày 10/11/2026 (giờ Việt Nam). Khung giờ số `i` bắt đầu sau đó `30 × i` phút. */
export const SLOT0_TIME = new Date('2026-11-10T08:00:00+07:00');
/** Đồng hồ ứng dụng giả của `useIntegrationHooks` (T0) viết theo giờ DB: `thoi_diem_huy` của mọi lần huỷ không đổi giờ ở các ca dùng đồng hồ mặc định. */
export const T0_TEXT = '2026-11-02 08:00:00';
/** Tiền cọc đã thu minh hoạ. */
export const DEPOSIT = '100000.00';
/** Chính sách minh hoạ của HL-07: đúng 24 giờ trở lên 100%, 2 giờ trở lên 50%, còn lại 0%. */
export const REFUND_POLICY = [
  { so_gio_truoc_toi_thieu: 24, ty_le_hoan: 100 },
  { so_gio_truoc_toi_thieu: 2, ty_le_hoan: 50 },
  { so_gio_truoc_toi_thieu: 0, ty_le_hoan: 0 },
];

/** Đặt đồng hồ ứng dụng giả sao cho còn `remainingMs` mili giây tới giờ của khung giờ số 0 (âm = đã quá giờ). Cần `vi.useFakeTimers` đang bật (`useIntegrationHooks` và e2e đều bật). */
export function atRemaining(remainingMs: number): Date {
  const at = new Date(SLOT0_TIME.getTime() - remainingMs);
  vi.setSystemTime(at);
  return at;
}

/**
 * Ghi `chinh_sach_hoan_snapshot` bằng `JSON.stringify` (đã đo M7: mảng truyền thẳng vào `em.query` bị lỗi 1136 hay 3140); `null` ghi SQL NULL. Cố ý ghi bằng SQL thay vì fixture `appointmentIn`:
 * kiểu `Record<string, unknown>` của entity không nhận mảng, và ca cần cả giá trị HỎNG (chuỗi, đối tượng) để thử `RefundCalculator`.
 */
export async function setRefundPolicy(
  db: DataSource,
  lichHenId: string,
  snapshot: unknown,
): Promise<void> {
  await db.query(
    'UPDATE lich_hen SET chinh_sach_hoan_snapshot = ? WHERE lich_hen_id = ?',
    [snapshot === null ? null : JSON.stringify(snapshot), lichHenId],
  );
}

/**
 * "Một bản API" của huỷ: dịch vụ huỷ THẬT và `AppointmentTransitionService` thật (cùng `SlotHoldService`), cổng là bản `Fake` (truyền bộ cổng chung để hai bản API, hay huỷ và hết hạn, đếm vào CÙNG một bộ đếm
 * hoàn tiền, mời chờ và thông báo). Dựng bằng tay (không qua Nest) để test chủ động bọc `DataSource`.
 */
export function createCancelStack(
  db: DataSource,
  ports: ReturnType<typeof createFakePorts> = createFakePorts(),
) {
  const transition = new AppointmentTransitionService(
    db,
    new SlotHoldService(),
    ports.waitlist,
  );
  const service = new AppointmentCancellationService(
    db,
    transition,
    new BranchAccessPolicy(),
    ports.paymentSummary,
    ports.refund,
    ports.waitlist,
    ports.notifier,
  );
  return {
    ports,
    transition,
    service,
    preview: new CancelPreviewService(db, ports.paymentSummary),
  };
}

export interface BookedOptions {
  /** Tiền cọc của snapshot (`tien_coc_snapshot`); mặc định 0 */
  coc?: string;
  /** `chinh_sach_hoan_snapshot`: mảng mốc, `null`, hay giá trị hỏng; mặc định không đặt (NULL) */
  policy?: unknown;
  patientId?: string;
  hoSoNguoiThanId?: string | null;
  maLichHen?: string;
}

/**
 * Thế giới huỷ: `expiryWorld` (một chi nhánh, một bác sĩ, Lễ tân, hai Quản trị viên, Bệnh nhân kèm hồ sơ người thân, 8 khung giờ ngày 10/11/2026 từ 08:00) cộng hàm dựng lịch có cọc và mốc hoàn
 * theo CHỈ SỐ khung giờ, và ảnh chụp trạng thái để so trước và sau. Cọc đã THU do `FakePaymentSummaryPort.paid` quyết (cổng giả), không do `tien_coc_snapshot`.
 */
export async function cancelWorld(db: DataSource, fx: BookingFixtures) {
  const w = await expiryWorld(fx);
  return {
    ...w,
    /** Lịch ở `trangThai` kèm khung giờ nhất quán (`BookingFixtures.appointmentIn`) ở khung giờ số `slot` */
    booked: async (
      trangThai: TrangThaiLichHen,
      slot: number,
      options: BookedOptions = {},
    ): Promise<LichHen> => {
      const lich = await fx.appointmentIn(trangThai, {
        doctor: w.doctor.profile,
        khungGioId: w.slotId(slot),
        patientId: options.patientId ?? w.patientId,
        hoSoNguoiThanId: options.hoSoNguoiThanId ?? null,
        ...(options.coc === undefined ? {} : { tienCocSnapshot: options.coc }),
        ...(options.maLichHen === undefined
          ? {}
          : { maLichHen: options.maLichHen }),
      });
      if (options.policy !== undefined)
        await setRefundPolicy(db, lich.lichHenId, options.policy);
      return lich;
    },
    /** Hàng `lich_hen` và khung giờ số `slot` của một lịch, để khẳng định "không đổi gì" (từ chối, hoàn tác) hay "đã đổi đúng" */
    snapshot: async (lich: LichHen, slot: number) => ({
      row: await readAppointment(db, lich.lichHenId),
      slot: await fx.slotState(w.slotId(slot)),
    }),
  };
}

export type CancelWorld = Awaited<ReturnType<typeof cancelWorld>>;

export type FakePorts = ReturnType<typeof createFakePorts>;

export interface PaidCaseOptions {
  /** Trạng thái của lịch; mặc định `DaXacNhan` */
  state?: TrangThaiLichHen;
  /** Chỉ số khung giờ; mặc định 0 */
  slot?: number;
  /** `chinh_sach_hoan_snapshot` của lịch; mặc định `REFUND_POLICY` */
  policy?: unknown;
}

/**
 * Nơi dựng CHUNG của mọi ca "đã thu cọc": một lịch có cọc `DEPOSIT` ĐÃ THU (cổng giả `paid`), chính sách hoàn `REFUND_POLICY` (hay `options.policy`) và bộ huỷ dùng cổng giả RIÊNG của ca.
 * Gom về đây (TRACKING 3.23 B10-Q) để jscpd không thấy cùng một đoạn dựng dữ liệu ở nhiều ca của ba int-spec huỷ.
 */
export async function paidCancelCase(
  db: DataSource,
  w: CancelWorld,
  options: PaidCaseOptions = {},
) {
  const lich = await w.booked(options.state ?? 'DaXacNhan', options.slot ?? 0, {
    coc: DEPOSIT,
    policy: options.policy ?? REFUND_POLICY,
  });
  const stack = createCancelStack(db);
  stack.ports.paymentSummary.paid({ [lich.lichHenId]: DEPOSIT });
  return { lich, ...stack };
}

/** Hoàn 50% của `DEPOSIT` (mốc 2 giờ của `REFUND_POLICY`). */
export const HALF_REFUND = { tyLe: 50, soTien: '50000.00' };

/** Kết quả `Cancelled` mong đợi của dịch vụ huỷ (đủ ba khoá; dùng với `toStrictEqual`). */
export function cancelledOutcome(
  maLichHen: string,
  hoanCoc: { tyLe: number; soTien: string } | null,
) {
  return { kind: 'Cancelled' as const, maLichHen, hoanCoc };
}

export type GateName = 'refund' | 'waitlist' | 'notifier';

/**
 * Lần huỷ không ghi gì (từ chối có kiểu, hoàn tác) thì các cổng sau commit và thông báo KHÔNG được gọi. Mặc định kiểm cả ba cổng; truyền `gates` khi ca chỉ kiểm một phần (ví dụ ca không dựng
 * cọc đã thu thì chỉ kiểm `waitlist` và `notifier`), để không đổi kỳ vọng của ca.
 */
export function expectNoGateCalls(
  ports: FakePorts,
  gates: readonly GateName[] = ['refund', 'waitlist', 'notifier'],
): void {
  const counts: Record<GateName, number> = {
    refund: ports.refund.refundCall.count,
    waitlist: ports.waitlist.onSlotReleasedCall.count,
    notifier: ports.notifier.notifyCall.count,
  };
  for (const gate of gates) expect(counts[gate], gate).toBe(0);
}

export type CancelRole = 'BenhNhan' | 'LeTan' | 'QuanTriVien' | 'HeThong';

/** Đầu vào `cancel` của từng vai trò (cặp actor và reason đúng hợp đồng); `lyDo` chỉ có ở Lễ tân và Quản trị viên (bắt buộc) */
export function cancelInput(
  w: CancelWorld,
  role: CancelRole,
  maLichHen: string,
  lyDo = 'Lý do thử nghiệm',
): CancelInput {
  switch (role) {
    case 'BenhNhan':
      return {
        maLichHen,
        actor: { kind: 'BenhNhan', accountId: w.patientId },
        reason: 'BenhNhanHuy',
      };
    case 'LeTan':
      return {
        maLichHen,
        actor: {
          kind: 'LeTan',
          accountId: w.receptionist.account.taiKhoanId,
          chiNhanhId: w.branch.chiNhanhId,
        },
        reason: 'LeTanHuy',
        lyDo,
      };
    case 'QuanTriVien':
      return {
        maLichHen,
        actor: {
          kind: 'QuanTriVien',
          accountId: w.systemAdmin.account.taiKhoanId,
          scope: { kind: 'ToanHeThong' },
        },
        reason: 'QtvOverride',
        lyDo,
      };
    case 'HeThong':
      return {
        maLichHen,
        actor: { kind: 'HeThong' },
        reason: 'BacSiNghiPhep',
      };
  }
}

/**
 * Giao dịch GIẢ của tiếp đón (B12, `DaXacNhan` → `DaTiepDon`) hay của job Vắng mặt (B13, `DaXacNhan` → `VangMat`), cho DT-05 và DT-06: đi ĐÚNG chuỗi khoá của PLAN 5.3 (`khung_gio FOR UPDATE`, rồi
 * `lich_hen FOR UPDATE` theo khoá chính), kiểm lại trạng thái nguồn dưới khoá rồi đổi; khung giờ GIỮ `DaDat` (cả hai trạng thái đích vẫn giữ khung giờ, 5.2). `Stale` khi lịch không còn ở `from`.
 * Việc thật ở B12, B13 viết `checkIn`, `markNoShow` vào `AppointmentTransitionService`; khi đó các ca này chạy lại với hàm thật (DT-05, DT-06 chuyển từ "một phần" thành Pass).
 */
export function changeStatusLikeStaff(
  db: DataSource,
  input: {
    lichHenId: string;
    khungGioId: string;
    from: TrangThaiLichHen;
    to: TrangThaiLichHen;
  },
): Promise<'Changed' | 'Stale'> {
  return withBookingTransaction(
    db,
    async (em) => {
      await lockSlot(em, input.khungGioId);
      const rows = await em.query<{ trangThai: string }[]>(
        'SELECT trang_thai AS trangThai FROM lich_hen WHERE lich_hen_id = ? FOR UPDATE',
        [input.lichHenId],
      );
      if (rows[0]?.trangThai !== input.from) return 'Stale';
      await em.query(
        'UPDATE lich_hen SET trang_thai = ? WHERE lich_hen_id = ?',
        [input.to, input.lichHenId],
      );
      return 'Changed';
    },
    { label: 'fake-staff-status-change' },
  );
}
