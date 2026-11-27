import { Controller, Get, Inject, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { ParseRecordIdPipe } from '../../doctor/common/parse-record-id.pipe.js';
import { ChatAttachmentService } from './chat-attachment.service.js';

// Tải tệp đính kèm của tin (chat B4; PLAN chat 5.6, 5.8). Controller chỉ nhận/trả: quyền, header ở ChatAttachmentService.
// Ba vai trò tham gia chat; Quản trị viên 403 (Q13). Id sai dạng ⇒ 404 cùng thân (ParseRecordIdPipe).
@Controller('chat')
export class ChatAttachmentController {
  constructor(
    @Inject(ChatAttachmentService)
    private readonly attachments: ChatAttachmentService,
  ) {}

  @Get('messages/:tinNhanId/attachment')
  @Roles('BenhNhan', 'BacSi', 'LeTan')
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tinNhanId', ParseRecordIdPipe) tinNhanId: string,
    @Res() res: Response,
  ): Promise<void> {
    // Lỗi (404, 403) ném TRƯỚC khi gửi byte nào nên vẫn qua bộ lọc lỗi chung
    const { stream, headers } = await this.attachments.open(user, tinNhanId);
    res.status(200).set(headers);
    // Đọc đĩa lỗi giữa chừng: đã gửi header nên chỉ còn cách cắt kết nối (client thấy tải hỏng)
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }
}
