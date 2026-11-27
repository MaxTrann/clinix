import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { ParseRecordIdPipe } from '../../doctor/common/parse-record-id.pipe.js';
import type { SendTarget } from '../core/send-message.service.js';
import {
  StartConversationService,
  type DefaultBranchResponse,
} from '../read/start-conversation.service.js';
// Import GIÁ TRỊ cho DTO: ValidationPipe cần metadata của lớp lúc chạy
import { SendMessageDto } from './chat-send.dto.js';
import { ChatSendService, type SentResponse } from './chat-send.service.js';
import {
  ChatFileInterceptor,
  ChatUploadCapacityInterceptor,
  ChatUploadDeadlineInterceptor,
  ChatUploadErrorInterceptor,
  type UploadedChatFile,
} from './chat-upload.interceptors.js';
import type { StartHeader } from './chat-view.mapper.js';

// Ba route gửi nhận JSON `{ noiDung, maGui }` (B3) HOẶC `multipart` trường `file`, `noiDung`, `maGui` (chat B4): có tệp thì đi đường tệp của service.
const SendInterceptors = UseInterceptors(
  ChatUploadCapacityInterceptor,
  ChatUploadErrorInterceptor,
  ChatFileInterceptor,
  ChatUploadDeadlineInterceptor,
);

// API gửi tin và bắt đầu hội thoại (chat B3; PLAN chat 5.6, T2, T3). Controller chỉ nhận/trả; luật ở lõi gửi (B1) và các service.
//  - Gửi vào hội thoại đã có: Bệnh nhân, Bác sĩ, Lễ tân. Bắt đầu với bác sĩ hay chi nhánh và chi nhánh mặc định: CHỈ Bệnh nhân (Bác sĩ, Lễ tân không tự mở hội thoại,
//    2.4.29 b1; NBN-02, QCH-06 ⇒ 403). Quản trị viên 403 ở mọi route (Q13).
//  - Id trên đường dẫn qua `ParseRecordIdPipe` (sai dạng ⇒ 404 cùng thân, NBS-08); `Cache-Control: no-store` do middleware của ChatModule (BCH-05).
//  - Mã trạng thái: 201 tin mới, 200 gửi lại cùng mã gửi (`passthrough` giữ cách Nest tự trả JSON).
@Controller('chat')
export class ChatSendController {
  constructor(
    @Inject(ChatSendService) private readonly sender: ChatSendService,
    @Inject(StartConversationService)
    private readonly start: StartConversationService,
  ) {}

  @Post('conversations/:id/messages')
  @Roles('BenhNhan', 'BacSi', 'LeTan')
  @SendInterceptors
  async sendToConversation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseRecordIdPipe) id: string,
    @Body() body: SendMessageDto,
    @UploadedFile() file: UploadedChatFile | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SentResponse> {
    const result = await this.send(user, { hoiThoaiId: id }, body, file);
    res.status(result.status);
    return result.body;
  }

  @Get('doctors/:bacSiId')
  @Roles('BenhNhan')
  doctor(
    @CurrentUser() user: AuthenticatedUser,
    @Param('bacSiId', ParseRecordIdPipe) bacSiId: string,
  ): Promise<StartHeader> {
    return this.start.doctor(user, bacSiId);
  }

  @Post('doctors/:bacSiId/messages')
  @Roles('BenhNhan')
  @SendInterceptors
  async sendToDoctor(
    @CurrentUser() user: AuthenticatedUser,
    @Param('bacSiId', ParseRecordIdPipe) bacSiId: string,
    @Body() body: SendMessageDto,
    @UploadedFile() file: UploadedChatFile | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SentResponse> {
    const result = await this.send(user, { bacSiId }, body, file);
    res.status(result.status);
    return result.body;
  }

  @Get('branches/:chiNhanhId')
  @Roles('BenhNhan')
  branch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('chiNhanhId', ParseRecordIdPipe) chiNhanhId: string,
  ): Promise<StartHeader> {
    return this.start.branch(user, chiNhanhId);
  }

  @Post('branches/:chiNhanhId/messages')
  @Roles('BenhNhan')
  @SendInterceptors
  async sendToBranch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('chiNhanhId', ParseRecordIdPipe) chiNhanhId: string,
    @Body() body: SendMessageDto,
    @UploadedFile() file: UploadedChatFile | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SentResponse> {
    const result = await this.send(user, { chiNhanhId }, body, file);
    res.status(result.status);
    return result.body;
  }

  private send(
    user: AuthenticatedUser,
    target: SendTarget,
    body: SendMessageDto,
    file: UploadedChatFile | undefined,
  ) {
    return file
      ? this.sender.sendWithFile(user, target, body.noiDung, body.maGui, file)
      : this.sender.send(user, target, body.noiDung, body.maGui);
  }

  @Get('default-branch')
  @Roles('BenhNhan')
  defaultBranch(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DefaultBranchResponse> {
    return this.start.defaultBranch(user);
  }
}
