import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AuthenticatedUser } from '../../auth/decorators/current-user.decorator.js';
import { ChatAttachmentInspector } from '../attachments/chat-attachment.inspector.js';
import {
  CHAT_FILE_STORE,
  type ChatFileStore,
} from '../attachments/chat-file-store.js';
import { chatFailureException } from '../chat.constants.js';
import type { ChatActor } from '../core/chat-access.policy.js';
import {
  SendMessageService,
  type SendOutcome,
  type SendTarget,
} from '../core/send-message.service.js';
import { ChatActorResolver } from '../read/chat-actor.resolver.js';
import { ConversationReadRepository } from '../read/conversation-read.repository.js';
import { toMessageItem, type MessageItem } from './chat-view.mapper.js';

// Gửi tin qua REST bằng JSON (chat B3; PLAN chat 5.5, 5.6; HCH-04). MỌI luật (nội dung, mã gửi, quyền, bên kia, giới hạn tốc độ, tìm-hoặc-tạo) nằm ở lõi
// `SendMessageService.send` của B1; ở đây chỉ dựng người gửi từ token, gọi lõi, đổi lỗi có kiểu thành lỗi API, rồi dựng thân trả về.
// Thân của tin đọc lại từ DB bằng ĐÚNG câu và mapper của danh sách (B2) nên giống hệt tin đó khi tải lại (và khi B5 đẩy).
//
// Tin có tệp (chat B4; PLAN 5.8 "thứ tự"): (1) lõi kiểm trước quyền và mã gửi, không khoá (không thấy đích ⇒ 404, gửi lại ⇒ trả tin cũ: chưa xử lý, chưa ghi tệp gì);
// (2) kiểm và xử lý tệp theo nội dung; (3) ghi kho; (4) lõi gửi trong giao dịch, kiểm lại MỌI thứ dưới khoá; (5) giao dịch lỗi, bị từ chối hay hoá ra gửi lại ⇒ xoá tệp
// vừa ghi (TEP-08). Xoá lỗi thì chỉ log tên lớp lỗi; tệp sót lại là mồ côi, job dọn xoá sau 24 giờ.

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
  private readonly logger = new Logger(ChatSendService.name);

  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(SendMessageService) private readonly core: SendMessageService,
    @Inject(ConversationReadRepository)
    private readonly reads: ConversationReadRepository,
    @Inject(ChatActorResolver) private readonly actors: ChatActorResolver,
    @Inject(ChatAttachmentInspector)
    private readonly inspector: ChatAttachmentInspector,
    @Inject(CHAT_FILE_STORE) private readonly files: ChatFileStore,
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
    return this.respond(actor, outcome);
  }

  /** Gửi tin kèm MỘT tệp (`multipart`, chat B4). `noiDung` có thể trống hay không gửi (tin chỉ có tệp, TEP-13). */
  async sendWithFile(
    user: AuthenticatedUser,
    target: SendTarget,
    noiDung: unknown,
    maGui: unknown,
    file: { buffer: Buffer; originalname: string },
  ): Promise<SendResult> {
    const actor = await this.actors.resolve(user);
    const pre = await this.core.precheck({ actor, target, noiDung, maGui });
    if (pre.kind === 'Duplicate') return this.respond(actor, pre);
    if (pre.kind !== 'Proceed') throw chatFailureException(pre);

    const prepared = await this.inspector.prepare(
      file.buffer,
      file.originalname,
    );
    const stored = await this.files.write(prepared.kind, prepared.data);
    let outcome: SendOutcome;
    try {
      outcome = await this.core.send({
        actor,
        target,
        noiDung,
        maGui,
        tep: {
          khoa: stored.key,
          tenGoc: prepared.tenGoc,
          loai: prepared.mime,
          dungLuong: stored.size,
        },
      });
    } catch (error) {
      await this.discard(stored.key);
      throw error;
    }
    // Chỉ tin MỚI giữ tệp; bị từ chối dưới khoá hay hoá ra gửi lại (chạy đua cùng mã gửi) thì tệp này không dòng nào trỏ tới
    if (outcome.kind !== 'Sent') await this.discard(stored.key);
    return this.respond(actor, outcome);
  }

  private async discard(key: string): Promise<void> {
    try {
      await this.files.remove(key);
    } catch (error) {
      this.logger.warn(
        `Xoá tệp vừa ghi lỗi, để job dọn mồ côi xử lý (${error instanceof Error ? error.constructor.name : 'lỗi'})`,
      );
    }
  }

  private async respond(
    actor: ChatActor,
    outcome: SendOutcome,
  ): Promise<SendResult> {
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
