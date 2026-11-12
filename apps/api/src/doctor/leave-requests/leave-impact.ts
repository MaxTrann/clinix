import type { Logger } from '@nestjs/common';
import type { AppointmentLeaveReadPort } from '../leave-approval/appointment-leave-read.port.js';

/**
 * Số lịch hẹn đang có (D14: `ChoThanhToan`, `DaXacNhan`, `DaTiepDon`) trong các ca mà một yêu cầu nghỉ phủ (Q22), để Bác sĩ biết hệ quả. Chỉ là thông tin phụ:
 * đọc `booking` lỗi thì TRẢ `undefined` (bỏ trường, log tên lớp lỗi) thay vì làm hỏng phản hồi, vì yêu cầu đã được tạo/đọc xong và không thể hoàn tác một thao tác đã commit.
 * Không có ca nào ⇒ `0` mà không hỏi `booking`.
 */
export async function countActiveAppointments(
  port: AppointmentLeaveReadPort,
  lichLamViecIds: string[],
  logger: Logger,
): Promise<number | undefined> {
  if (lichLamViecIds.length === 0) return 0;
  try {
    const counts = await port.countByShifts(lichLamViecIds);
    return lichLamViecIds.reduce((sum, id) => sum + (counts[id] ?? 0), 0);
  } catch (error) {
    logger.warn(
      `Không đọc được số lịch hẹn của ca nghỉ phép (${error instanceof Error ? error.name : typeof error})`,
    );
    return undefined;
  }
}
