import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { countActiveByShifts } from './active-by-shifts.query.js';
import {
  findAffectedByLeave,
  listAffectedByLeave,
  type AffectedAppointmentRef,
  type AffectedByLeaveFilter,
  type AffectedLeaveSummary,
} from './affected-by-leave.query.js';

// `AppointmentQueries`: các hàm ĐỌC mà module `doctor` gọi vào (task B11; PLAN booking 5.1, 5.10 D5, D13, D14). Xuất từ `AppointmentsModule`. Không tiêm gì, không ghi, không khoá (không `FOR UPDATE`,
// không `FOR SHARE`: quét nguồn `queries/` ở AFL-03). Mỗi hàm nhận `em` của người gọi; truyền `em` của `runReadOnly` nếu cần nhiều câu cùng một ảnh chụp. Phần SQL ở hai file cạnh bên.

@Injectable()
export class AppointmentQueries {
  /**
   * D5: lịch `ChoThanhToan` hoặc `DaXacNhan` của bác sĩ trong khoảng nghỉ có `thoi_gian > now`, sắp `thoi_gian` tăng rồi `lich_hen_id`. Chỉ phụ thuộc dữ liệu và `now` truyền vào (CG-13).
   * `doctor` huỷ từng lịch bằng `AppointmentCancellationService.cancel` (B10).
   */
  findAffectedByLeave(
    em: EntityManager,
    filter: AffectedByLeaveFilter,
  ): Promise<AffectedAppointmentRef[]> {
    return findAffectedByLeave(em, filter);
  }

  /** D13: số liệu và `limit` dòng đầu cho hộp xác nhận của Duyệt nghỉ phép, CÙNG bộ lọc với `findAffectedByLeave` (CG-14). */
  listAffectedByLeave(
    em: EntityManager,
    input: AffectedByLeaveFilter & { limit: number },
  ): Promise<AffectedLeaveSummary> {
    return listAffectedByLeave(em, input);
  }

  /** D14: số lịch đang có (`ACTIVE_APPOINTMENT_STATES`) của từng ca; id không có lịch ⇒ `0`, danh sách rỗng ⇒ `{}`. */
  countActiveByShifts(
    em: EntityManager,
    input: { lichLamViecIds: string[] },
  ): Promise<Record<string, number>> {
    return countActiveByShifts(em, input);
  }
}
