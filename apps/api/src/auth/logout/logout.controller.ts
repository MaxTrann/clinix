import {
  Controller,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../decorators/public.decorator.js';
import { OriginGuard } from '../guards/origin.guard.js';
import { RefreshCookieService } from '../session/refresh-cookie.service.js';
import { SessionService } from '../session/session.service.js';

// Đăng xuất (task A10; PLAN 5.1, 5.3; quyết định A10-A…). Controller chỉ nhận/trả; thu hồi phiên là việc của `SessionService.revokeByRefreshToken` (A3).
//  - CÔNG KHAI về access token (`Public()`): access token thường đã hết hạn lúc người dùng bấm đăng xuất, nên phiên "hiện tại" được nhận ra bằng
//    cookie `refresh_token`. Header Authorization bị bỏ qua hoàn toàn; token cũng không được đọc từ thân, query hay header khác.
//  - `OriginGuard` chạy SAU hai guard toàn cục và TRƯỚC handler: Origin sai hoặc vắng ⇒ 403 khi chưa đụng DB, chưa xoá cookie.
//  - 204 không thân ở MỌI nhánh thành công, kể cả không có cookie, token sai chữ ký, phiên đã thu hồi, hết hạn hay không tồn tại (idempotent, DX-04…DX-06).
//    Cookie luôn bị xoá ở các nhánh này; `Cache-Control: no-store`.
//  - Lỗi DB KHÔNG bị nuốt: lỗi đi thẳng ra (500) và cookie chưa bị xoá, vì phiên còn sống nên người dùng phải thử lại được. Vì vậy `clear` đứng SAU `await`.
@Public()
@UseGuards(OriginGuard)
@Controller('auth/logout')
export class LogoutController {
  constructor(
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(RefreshCookieService)
    private readonly cookies: RefreshCookieService,
  ) {}

  @Post()
  @HttpCode(204)
  async create(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');

    const token = this.cookies.read(req);
    // Kết quả true/false (có thu hồi thật hay không) cố ý không dùng: client không được biết phiên có còn sống hay không
    if (token !== undefined) await this.sessions.revokeByRefreshToken(token);
    this.cookies.clear(res);
  }
}
