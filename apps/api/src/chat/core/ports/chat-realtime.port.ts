import { NoopPort } from '../../../appointments/ports/noop-warning.js';
import type { ChatMessageEvent } from './chat-notifier.port.js';

// Cổng đẩy tin tức thời (chat B1; PLAN chat 5.4 quy tắc 6, 5.7). Gọi SAU commit, đúng MỘT lần cho mỗi tin mới; không gọi khi gửi trùng mã hay khi lỗi.
// Lỗi đẩy không làm hỏng việc gửi (web bù bằng REST). Bản thật (socket, phòng theo hội thoại, Lễ tân theo chi nhánh) là chat B5.
export interface ChatRealtime {
  publish(event: ChatMessageEvent): Promise<void>;
}
export const CHAT_REALTIME = Symbol('CHAT_REALTIME');

export class NoopChatRealtime extends NoopPort implements ChatRealtime {
  protected readonly noopMessage =
    'ChatRealtime đang dùng bản Noop (chưa có WebSocket thật, task chat B5): không đẩy tin.';

  publish(): Promise<void> {
    this.warnOnce();
    return Promise.resolve();
  }
}
