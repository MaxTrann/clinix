import {
  Controller,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AUTH_ERROR_CODES } from '../auth.constants.js';
import { Public } from '../decorators/public.decorator.js';
import { OriginGuard } from '../guards/origin.guard.js';
import { RefreshCookieService } from '../session/refresh-cookie.service.js';
import { SessionService } from '../session/session.service.js';

/** Thân phản hồi làm mới thành công: ĐÚNG một trường (quyết định A9-B). Refresh token mới chỉ ở cookie; vai trò và họ tên lấy ở GET /auth/me (A15). */
export interface RefreshResponse {
  accessToken: string;
}

// Làm mới phiên (task A9; PLAN 5.1, 5.3; quyết định A9-A…A9-H). Controller chỉ nhận/trả; toàn bộ logic (chữ ký, băm, hạn, trần, xoay, dùng lại) ở
// `SessionService.refresh` của A3.
//  - CÔNG KHAI về access token (`Public()`): người gọi thường có access token đã hết hạn nên xác thực bằng cookie `refresh_token`. Header Authorization
//    bị bỏ qua hoàn toàn. Token chỉ được đọc từ cookie, không từ thân, query hay header.
//  - `OriginGuard` (guard của controller) chạy SAU hai guard toàn cục và TRƯỚC handler: Origin sai hoặc vắng ⇒ 403 mà chưa đụng DB, chưa đặt hay xoá cookie.
//  - 200 { accessToken } + Set-Cookie refresh mới (do RefreshCookieService: HttpOnly, Secure theo COOKIE_SECURE, SameSite=Lax, Path=/api/auth, Expires =
//    hạn không hoạt động mới của phiên). Mọi nhánh của handler có `Cache-Control: no-store`.
//  - Hai mã 401, không để lộ lý do (A3): CHUA_DANG_NHAP (không có cookie dùng được) và PHIEN_HET_HIEU_LUC (mọi lý do khác: sai dạng, sai chữ ký, không có
//    phiên, đã thu hồi, dùng lại, quá hạn, quá trần, tài khoản không hoạt động). Nhánh sau xoá cookie vì phiên đã chết với mọi token. Lỗi DB (500) không
//    đặt hay xoá cookie: giao dịch đã hoàn tác nên token cũ vẫn là token hiện tại.
// `refresh` TRẢ kết quả có kiểu và đã commit xong trước khi dòng ném lỗi dưới đây chạy, nên việc thu hồi do dùng lại không bị hoàn tác (bài học A2, A8).
@Public()
@UseGuards(OriginGuard)
@Controller('auth/refresh')
export class RefreshController {
  constructor(
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(RefreshCookieService)
    private readonly cookies: RefreshCookieService,
  ) {}

  @Post()
  @HttpCode(200)
  async create(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RefreshResponse> {
    // Phản hồi mang token: không cho trình duyệt hay proxy lưu lại
    res.setHeader('Cache-Control', 'no-store');

    const token = this.cookies.read(req);
    if (token === undefined) {
      throw new UnauthorizedException(AUTH_ERROR_CODES.NOT_LOGGED_IN);
    }

    const result = await this.sessions.refresh(token);
    if (!result.ok) {
      this.cookies.clear(res);
      throw new UnauthorizedException(AUTH_ERROR_CODES.SESSION_INACTIVE);
    }
    this.cookies.set(
      res,
      result.tokens.refreshToken,
      result.tokens.refreshTokenExpiresAt,
    );
    return { accessToken: result.tokens.accessToken };
  }
}
