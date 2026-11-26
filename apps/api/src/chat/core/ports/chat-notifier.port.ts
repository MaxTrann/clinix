import type { EntityManager } from 'typeorm';
import { NoopPort } from '../../../appointments/ports/noop-warning.js';
import type { LoaiHoiThoai } from '../../entities/enums.js';

// Cổng thông báo tin nhắn mới (chat B1; PLAN chat 5.10, 5.12; nếp cổng booking). Gọi TRONG giao dịch gửi, dưới khoá hội thoại (người gọi truyền `em`), nên
// thông báo lỗi thì tin cũng bị hoàn tác (LOI-14). Bản thật (người nhận, gộp theo hội thoại, câu chữ) là chat B6.

/** Sự kiện một tin vừa được lưu. KHÔNG có nội dung tin hay tên tệp (thông báo không bao giờ chứa chúng, 5.10, 5.11). */
export interface ChatMessageEvent {
  hoiThoaiId: string;
  loai: LoaiHoiThoai;
  /** Hộp thư chung: chi nhánh; hội thoại bác sĩ: null. */
  chiNhanhId: string | null;
  /** Bệnh nhân chủ hội thoại. */
  benhNhanId: string;
  /** Bác sĩ thành viên (hội thoại bác sĩ); null ở hộp thư chung. */
  bacSiId: string | null;
  nguoiGuiId: string;
  vaiTroNguoiGui: 'BenhNhan' | 'BacSi' | 'LeTan';
  tinNhanId: string;
  /** Tin đầu tiên, hội thoại vừa được tạo trong cùng giao dịch. */
  hoiThoaiMoi: boolean;
}

export interface ChatNotifier {
  notify(em: EntityManager, event: ChatMessageEvent): Promise<void>;
}
export const CHAT_NOTIFIER = Symbol('CHAT_NOTIFIER');

export class NoopChatNotifier extends NoopPort implements ChatNotifier {
  protected readonly noopMessage =
    'ChatNotifier đang dùng bản Noop (chưa có thông báo tin nhắn thật, task chat B6): không ghi thông báo.';

  notify(): Promise<void> {
    this.warnOnce();
    return Promise.resolve();
  }
}
