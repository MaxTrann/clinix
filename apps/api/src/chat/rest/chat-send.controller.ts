import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { ParseRecordIdPipe } from '../../doctor/common/parse-record-id.pipe.js';
import {
  StartConversationService,
  type DefaultBranchResponse,
} from '../read/start-conversation.service.js';
// Import GIÁ TRỊ cho DTO: ValidationPipe cần metadata của lớp lúc chạy
import { SendMessageDto } from './chat-send.dto.js';
import { ChatSendService, type SentResponse } from './chat-send.service.js';
import type { StartHeader } from './chat-view.mapper.js';

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
  async sendToConversation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseRecordIdPipe) id: string,
    @Body() body: SendMessageDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SentResponse> {
    const result = await this.sender.send(
      user,
      { hoiThoaiId: id },
      body.noiDung,
      body.maGui,
    );
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
  async sendToDoctor(
    @CurrentUser() user: AuthenticatedUser,
    @Param('bacSiId', ParseRecordIdPipe) bacSiId: string,
    @Body() body: SendMessageDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SentResponse> {
    const result = await this.sender.send(
      user,
      { bacSiId },
      body.noiDung,
      body.maGui,
    );
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
  async sendToBranch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('chiNhanhId', ParseRecordIdPipe) chiNhanhId: string,
    @Body() body: SendMessageDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SentResponse> {
    const result = await this.sender.send(
      user,
      { chiNhanhId },
      body.noiDung,
      body.maGui,
    );
    res.status(result.status);
    return result.body;
  }

  @Get('default-branch')
  @Roles('BenhNhan')
  defaultBranch(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DefaultBranchResponse> {
    return this.start.defaultBranch(user);
  }
}
