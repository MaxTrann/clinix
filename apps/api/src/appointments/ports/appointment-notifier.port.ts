import type { EntityManager } from 'typeorm';
import type { BookingNotificationEvent } from '../appointments.constants.js';
import type { CancelReason } from '../cancel/cancel.types.js';
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
  /**
   * Chỉ `LichHenDaXacNhan` (task B11, Q20, Q46): tổng tiền `payment` đã thu thật cho lịch, chuỗi decimal (H11), để thư dựng "Tổng giá, cọc, còn lại" mà KHÔNG đọc bảng của
   * `payment` (`confirmPaid` chạy TRƯỚC khi `payment` ghi `giao_dich_thanh_toan`, nên lúc `notify` chưa có dòng nào để đọc). Còn lại = `gia_snapshot` trừ số này.
   */
  daThu?: string;
  /**
   * Chỉ có ở `LichHenDaHuy` (B10; TRACKING 3.23 B10-F): lý do huỷ để B15 chọn một trong ba biến thể thư (Figma 676:2) và số hoàn mà lần huỷ này TÍNH RA (`null` khi chưa thu đồng nào).
   * Là số tính lúc huỷ, không phải số đã vào ví: thư hoàn tiền thực tế do `wallet` gửi (5.12).
   */
  huy?: {
    reason: CancelReason;
    hoanCoc: { tyLe: number; soTien: string } | null;
  };
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
