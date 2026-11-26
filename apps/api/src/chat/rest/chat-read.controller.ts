import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { ParseRecordIdPipe } from '../../doctor/common/parse-record-id.pipe.js';
import {
  ConversationReadService,
  type ConversationListResponse,
  type MarkReadResponse,
  type MessagesResponse,
  type UnreadCountResponse,
} from '../read/conversation-read.service.js';
// Import GIÁ TRỊ cho DTO: ValidationPipe cần metadata của lớp lúc chạy
import {
  ConversationListQueryDto,
  MarkReadDto,
  MessagesQueryDto,
} from './chat-read.dto.js';
import type { ConversationDetail } from './chat-view.mapper.js';

// API đọc của chat (chat B2; PLAN chat 5.6, T2, T3). Controller chỉ nhận/trả; quyền và logic ở ConversationReadService.
//  - `@Roles('BenhNhan', 'BacSi', 'LeTan')` trên TỪNG route: Quản trị viên (cả hai phạm vi) nhận 403 (Q13, QCH-02).
//  - Id trên đường dẫn qua `ParseRecordIdPipe`: sai dạng ⇒ 404 cùng thân với "không có" (QCH-07); guard chạy trước pipe nên sai vai trò vẫn là 403.
//  - `Cache-Control: no-store` do middleware của ChatModule đặt (chạy trước guard nên cả 401, 400, 404 cũng có; BCH-05).
//  - Không OriginGuard, không RequireAdminScope: xác thực bằng header Authorization, dữ liệu của chính người dùng.
@Controller('chat')
export class ChatReadController {
  constructor(
    @Inject(ConversationReadService)
    private readonly service: ConversationReadService,
  ) {}

  @Get('conversations')
  @Roles('BenhNhan', 'BacSi', 'LeTan')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ConversationListQueryDto,
  ): Promise<ConversationListResponse> {
    return this.service.list(user, {
      loc: query.loc,
      q: query.q,
      truoc: query.truoc,
      limit: query.limit,
    });
  }

  @Get('unread-count')
  @Roles('BenhNhan', 'BacSi', 'LeTan')
  unreadCount(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UnreadCountResponse> {
    return this.service.unreadCount(user);
  }

  @Get('conversations/:id')
  @Roles('BenhNhan', 'BacSi', 'LeTan')
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseRecordIdPipe) id: string,
  ): Promise<ConversationDetail> {
    return this.service.detail(user, id);
  }

  @Get('conversations/:id/messages')
  @Roles('BenhNhan', 'BacSi', 'LeTan')
  messages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseRecordIdPipe) id: string,
    @Query() query: MessagesQueryDto,
  ): Promise<MessagesResponse> {
    return this.service.messages(user, id, {
      truoc: query.truoc,
      sau: query.sau,
      limit: query.limit,
    });
  }

  // 200 (không 201): không tạo tài nguyên mới mà đẩy mốc (cùng nếp `POST /notifications/:id/read`)
  @Post('conversations/:id/read')
  @HttpCode(200)
  @Roles('BenhNhan', 'BacSi', 'LeTan')
  markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseRecordIdPipe) id: string,
    @Body() body: MarkReadDto,
  ): Promise<MarkReadResponse> {
    return this.service.markRead(user, id, body.tinNhanId);
  }
}
