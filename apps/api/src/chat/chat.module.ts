import {
  Module,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { noStore } from '../notification/center/notification-center.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { UploadModule } from '../common/upload/upload.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { ChatAttachmentInspector } from './attachments/chat-attachment.inspector.js';
import { ChatFileCleanupService } from './attachments/chat-file-cleanup.service.js';
import { CHAT_FILE_STORE } from './attachments/chat-file-store.js';
import { resolveChatFilesDir } from './attachments/chat-files-dir.js';
import { LocalDiskChatFileStore } from './attachments/local-disk-chat-file-store.js';
import { ConversationOpenRepository } from './core/conversation-open.repository.js';
import { MessageRepository } from './core/message.repository.js';
import {
  CHAT_NOTIFIER,
  NoopChatNotifier,
} from './core/ports/chat-notifier.port.js';
import { CHAT_REALTIME } from './core/ports/chat-realtime.port.js';
import { SendMessageService } from './core/send-message.service.js';
import { ChatActorResolver } from './read/chat-actor.resolver.js';
import { ConversationReadRepository } from './read/conversation-read.repository.js';
import { ConversationReadService } from './read/conversation-read.service.js';
import { StartConversationRepository } from './read/start-conversation.repository.js';
import { StartConversationService } from './read/start-conversation.service.js';
import { ChatConnectionRegistry } from './realtime/chat-connection.registry.js';
import { ChatGateway } from './realtime/chat.gateway.js';
import { ChatRecipientsRepository } from './realtime/chat-recipients.repository.js';
import { ChatSocketSessions } from './realtime/chat-socket-sessions.js';
import { SocketChatRealtime } from './realtime/socket-chat-realtime.js';
import { ChatAttachmentController } from './rest/chat-attachment.controller.js';
import { ChatAttachmentService } from './rest/chat-attachment.service.js';
import { ChatReadController } from './rest/chat-read.controller.js';
import { ChatSendController } from './rest/chat-send.controller.js';
import { ChatSendService } from './rest/chat-send.service.js';
import { ChatUploadCapacityInterceptor } from './rest/chat-upload.interceptors.js';

// Module "Nhắn tin" (scope #11). chat B1: lõi gửi; chat B2: API đọc (danh sách, chi tiết, tin, đánh dấu đọc, số đếm); chat B3: API gửi bằng JSON, đầu khung trước tin đầu, chi nhánh mặc định. Cổng thông báo còn bản `Noop`: KHI CÓ BẢN THẬT
// (B6) sửa đúng dòng của cổng đó. REST gửi (B3) và socket (B5) nhập `SendMessageService` qua `exports`.
// chat P3: kho tệp đính kèm trên đĩa (`CHAT_FILES_DIR`), kiểm ghi được lúc khởi động; B4 dùng qua `CHAT_FILE_STORE`.
// chat B4: gửi kèm tệp ở ba route gửi, tải tệp, job dọn mồ côi; `UploadModule` cho `ImageProcessor`. Bộ đếm tải đồng thời là provider (một bộ đếm cho cả ba route).
// chat P4: gateway WebSocket (chỉ bắt tay và vòng đời kết nối) và sổ kết nối; `AuthModule` cho `TokenService`, `SessionService` (chỉ dùng, không sửa auth).
// chat B5: cổng `CHAT_REALTIME` gắn bản thật `SocketChatRealtime` (đẩy `chat:tin-moi` sau commit); gateway nhận `chat:gui`; `ChatSocketSessions` kiểm phiên và quét mỗi 60 giây.
// `RbacModule` cho `ReceptionScopeService` (chi nhánh của Lễ tân đọc ở mỗi yêu cầu).
@Module({
  imports: [AuthModule, RbacModule, UploadModule],
  controllers: [
    ChatReadController,
    ChatSendController,
    ChatAttachmentController,
  ],
  providers: [
    SendMessageService,
    ConversationOpenRepository,
    MessageRepository,
    ConversationReadRepository,
    ConversationReadService,
    ChatActorResolver,
    StartConversationRepository,
    StartConversationService,
    ChatSendService,
    ChatAttachmentInspector,
    ChatAttachmentService,
    ChatFileCleanupService,
    ChatUploadCapacityInterceptor,
    ChatConnectionRegistry,
    ChatGateway,
    ChatSocketSessions,
    ChatRecipientsRepository,
    { provide: CHAT_NOTIFIER, useClass: NoopChatNotifier },
    { provide: CHAT_REALTIME, useClass: SocketChatRealtime },
    {
      provide: CHAT_FILE_STORE,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) =>
        new LocalDiskChatFileStore(
          resolveChatFilesDir(
            config.get('NODE_ENV', { infer: true }),
            config.get('CHAT_FILES_DIR', { infer: true }),
          ),
        ),
    },
  ],
  exports: [SendMessageService],
})
export class ChatModule implements NestModule {
  // Tin nhắn là dữ liệu cá nhân: `Cache-Control: no-store` cho MỌI phản hồi của chat, kể cả 401, 400, 404 (middleware chạy trước guard; BCH-05).
  // Dùng lại đúng hàm của Trung tâm thông báo, không viết lại.
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(noStore)
      .forRoutes(
        ChatReadController,
        ChatSendController,
        ChatAttachmentController,
      );
  }
}
