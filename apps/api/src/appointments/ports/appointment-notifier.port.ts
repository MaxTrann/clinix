import type { EntityManager } from 'typeorm';
import type { BookingNotificationEvent } from '../appointments.constants.js';
import { NoopPort } from './noop-warning.js';

// Cổng thông báo (PLAN booking 5.10 B, 5.12; Q29). Ghi `thong_bao` TRONG giao dịch đổi trạng thái (người gọi truyền `em`); gửi thư là việc của worker
// (notification/admin B9). Bản thật: B15.

/**
 * Sự kiện tối thiểu `[đề xuất]`: gửi cho tài khoản đặt (`lich_hen.benh_nhan_id`) theo 5.12. B10 và B15 thêm trường TUỲ CHỌN khi cần (biến thể huỷ theo `reason`,
 * `hoanDuKien`) mà không phá bản Fake.
 */
export interface AppointmentEvent {
  loaiSuKien: BookingNotificationEvent;
  lichHenId: string;
  taiKhoanId: string;
}

export interface AppointmentNotifier {
  notify(em: EntityManager, event: AppointmentEvent): Promise<void>;
}
export const APPOINTMENT_NOTIFIER = Symbol('APPOINTMENT_NOTIFIER');

export class NoopAppointmentNotifier
  extends NoopPort
  implements AppointmentNotifier
{
  protected readonly noopMessage =
    'AppointmentNotifier đang dùng bản Noop (chưa có thông báo thật, task B15): không ghi thông báo.';

  notify(): Promise<void> {
    this.warnOnce();
    return Promise.resolve();
  }
}
