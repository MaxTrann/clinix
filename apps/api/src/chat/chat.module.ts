import { Module } from '@nestjs/common';
import { ConversationOpenRepository } from './core/conversation-open.repository.js';
import { MessageRepository } from './core/message.repository.js';
import {
  CHAT_NOTIFIER,
  NoopChatNotifier,
} from './core/ports/chat-notifier.port.js';
import {
  CHAT_REALTIME,
  NoopChatRealtime,
} from './core/ports/chat-realtime.port.js';
import { SendMessageService } from './core/send-message.service.js';

// Module "Nhắn tin" (scope #11). chat B1: chỉ có lõi gửi (chưa có route). Hai cổng gắn bản `Noop`: KHI CÓ BẢN THẬT (B6 thông báo, B5 socket) sửa đúng dòng của cổng đó.
// REST (B2, B3) và socket (B5) nhập `SendMessageService` qua `exports`.
@Module({
  providers: [
    SendMessageService,
    ConversationOpenRepository,
    MessageRepository,
    { provide: CHAT_NOTIFIER, useClass: NoopChatNotifier },
    { provide: CHAT_REALTIME, useClass: NoopChatRealtime },
  ],
  exports: [SendMessageService],
})
export class ChatModule {}
