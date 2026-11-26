import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AuthenticatedUser } from '../../auth/decorators/current-user.decorator.js';
import { chatFailureException } from '../chat.constants.js';
import {
  SendMessageService,
  type SendTarget,
} from '../core/send-message.service.js';
import { ChatActorResolver } from '../read/chat-actor.resolver.js';
import { ConversationReadRepository } from '../read/conversation-read.repository.js';
import { toMessageItem, type MessageItem } from './chat-view.mapper.js';

// Gửi tin qua REST bằng JSON (chat B3; PLAN chat 5.5, 5.6; HCH-04). MỌI luật (nội dung, mã gửi, quyền, bên kia, giới hạn tốc độ, tìm-hoặc-tạo) nằm ở lõi
// `SendMessageService.send` của B1; ở đây chỉ dựng người gửi từ token, gọi lõi, đổi lỗi có kiểu thành lỗi API, rồi dựng thân trả về.
// Thân của tin đọc lại từ DB bằng ĐÚNG câu và mapper của danh sách (B2) nên giống hệt tin đó khi tải lại (và khi B5 đẩy).

export interface SentResponse {
  hoiThoaiId: string;
  tinNhan: MessageItem;
}

/** 201 khi ghi tin mới; 200 cùng thân khi gửi lại đúng mã gửi đã dùng (PLAN 5.6). */
export interface SendResult {
  status: 200 | 201;
  body: SentResponse;
}

@Injectable()
export class ChatSendService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(SendMessageService) private readonly core: SendMessageService,
    @Inject(ConversationReadRepository)
    private readonly reads: ConversationReadRepository,
    @Inject(ChatActorResolver) private readonly actors: ChatActorResolver,
  ) {}

  /** `noiDung`, `maGui` là `unknown`: DTO chỉ chặn trường lạ, kiểu và độ dài do lõi kiểm (một bộ luật cho REST và socket). */
  async send(
    user: AuthenticatedUser,
    target: SendTarget,
    noiDung: unknown,
    maGui: unknown,
  ): Promise<SendResult> {
    const actor = await this.actors.resolve(user);
    const outcome = await this.core.send({ actor, target, noiDung, maGui });
    if (outcome.kind !== 'Sent' && outcome.kind !== 'Duplicate')
      throw chatFailureException(outcome);
    const { tinNhanId, hoiThoaiId } = outcome.tinNhan;
    const [row] = await this.reads.messagesByIds(this.db.manager, [tinNhanId]);
    if (row === undefined)
      throw new Error(
        `Không đọc lại được tin vừa gửi (tinNhanId=${tinNhanId})`,
      );
    // Người xem là chính người gửi: tên chi nhánh chỉ cần khi Bệnh nhân xem tin của Lễ tân, không xảy ra ở đây
    return {
      status: outcome.kind === 'Sent' ? 201 : 200,
      body: { hoiThoaiId, tinNhan: toMessageItem(actor, row, null) },
    };
  }
}
