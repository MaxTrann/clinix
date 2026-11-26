import {
  Module,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import { noStore } from '../notification/center/notification-center.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
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
import { ChatActorResolver } from './read/chat-actor.resolver.js';
import { ConversationReadRepository } from './read/conversation-read.repository.js';
import { ConversationReadService } from './read/conversation-read.service.js';
import { ChatReadController } from './rest/chat-read.controller.js';

// Module "Nhắn tin" (scope #11). chat B1: lõi gửi; chat B2: API đọc (danh sách, chi tiết, tin, đánh dấu đọc, số đếm). Hai cổng gắn bản `Noop`: KHI CÓ BẢN THẬT
// (B6 thông báo, B5 socket) sửa đúng dòng của cổng đó. REST gửi (B3) và socket (B5) nhập `SendMessageService` qua `exports`.
// `RbacModule` cho `ReceptionScopeService` (chi nhánh của Lễ tân đọc ở mỗi yêu cầu).
@Module({
  imports: [RbacModule],
  controllers: [ChatReadController],
  providers: [
    SendMessageService,
    ConversationOpenRepository,
    MessageRepository,
    ConversationReadRepository,
    ConversationReadService,
    ChatActorResolver,
    { provide: CHAT_NOTIFIER, useClass: NoopChatNotifier },
    { provide: CHAT_REALTIME, useClass: NoopChatRealtime },
  ],
  exports: [SendMessageService],
})
export class ChatModule implements NestModule {
  // Tin nhắn là dữ liệu cá nhân: `Cache-Control: no-store` cho MỌI phản hồi của chat, kể cả 401, 400, 404 (middleware chạy trước guard; BCH-05).
  // Dùng lại đúng hàm của Trung tâm thông báo, không viết lại.
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(noStore).forRoutes(ChatReadController);
  }
}
