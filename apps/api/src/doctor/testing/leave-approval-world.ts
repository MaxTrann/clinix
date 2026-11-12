import type { DataSource } from 'typeorm';
import { AppException } from '../../common/errors/app.exception.js';
import { AppointmentQueries } from '../../appointments/queries/appointment-queries.js';
import type { BookingFixtures } from '../../appointments/testing/booking-fixtures.js';
import {
  cancelWorld,
  createCancelStack,
} from '../../appointments/testing/cancel-world.js';
import { AuditRepository } from '../../audit/audit.repository.js';
import { AuditService } from '../../audit/audit.service.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';
import { AdminLeaveApproveService } from '../leave-approval/admin-leave-approve.service.js';
import { AdminLeaveRejectService } from '../leave-approval/admin-leave-reject.service.js';
import { AdminLeaveRetryService } from '../leave-approval/admin-leave-retry.service.js';
import { AdminLeaveRepository } from '../leave-approval/admin-leave.repository.js';
import type { AppointmentCancellationPort } from '../leave-approval/appointment-cancellation.port.js';
import { BookingCancellationAdapter } from '../leave-approval/booking-cancellation.adapter.js';
import { LeaveCancellationRunner } from '../leave-approval/leave-cancellation.runner.js';
import { LeaveCancellationSweeper } from '../leave-approval/leave-cancellation.sweeper.job.js';
import { LeaveNotifier } from '../notifications/leave-notifier.js';

// Hạ tầng test dùng chung của Duyệt (B15) và chạy lại (B16) trên MySQL thật: dựng dịch vụ bằng tay (không qua Nest), thế giới huỷ của booking cộng yêu cầu nghỉ,
// và vài hàm đọc. Để jscpd không thấy dựng dữ liệu hai lần giữa các int-spec. Nằm trong `testing/`.

/** Ngày có ca sáng và khung giờ của `cancelWorld` (khung giờ số 0 bắt đầu 08:00). */
export const LEAVE_DAY = '2026-11-10';
export const SYSTEM: AdminScope = { kind: 'ToanHeThong' };

/**
 * Dịch vụ Duyệt, Từ chối, Chạy lại và sweeper dùng CÙNG một cổng. Mặc định cổng là bản thật nối `booking` (`cancel` B10 + `findAffectedByLeave` B11; cổng hoàn tiền, mời chờ,
 * thông báo của booking là bản giả của booking); truyền `port` để thay bằng bản giả/bọc đếm. `ports` là bộ cổng giả của booking để đếm hoàn tiền, mời chờ.
 */
export function createLeaveServices(
  db: DataSource,
  port?: AppointmentCancellationPort,
) {
  const stack = createCancelStack(db);
  const realPort = new BookingCancellationAdapter(
    db,
    new AppointmentQueries(),
    stack.service,
  );
  const usedPort = port ?? realPort;
  const repository = new AdminLeaveRepository(db);
  const policy = new BranchAccessPolicy();
  const audit = new AuditService(new AuditRepository());
  const notifier = new LeaveNotifier();
  const runner = new LeaveCancellationRunner(usedPort);
  return {
    ports: stack.ports,
    realPort,
    runner,
    approval: new AdminLeaveApproveService(
      repository,
      policy,
      audit,
      notifier,
      runner,
    ),
    rejection: new AdminLeaveRejectService(repository, policy, audit, notifier),
    retry: new AdminLeaveRetryService(repository, policy, runner),
    sweeper: new LeaveCancellationSweeper(db, repository, runner),
  };
}

/** Thế giới huỷ của booking (một bác sĩ, 8 khung giờ ngày `LEAVE_DAY`) cộng hàm chèn yêu cầu nghỉ của bác sĩ đó. */
export async function leaveSetup(db: DataSource, fx: BookingFixtures) {
  const w = await cancelWorld(db, fx);
  const doctorId = w.doctor.account.taiKhoanId;
  const adminId = w.systemAdmin.account.taiKhoanId;
  const leave = (
    input: {
      batDau?: string;
      ketThuc?: string;
      ca?: 'CaSang' | 'CaChieu';
      trangThai?: 'ChoDuyet' | 'DaDuyet' | 'TuChoi';
    } = {},
  ) =>
    fx.doctor.leaveRequest({
      bacSiId: doctorId,
      batDau: input.batDau ?? LEAVE_DAY,
      ...(input.ketThuc ? { ketThuc: input.ketThuc } : {}),
      ...(input.ca ? { hinhThuc: 'TheoCa' as const, ca: input.ca } : {}),
      ...(input.trangThai === undefined
        ? {}
        : {
            trangThai: input.trangThai,
            ...(input.trangThai === 'ChoDuyet'
              ? {}
              : { nguoiXuLyId: adminId, thoiDiemXuLy: '2026-11-01 09:00:00' }),
          }),
    });
  return { w, doctorId, adminId, leave };
}

export const requestRow = async (db: DataSource, id: string) =>
  (
    await db.query(
      `SELECT trang_thai AS trangThai, CAST(nguoi_xu_ly_id AS CHAR) AS nguoi, thoi_diem_xu_ly AS luc FROM yeu_cau_nghi_phep WHERE yeu_cau_nghi_phep_id = ?`,
      [id],
    )
  )[0] as { trangThai: string; nguoi: string | null; luc: Date | null };

export const appointmentRow = async (db: DataSource, lichHenId: string) =>
  (
    await db.query(
      `SELECT trang_thai AS trangThai, ly_do_huy AS lyDo FROM lich_hen WHERE lich_hen_id = ?`,
      [lichHenId],
    )
  )[0] as { trangThai: string; lyDo: string | null };

export const countRows = async (db: DataSource, sql: string) =>
  Number((await db.query(`SELECT COUNT(*) AS so ${sql}`))[0].so);

/** Mã lỗi của một lời hứa bị từ chối bằng `AppException` (ném lại mọi lỗi khác). */
export async function errorCodeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppException) return error.maLoi;
    throw error;
  }
  throw new Error('Mong đợi lỗi nhưng thành công');
}
