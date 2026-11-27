import {
  Body,
  Controller,
  Header,
  HttpCode,
  Inject,
  Ip,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../../auth/decorators/public.decorator.js';
import { AskMessageDto, type AskResponse } from './ask.dto.js';
import { AskRateLimitedError } from './ask.errors.js';
import { AskService } from './ask.service.js';

// `POST /chatbot/messages` (chatbot B3; PLAN chatbot 5.3, 5.12). Route CÔNG KHAI: `@Public()`, KHÔNG đọc token (token Lễ tân hay sai đều xử lý như khách, TLA-11), không `@Roles`.
// `no-store` đặt bằng `@Header` TRƯỚC handler nên cả nhánh 400, 429, 503 và 500 đều có header (Nest áp header sau guard, trước pipe). POST mặc định 201 nên ép 200.
// Controller chỉ nhận và trả: toàn bộ logic ở `AskService`. Việc duy nhất thêm là `Retry-After` của 429 (cần đối tượng phản hồi).
@Controller('chatbot')
@Public()
export class AskController {
  constructor(@Inject(AskService) private readonly asks: AskService) {}

  @Post('messages')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async ask(
    @Body() body: AskMessageDto,
    @Ip() ip: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AskResponse> {
    try {
      return await this.asks.ask({ body, ip });
    } catch (error) {
      if (error instanceof AskRateLimitedError) {
        res.setHeader('Retry-After', String(error.retryAfterSeconds));
      }
      throw error;
    }
  }
}
