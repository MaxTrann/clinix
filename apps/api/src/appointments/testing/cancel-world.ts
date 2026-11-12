import type { DataSource, QueryRunner } from 'typeorm';
import { vi } from 'vitest';
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

/** Một câu SQL đã gửi lên MySQL: nội dung và tham số. */
export interface SentStatement {
  sql: string;
  params: unknown[] | undefined;
}

// Chen vào MỌI câu của MỌI `QueryRunner` do `db` tạo (kể cả của `db.transaction` và `db.query`): mỗi câu đi qua `handler(call, run)`, `run()` chạy câu thật. Dùng `vi.spyOn`, nên `vi.restoreAllMocks()` (có sẵn trong
// `useIntegrationHooks`) tự gỡ sau mỗi test. Hai hàm bên dưới cùng thay `createQueryRunner`: MỘT test chỉ dùng một trong hai (và không dùng chung với `recordStatements`).
function interceptRunners(
  db: DataSource,
  handler: (
    call: SentStatement,
    run: () => Promise<unknown>,
  ) => Promise<unknown>,
): void {
  const create = db.createQueryRunner.bind(db);
  vi.spyOn(db, 'createQueryRunner').mockImplementation((...args) => {
    const runner: QueryRunner = create(...args);
    const run = runner.query.bind(runner) as (
      sql: string,
      params?: unknown[],
      structured?: boolean,
    ) => Promise<unknown>;
    runner.query = ((sql: string, params?: unknown[], structured?: boolean) =>
      handler({ sql, params }, () =>
        run(sql, params, structured),
      )) as unknown as QueryRunner['query'];
    return runner;
  });
}

/**
 * Cho câu khớp `pattern` chạy THẬT rồi mới ném `error` (tối đa `times` lần đầu): giao dịch đã làm việc rồi mới hỏng (HL-16 "hoàn tác trọn", CNL-08 "thân chạy lại với 1213"). Trả MẢNG các lần khớp (kể cả lần không
 * ném) để test đối chiếu giữa các lần chạy lại. TẠM THỜI (quyết định (k) của Đại, 12/11/2026): cùng ý với `failAfterStatement` của B8 (B8 chưa vào `main`, chưa có PR); khi B8 merge thì thay bằng hàm đó
 * và xoá hàm này (TECH_DEBT dòng 106).
 */
export function throwAfterStatement(
  db: DataSource,
  pattern: RegExp,
  error: unknown,
  times = 1,
): SentStatement[] {
  const matched: SentStatement[] = [];
  let thrown = 0;
  interceptRunners(db, async (call, run) => {
    const result = await run();
    if (pattern.test(call.sql)) {
      matched.push(call);
      if (thrown < times) {
        thrown += 1;
        throw error;
      }
    }
    return result;
  });
  return matched;
}

/**
 * Chạy `effect` (thường bằng một kết nối KHÁC của pool, tự commit) đúng MỘT lần, NGAY SAU câu đầu tiên khớp `pattern` đã chạy xong, rồi trả kết quả của câu đó: mô phỏng một giao dịch khác xong trong khe hở giữa hai
 * câu của lần huỷ (CNL-05 "kiểm lại dưới khoá"). Cờ `done` đặt TRƯỚC khi chạy `effect` để câu của chính `effect` (cũng đi qua bộ chen này) không kích hoạt lại. Tạm thời như `throwAfterStatement` (cùng ý với
 * `interceptStatements` của B8; TECH_DEBT dòng 106).
 */
export function runAfterStatement(
  db: DataSource,
  pattern: RegExp,
  effect: () => Promise<unknown>,
): void {
  let done = false;
  interceptRunners(db, async (call, run) => {
    const result = await run();
    if (!done && pattern.test(call.sql)) {
      done = true;
      await effect();
    }
    return result;
  });
}
