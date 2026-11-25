import type { DataSource } from 'typeorm';
import { SystemConfigRepository } from '../../admin/system-config/system-config.repository.js';
import { SystemConfigService } from '../../admin/system-config/system-config.service.js';
import { BranchHoursReader } from '../../scheduling/branch-hours/branch-hours.reader.js';
import { RescheduleDetailReader } from '../reschedule/reschedule-detail.reader.js';
import { RescheduleRequestRepository } from '../reschedule/reschedule-request.repository.js';
import { RescheduleReader } from '../reschedule/reschedule.reader.js';
import { BookabilityReader } from '../slots/bookability.reader.js';
import {
  FakeDoctorLeavePort,
  FakePendingBranchChangesPort,
} from './fake-ports.js';

// Dựng `RescheduleDetailReader` THẬT cho int-spec của chi tiết lịch (reschedule B5): bốn int-spec (Bệnh nhân, Lễ tân, payment, đổi lịch) cùng dựng một bộ đọc nên MỘT chỗ ở đây, để jscpd (vốn quét cả
// `*.int-spec.ts`) không thấy cùng một khối ở nhiều file. Đường đọc "không khung giờ đích" không chạm `BookabilityReader` (hai cổng giả chỉ để thoả hàm dựng của `RescheduleReader`).
// Nằm trong `testing/` nên AR-01 và AR-06 bỏ qua.

/** `RescheduleReader` THẬT; hai cổng nghỉ phép và thay đổi chi nhánh là `Fake` (truyền bản của test để cho chặn khi cần; mặc định không chặn). */
export function realRescheduleReader(
  db: DataSource,
  ports: {
    leave?: FakeDoctorLeavePort;
    pending?: FakePendingBranchChangesPort;
  } = {},
): RescheduleReader {
  return new RescheduleReader(
    new BookabilityReader(
      new BranchHoursReader(),
      ports.leave ?? new FakeDoctorLeavePort(),
      ports.pending ?? new FakePendingBranchChangesPort(),
    ),
    new SystemConfigService(new SystemConfigRepository(db)),
  );
}

export function realRescheduleDetailReader(
  db: DataSource,
): RescheduleDetailReader {
  return new RescheduleDetailReader(
    realRescheduleReader(db),
    new RescheduleRequestRepository(),
  );
}
