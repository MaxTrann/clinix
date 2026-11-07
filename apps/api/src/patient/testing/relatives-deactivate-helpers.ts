import { randomUUID } from 'node:crypto';
import type { DataSource, EntityManager } from 'typeorm';
import { expect, vi } from 'vitest';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import type { BacSi } from '../../admin/entities/bac-si.entity.js';
import type { KhungGio } from '../../admin/entities/khung-gio.entity.js';
import type { LichHen } from '../../admin/entities/lich-hen.entity.js';
import { AdminFixtures } from '../../admin/testing/admin-fixtures.js';
import { findActiveAppointments } from '../../appointments/active-appointment.query.js';
import { lockVisitProfile } from '../../appointments/visit-profile.query.js';
import {
  deferred,
  sleep,
} from '../../auth/testing/verification-int-helpers.js';
import type { AppException } from '../../common/errors/app.exception.js';
import type { RelativesRepository } from '../relatives/relatives.repository.js';
import type { StoredRelative } from './relatives-helpers.js';

// Hàm trợ giúp DÙNG CHUNG của test ngừng sử dụng hồ sơ người thân (task B5; TRACKING patient B5-H). Gom một chỗ để các file int, tương tranh và e2e mới
// (relatives.service.deactivate.int-spec.ts, ...concurrency.int-spec.ts, test/patient-relatives-deactivate.e2e-spec.ts) không chép nhau: CI chỉ bỏ
// `**/*.spec.ts` khỏi jscpd nên `*.int-spec.ts` và `*.e2e-spec.ts` vẫn bị quét. Dữ liệu cá nhân trong test là giả.

/** `chiTiet` của một AppException (thân 409 của ngừng sử dụng). */
export const detailsOf = (error: unknown): unknown =>
  ((error as AppException).getResponse() as { chiTiet?: unknown }).chiTiet;

/**
 * Dựng MỘT lịch hẹn thật ở trạng thái `trangThai` cho hồ sơ người thân `relativeId` (`null` = hồ sơ BẢN THÂN) của Bệnh nhân `ownerId`, với GIỜ, TÊN BÁC SĨ và TÊN CHI NHÁNH biết trước
 * (để đối chiếu `chiTiet` của 409). Mỗi lần gọi dựng riêng chi nhánh, bác sĩ, ca, khung giờ nên hai lịch không tranh nhau cột sinh UNIQUE `khung_gio_dang_giu`.
 */
export async function appointmentAt(
  fx: AdminFixtures,
  ownerId: string,
  relativeId: string | null,
  trangThai: TrangThaiLichHen,
  options: { thoiGian: string; doctorName?: string; branchName?: string },
): Promise<{ appointment: LichHen; doctorName: string; branchName: string }> {
  // Tên chi nhánh là UNIQUE nên mặc định có mã ngẫu nhiên
  const branchName = options.branchName ?? `Chi nhánh giả ${randomUUID()}`;
  const doctorName =
    options.doctorName ?? `Bác Sĩ Giả ${randomUUID().slice(0, 8)}`;
  const branch = await fx.branch({ ten: branchName });
  const doctor = await fx.doctor(branch, {}, { hoTen: doctorName });
  const slot = await fx.slot(await fx.shift(doctor.profile), {
    ngayGio: new Date(options.thoiGian),
  });
  const appointment = await fx.appointment(doctor.profile, slot, ownerId, {
    hoSoNguoiThanId: relativeId,
    trangThai,
  });
  return { appointment, doctorName, branchName };
}

/** Mọi thứ một `booking` giả lập cần để đặt lịch cho một hồ sơ người thân: bác sĩ và khung giờ riêng (một khung giờ chỉ giữ được một lịch còn hiệu lực). */
export interface BookingTarget {
  owner: string;
  relativeId: string;
  doctor: BacSi;
  slot: KhungGio;
}

export async function bookingTarget(
  fx: AdminFixtures,
  owner: string,
  relativeId: string,
): Promise<BookingTarget> {
  const doctor = await fx.doctor(await fx.branch());
  const slot = await fx.slot(await fx.shift(doctor.profile));
  return { owner, relativeId, doctor: doctor.profile, slot };
}

/** Chèn một lịch hẹn của `booking` giả lập vào giao dịch `em` (mặc định `ChoThanhToan`, một trạng thái chặn). */
export function insertActiveAppointment(
  em: EntityManager,
  target: BookingTarget,
  trangThai: TrangThaiLichHen = 'ChoThanhToan',
): Promise<LichHen> {
  return new AdminFixtures(em).appointment(
    target.doctor,
    target.slot,
    target.owner,
    { hoSoNguoiThanId: target.relativeId, trangThai },
  );
}

export const LOCK_PATIENT_SQL =
  'SELECT tai_khoan_id FROM benh_nhan WHERE tai_khoan_id = ? FOR UPDATE';
const PLAIN_PROFILE_STATE_SQL = `SELECT trang_thai_hieu_luc AS trangThaiHieuLuc FROM ho_so_nguoi_than
WHERE ho_so_nguoi_than_id = ? AND benh_nhan_id = ?`;

/**
 * Hai cách một `booking` giả lập kiểm "hồ sơ còn hiệu lực" sau khi đã khoá `benh_nhan` (PLAN patient 5.3: "kiểm `trang_thai_hieu_luc` dưới khoá"):
 *  - `plain-read`: đọc THƯỜNG (SELECT không khoá). Đây là nghĩa TỐI THIỂU của hợp đồng; không tự xếp hàng ở hàng hồ sơ, nên việc ngừng sử dụng PHẢI khoá `benh_nhan` mới an toàn.
 *  - `locked-read`: `lockVisitProfile` (`FOR UPDATE` hàng hồ sơ), mạnh hơn hợp đồng.
 */
export type BookingVariant = 'plain-read' | 'locked-read';
export const BOOKING_VARIANTS: readonly BookingVariant[] = [
  'plain-read',
  'locked-read',
];

/**
 * `booking` giả lập: khoá `benh_nhan` ⇒ kiểm hiệu lực ⇒ đếm lịch hẹn đang hoạt động (quy tắc 37, cũng là khoảng trống giữa kiểm và chèn) ⇒ chèn `ChoThanhToan`.
 * Hồ sơ đã ngừng thì từ chối (`'refused'`, không chèn gì).
 */
export function fakeBooking(
  db: DataSource,
  variant: BookingVariant,
  target: BookingTarget,
): Promise<'booked' | 'refused'> {
  return db.transaction('READ COMMITTED', async (em) => {
    await em.query(LOCK_PATIENT_SQL, [target.owner]);
    const usable =
      variant === 'locked-read'
        ? (await lockVisitProfile(em, target.owner, target.relativeId)) ===
          'active'
        : await isActivePlain(em, target);
    if (!usable) return 'refused';
    await findActiveAppointments(em, target.owner, target.relativeId);
    await insertActiveAppointment(em, target);
    return 'booked';
  });
}

async function isActivePlain(
  em: EntityManager,
  target: BookingTarget,
): Promise<boolean> {
  const rows = await em.query<{ trangThaiHieuLuc: number }[]>(
    PLAIN_PROFILE_STATE_SQL,
    [target.relativeId, target.owner],
  );
  return Number(rows[0]?.trangThaiHieuLuc) === 1;
}

/**
 * Chờ tới khi có ÍT NHẤT một giao dịch đang CHỜ khoá trên bảng `tableName` (nối `data_lock_waits` với `data_locks.OBJECT_NAME`, không `sleep` cố định).
 * Chính xác hơn `waitForLockWaiter` của B4 (đợi bất kỳ khoá nào): NT-24 cần đúng "ngừng đang đứng đợi khoá `benh_nhan`".
 */
export async function waitForLockWaiterOn(
  db: DataSource,
  tableName: string,
  timeoutMs = 3000,
): Promise<void> {
  // performance.now(): useIntegrationHooks giả đồng hồ Date, nên Date.now() đứng yên và hạn chờ sẽ KHÔNG BAO GIỜ hết khi ca đỏ (ca treo tới hết giờ test)
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    const rows = await db.query<{ n: string }[]>(
      `SELECT CAST(COUNT(*) AS CHAR) AS n
       FROM performance_schema.data_lock_waits w
       JOIN performance_schema.data_locks l ON l.ENGINE_LOCK_ID = w.REQUESTING_ENGINE_LOCK_ID
       WHERE l.OBJECT_SCHEMA = DATABASE() AND l.OBJECT_NAME = ?`,
      [tableName],
    );
    if (Number(rows[0]?.n ?? 0) > 0) return;
    await sleep(20);
  }
  throw new Error(`Không thấy giao dịch nào chờ khoá trên bảng ${tableName}`);
}

/**
 * Khoá của giao dịch ngừng sử dụng đã NHẢ (sau commit hay hoàn tác): từ một kết nối khác, khoá `benh_nhan` và hàng hồ sơ bằng `FOR UPDATE NOWAIT` đều
 * thành công ngay (MySQL 8 báo lỗi 3572 tức thì nếu còn bị khoá), và `performance_schema.data_locks` không còn hàng khoá nào của hai bảng đó.
 */
export async function expectLocksReleased(
  db: DataSource,
  owner: string,
  relativeId: string,
): Promise<void> {
  const runner = db.createQueryRunner();
  await runner.connect();
  try {
    await runner.startTransaction();
    await runner.query(`${LOCK_PATIENT_SQL} NOWAIT`, [owner]);
    await runner.query(
      'SELECT ho_so_nguoi_than_id FROM ho_so_nguoi_than WHERE ho_so_nguoi_than_id = ? AND benh_nhan_id = ? FOR UPDATE NOWAIT',
      [relativeId, owner],
    );
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
  }
  const rows = await db.query<{ n: string }[]>(
    `SELECT CAST(COUNT(*) AS CHAR) AS n FROM performance_schema.data_locks
     WHERE OBJECT_SCHEMA = DATABASE() AND OBJECT_NAME IN ('benh_nhan', 'ho_so_nguoi_than')`,
  );
  expect(Number(rows[0]?.n)).toBe(0);
}

/**
 * Làm lần gọi `deactivateRelative` KẾ TIẾP (câu UPDATE cuối của ngừng sử dụng, khi giao dịch đã giữ cả khoá `benh_nhan` lẫn khoá hàng hồ sơ) DỪNG lại tới khi gọi
 * `resume()`. `entered` xong khi lời gọi đó đã tới. LUÔN gọi `resume()` trong `finally` để không bao giờ để giao dịch mở treo DB dùng chung.
 */
export function pauseNextDeactivate(repository: RelativesRepository): {
  entered: Promise<void>;
  resume: () => void;
} {
  const entered = deferred();
  const gate = deferred();
  const original = repository.deactivateRelative.bind(repository);
  vi.spyOn(repository, 'deactivateRelative').mockImplementationOnce(
    async (em, owner, id) => {
      entered.resolve();
      await gate.promise;
      return original(em, owner, id);
    },
  );
  return { entered: entered.promise, resume: gate.resolve };
}

/** Trạng thái cuối của một hồ sơ: còn hiệu lực không, và còn bao nhiêu lịch hẹn `ChoThanhToan` của nó. Bất biến H1: không bao giờ vừa ngừng vừa còn lịch chặn. */
export async function relativeOutcome(
  db: DataSource,
  relativeId: string,
): Promise<{ active: boolean; blocking: number }> {
  const rows = await db.query<{ hl: number; n: string }[]>(
    `SELECT h.trang_thai_hieu_luc AS hl,
       CAST((SELECT COUNT(*) FROM lich_hen l WHERE l.ho_so_nguoi_than_id = h.ho_so_nguoi_than_id AND l.trang_thai = 'ChoThanhToan') AS CHAR) AS n
     FROM ho_so_nguoi_than h WHERE h.ho_so_nguoi_than_id = ?`,
    [relativeId],
  );
  return { active: Number(rows[0]?.hl) === 1, blocking: Number(rows[0]?.n) };
}

/** Mọi hàng hồ sơ KHÁC hàng có id `id` giống hệt trước và sau (cùng thứ tự, từng cột): việc chỉ được đổi đúng một hàng. */
export function expectOtherRowsUnchanged(
  before: StoredRelative[],
  after: StoredRelative[],
  id: string,
): void {
  const others = (rows: StoredRelative[]) =>
    rows.filter((row) => row.ho_so_nguoi_than_id !== id);
  expect(others(after)).toStrictEqual(others(before));
}
