import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Readable } from 'node:stream';
import type { AuthenticatedUser } from '../../auth/decorators/current-user.decorator.js';
import {
  CHAT_FILE_STORE,
  InvalidChatFileKeyError,
  type ChatFileStore,
} from '../attachments/chat-file-store.js';
import { attachmentDisposition } from '../attachments/chat-file-name.js';
import { chatFailureException } from '../chat.constants.js';
import { ConversationReadService } from '../read/conversation-read.service.js';

// Tải tệp đính kèm (chat B4; PLAN chat 5.8). Quyền như đọc tin (ConversationReadService.attachment): không thấy, không có, không tệp ⇒ cùng một 404.
// Sáu header (TEP-09): `Content-Type` lấy từ `tep_loai` (máy chủ đã nhận ra từ nội dung), `Content-Length`, `Content-Disposition: attachment` (không bao giờ `inline`:
// trình duyệt không tự mở), `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox` (tệp có mở trực tiếp cũng không chạy được gì),
// `Cache-Control: no-store` (middleware của ChatModule đặt cho mọi phản hồi của chat, đặt lại ở đây để header đi cùng tệp).

export interface AttachmentDownload {
  stream: Readable;
  headers: Record<string, string>;
}

@Injectable()
export class ChatAttachmentService {
  private readonly logger = new Logger(ChatAttachmentService.name);

  constructor(
    @Inject(ConversationReadService)
    private readonly reads: ConversationReadService,
    @Inject(CHAT_FILE_STORE) private readonly files: ChatFileStore,
  ) {}

  async open(
    user: AuthenticatedUser,
    tinNhanId: string,
  ): Promise<AttachmentDownload> {
    const info = await this.reads.attachment(user, tinNhanId);
    let content: Awaited<ReturnType<ChatFileStore['openRead']>>;
    try {
      content = await this.files.openRead(info.khoa);
    } catch (error) {
      // Khoá trong DB sai mẫu: dữ liệu hỏng, coi như mất tệp (không đọc đường dẫn lạ)
      if (!(error instanceof InvalidChatFileKeyError)) throw error;
      content = null;
    }
    if (content === null) {
      // Volume bị khôi phục thiếu hay tệp bị xoá tay (TEP-10): log CHỈ id tin, không khoá, không tên tệp
      this.logger.warn(
        `Tệp đính kèm không còn trong kho (tinNhanId=${tinNhanId})`,
      );
      throw chatFailureException({ kind: 'NotFound' });
    }
    return {
      stream: content.stream,
      headers: {
        'Content-Type': info.loai,
        'Content-Length': String(content.size),
        'Content-Disposition': attachmentDisposition(info.ten),
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Cache-Control': 'no-store',
      },
    };
  }
}
