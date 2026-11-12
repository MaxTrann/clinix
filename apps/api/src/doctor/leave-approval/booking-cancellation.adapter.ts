import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppointmentCancellationService } from '../../appointments/cancel/appointment-cancellation.service.js';
import type { CancelOutcome } from '../../appointments/cancel/cancel.types.js';
import type {
  AffectedAppointmentRef,
  AffectedByLeaveFilter,
  AffectedLeaveSummary,
} from '../../appointments/queries/affected-by-leave.query.js';
import { AppointmentQueries } from '../../appointments/queries/appointment-queries.js';
import type { AppointmentCancellationPort } from './appointment-cancellation.port.js';
import type { AppointmentLeaveReadPort } from './appointment-leave-read.port.js';

/**
 * Bản thật của `AppointmentCancellationPort` (D5, `cancel`) và `AppointmentLeaveReadPort` (D13, D14): chỉ chuyển lời gọi sang hai dịch vụ mà `AppointmentsModule` xuất (booking B10, B11). Không có logic riêng.
 * Không tự mở giao dịch và không giữ khoá nào của `doctor` (PLAN 5.9: không bao giờ giữ `bac_si` X trong lúc gọi `booking`).
 */
@Injectable()
export class BookingCancellationAdapter
  implements AppointmentCancellationPort, AppointmentLeaveReadPort
{
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(AppointmentQueries) private readonly queries: AppointmentQueries,
    @Inject(AppointmentCancellationService)
    private readonly cancellation: AppointmentCancellationService,
  ) {}

  findAffected(
    filter: AffectedByLeaveFilter,
  ): Promise<AffectedAppointmentRef[]> {
    // Một câu SELECT, không khoá: dùng `manager` của DataSource (tự commit), không cần giao dịch.
    return this.queries.findAffectedByLeave(this.db.manager, filter);
  }

  // D13, D14 (B17): chỉ đọc, một câu mỗi lần, `manager` của DataSource tự commit; không khoá, không giao dịch.
  listAffected(
    input: AffectedByLeaveFilter & { limit: number },
  ): Promise<AffectedLeaveSummary> {
    return this.queries.listAffectedByLeave(this.db.manager, input);
  }

  countByShifts(lichLamViecIds: string[]): Promise<Record<string, number>> {
    return this.queries.countActiveByShifts(this.db.manager, {
      lichLamViecIds,
    });
  }

  cancelForLeave(maLichHen: string): Promise<CancelOutcome> {
    // Không truyền `lyDo`: với `HeThong` hợp đồng của booking cấm (`lyDo?: never`, booking Q27); `ly_do_huy` là chữ hằng "Bác sĩ nghỉ phép".
    return this.cancellation.cancel({
      maLichHen,
      actor: { kind: 'HeThong' },
      reason: 'BacSiNghiPhep',
    });
  }
}
