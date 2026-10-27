import { Reflector } from '@nestjs/core';
import { AUTH_ERROR_CODES } from '../auth.constants.js';
import type { AuthenticatedRequest } from '../decorators/current-user.decorator.js';
import { Public } from '../decorators/public.decorator.js';
import type { SessionService } from '../session/session.service.js';
import type { TokenService } from '../session/token.service.js';
import {
  expectHttpError,
  fakeHttpContext,
  thrownBy,
} from '../testing/http-test-helpers.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

// Task A4. Test case (mức đơn vị, TokenService và SessionService giả): DN-25, DN-35, DX-02, DM-05, SE-05, SE-06.
// Bản chạy với MySQL thật, JWT thật và HTTP thật ở test/auth-guards.e2e-spec.ts.
class ClosedController {
  handler(): string {
    return 'dong';
  }
}
class OpenMethodController {
  @Public()
  open(): string {
    return 'mo';
  }
}
@Public()
class OpenClassController {
  handler(): string {
    return 'mo';
  }
}

const CLAIMS = { accountId: '7', sessionId: '42' };

function build() {
  const tokens = {
    verifyAccessToken: vi.fn<TokenService['verifyAccessToken']>(),
  };
  const sessions = { resolveActive: vi.fn<SessionService['resolveActive']>() };
  const guard = new JwtAuthGuard(
    new Reflector(),
    tokens as unknown as TokenService,
    sessions as unknown as SessionService,
  );
  return { guard, tokens, sessions };
}

function requestOf(authorization?: string): AuthenticatedRequest {
  return {
    headers: authorization === undefined ? {} : { authorization },
  } as unknown as AuthenticatedRequest;
}

const closed = (request: AuthenticatedRequest) =>
  fakeHttpContext(request, ClosedController, 'handler');

describe('JwtAuthGuard — đọc token từ header Authorization (DN-25, SE-05)', () => {
  it.each([
    ['không có header', undefined],
    ['header rỗng', ''],
    ['chỉ có chữ Bearer', 'Bearer'],
    ['Bearer và dấu cách nhưng không token', 'Bearer '],
    ['scheme Basic', 'Basic YWJjOmRlZg=='],
    ['scheme lạ', 'Token abc.def.ghi'],
    ['không scheme, chỉ token', 'abc.def.ghi'],
    ['hai dấu cách sau Bearer', 'Bearer  abc.def.ghi'],
    ['token có khoảng trắng', 'Bearer abc def'],
  ])(
    '%s ⇒ 401 CHUA_DANG_NHAP, không verify, không chạm DB',
    async (_ten, header) => {
      const { guard, tokens, sessions } = build();
      const request = requestOf(header);

      const error = await thrownBy(() => guard.canActivate(closed(request)));

      expectHttpError(error, 401, AUTH_ERROR_CODES.NOT_LOGGED_IN);
      expect(tokens.verifyAccessToken).not.toHaveBeenCalled();
      expect(sessions.resolveActive).not.toHaveBeenCalled();
      expect(request.user).toBeUndefined();
    },
  );

  it.each(['Bearer', 'bearer', 'BEARER'])(
    'scheme "%s" không phân biệt hoa thường: token được đưa cho verifyAccessToken',
    async (scheme) => {
      const { guard, tokens } = build();
      tokens.verifyAccessToken.mockResolvedValue(null);

      await thrownBy(() =>
        guard.canActivate(closed(requestOf(`${scheme} tok.en.sig`))),
      );

      expect(tokens.verifyAccessToken).toHaveBeenCalledExactlyOnceWith(
        'tok.en.sig',
      );
    },
  );

  it('không đọc token từ cookie: chỉ có cookie refresh_token thì vẫn 401 CHUA_DANG_NHAP', async () => {
    const { guard, tokens } = build();
    const request = {
      headers: {},
      cookies: { refresh_token: 'a.b.c' },
    } as unknown as AuthenticatedRequest;

    const error = await thrownBy(() => guard.canActivate(closed(request)));

    expectHttpError(error, 401, AUTH_ERROR_CODES.NOT_LOGGED_IN);
    expect(tokens.verifyAccessToken).not.toHaveBeenCalled();
  });
});

describe('JwtAuthGuard — chữ ký, phiên và người dùng hiện tại (DN-25, DN-35, DX-02, DM-05, SE-05, SE-06)', () => {
  it('token không qua verifyAccessToken (sai chữ ký, alg none, hết hạn…) ⇒ 401 TOKEN_KHONG_HOP_LE và KHÔNG tra phiên', async () => {
    const { guard, tokens, sessions } = build();
    tokens.verifyAccessToken.mockResolvedValue(null);

    const error = await thrownBy(() =>
      guard.canActivate(closed(requestOf('Bearer bad.token.value'))),
    );

    expectHttpError(error, 401, AUTH_ERROR_CODES.INVALID_TOKEN);
    expect(sessions.resolveActive).not.toHaveBeenCalled();
  });

  it('chữ ký đúng nhưng phiên không còn dùng được (thu hồi, quá trần, tài khoản khoá) ⇒ 401 PHIEN_HET_HIEU_LUC', async () => {
    const { guard, tokens, sessions } = build();
    tokens.verifyAccessToken.mockResolvedValue(CLAIMS);
    sessions.resolveActive.mockResolvedValue(null);
    const request = requestOf('Bearer good.token.value');

    const error = await thrownBy(() => guard.canActivate(closed(request)));

    expectHttpError(error, 401, AUTH_ERROR_CODES.SESSION_INACTIVE);
    expect(sessions.resolveActive).toHaveBeenCalledExactlyOnceWith(CLAIMS);
    expect(request.user).toBeUndefined();
  });

  it('token và phiên đều hợp lệ ⇒ cho qua và gắn request.user đúng ba trường', async () => {
    const { guard, tokens, sessions } = build();
    tokens.verifyAccessToken.mockResolvedValue(CLAIMS);
    // Giả lập SessionService trả thừa trường: guard chỉ chép ba trường của hợp đồng, không lộ gì thêm
    sessions.resolveActive.mockResolvedValue({
      accountId: '7',
      sessionId: '42',
      role: 'BacSi',
      matKhauBam: 'khong-duoc-lot-ra',
    } as Awaited<ReturnType<SessionService['resolveActive']>>);
    const request = requestOf('Bearer good.token.value');

    await expect(guard.canActivate(closed(request))).resolves.toBe(true);

    expect(request.user).toStrictEqual({
      accountId: '7',
      sessionId: '42',
      role: 'BacSi',
    });
  });

  it('đóng mặc định khi DB lỗi: resolveActive ném lỗi ⇒ lỗi lan ra, không cho qua, không gắn user', async () => {
    const { guard, tokens, sessions } = build();
    tokens.verifyAccessToken.mockResolvedValue(CLAIMS);
    const dbError = new Error('mất kết nối MySQL');
    sessions.resolveActive.mockRejectedValue(dbError);
    const request = requestOf('Bearer good.token.value');

    const error = await thrownBy(() => guard.canActivate(closed(request)));

    expect(error).toBe(dbError);
    expect(request.user).toBeUndefined();
  });

  it('verifyAccessToken ném lỗi bất ngờ (không phải token hỏng) ⇒ lỗi lan ra, không cho qua', async () => {
    const { guard, tokens, sessions } = build();
    const unexpected = new Error('lỗi thư viện');
    tokens.verifyAccessToken.mockRejectedValue(unexpected);

    const error = await thrownBy(() =>
      guard.canActivate(closed(requestOf('Bearer good.token.value'))),
    );

    expect(error).toBe(unexpected);
    expect(sessions.resolveActive).not.toHaveBeenCalled();
  });
});

describe('JwtAuthGuard — @Public() mở route', () => {
  it('@Public ở method: cho qua, không đọc token, không gọi dịch vụ, không có user', async () => {
    const { guard, tokens, sessions } = build();
    const request = requestOf('Bearer rac.khong.hop.le');
    const context = fakeHttpContext(request, OpenMethodController, 'open');

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(tokens.verifyAccessToken).not.toHaveBeenCalled();
    expect(sessions.resolveActive).not.toHaveBeenCalled();
    expect(request.user).toBeUndefined();
  });

  it('@Public ở class: mọi method của controller đều mở, kể cả khi không có header', async () => {
    const { guard } = build();
    const context = fakeHttpContext(
      requestOf(),
      OpenClassController,
      'handler',
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('route không có @Public thì đóng: cùng request không header ⇒ 401', async () => {
    const { guard } = build();

    const error = await thrownBy(() => guard.canActivate(closed(requestOf())));

    expectHttpError(error, 401, AUTH_ERROR_CODES.NOT_LOGGED_IN);
  });
});
