import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants.js';
import { RequestMethod } from '@nestjs/common';
import type { Request, Response } from 'express';
import { vi } from 'vitest';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { OriginGuard } from '../guards/origin.guard.js';
import type { RefreshCookieService } from '../session/refresh-cookie.service.js';
import type { SessionService } from '../session/session.service.js';
import { thrownBy } from '../testing/http-test-helpers.js';
import { LogoutController } from './logout.controller.js';

// Task A10 — controller chỉ nhận/trả: đọc cookie, gọi SessionService.revokeByRefreshToken, LUÔN xoá cookie sau khi thu hồi xong, Cache-Control: no-store,
// không trả gì (204), và KHÔNG xoá cookie khi thu hồi lỗi. Mã LO-nn là [đề xuất]. Cờ cookie, Origin, 204 không thân và DB thật qua HTTP:
// test/auth-logout.e2e-spec.ts.
function build(options: { cookie?: string; revoke?: () => Promise<boolean> }) {
  const sessions = {
    revokeByRefreshToken: vi.fn(
      options.revoke ?? (() => Promise.resolve(true)),
    ),
  };
  const cookies = {
    read: vi.fn(() => options.cookie),
    set: vi.fn(),
    clear: vi.fn(),
  };
  const res = { setHeader: vi.fn() };
  const controller = new LogoutController(
    sessions as unknown as SessionService,
    cookies as unknown as RefreshCookieService,
  );
  return {
    controller,
    sessions,
    cookies,
    req: {} as Request,
    res: res as unknown as Response,
    headers: res.setHeader,
  };
}

describe('LogoutController', () => {
  it('LO-01 (DX-01) có cookie: thu hồi đúng một lần bằng đúng giá trị cookie, rồi xoá cookie đúng một lần, không đặt cookie, no-store, không trả gì', async () => {
    const { controller, sessions, cookies, req, res, headers } = build({
      cookie: 'token-cu',
    });

    const body = await controller.create(req, res);

    expect(body).toBeUndefined();
    expect(sessions.revokeByRefreshToken).toHaveBeenCalledExactlyOnceWith(
      'token-cu',
    );
    expect(cookies.clear).toHaveBeenCalledExactlyOnceWith(res);
    expect(cookies.set).not.toHaveBeenCalled();
    expect(headers).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('LO-02 (DX-06) không có cookie dùng được: KHÔNG gọi SessionService, không lỗi, vẫn xoá cookie và vẫn no-store', async () => {
    const { controller, sessions, cookies, req, res, headers } = build({});

    const body = await controller.create(req, res);

    expect(body).toBeUndefined();
    expect(sessions.revokeByRefreshToken).not.toHaveBeenCalled();
    expect(cookies.clear).toHaveBeenCalledExactlyOnceWith(res);
    expect(headers).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it.each([true, false])(
    'LO-03 (DX-04, DX-05) kết quả thu hồi %s (có thu hồi thật hay phiên đã chết, sai chữ ký): CÙNG một kết quả cho client, xoá cookie đúng một lần',
    async (revoked) => {
      const { controller, cookies, req, res } = build({
        cookie: 'token-cu',
        revoke: () => Promise.resolve(revoked),
      });

      expect(await controller.create(req, res)).toBeUndefined();
      expect(cookies.clear).toHaveBeenCalledExactlyOnceWith(res);
    },
  );

  it('LO-04 lỗi hệ thống của SessionService (DB): lỗi đi thẳng ra ngoài (không báo đăng xuất giả) và KHÔNG xoá cookie (phiên còn sống nên phải thử lại được)', async () => {
    const failure = new Error('mất kết nối DB');
    const { controller, cookies, req, res } = build({
      cookie: 'token-cu',
      revoke: () => Promise.reject(failure),
    });

    const error = await thrownBy(() => controller.create(req, res));

    expect(error).toBe(failure);
    expect(cookies.clear).not.toHaveBeenCalled();
    expect(cookies.set).not.toHaveBeenCalled();
  });

  it('LO-05 (DX-07) khai báo: POST auth/logout, 204, công khai (@Public), có OriginGuard ở cấp controller', () => {
    expect(Reflect.getMetadata(PATH_METADATA, LogoutController)).toBe(
      'auth/logout',
    );
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, LogoutController)).toBe(true);
    expect(Reflect.getMetadata(GUARDS_METADATA, LogoutController)).toEqual([
      OriginGuard,
    ]);
    const handler = Object.getOwnPropertyDescriptor(
      LogoutController.prototype,
      'create',
    )?.value as object;
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(204);
  });

  it('LO-06 thứ tự: cookie chỉ bị xoá SAU khi thu hồi xong (thu hồi còn treo thì chưa xoá), để lỗi DB không để lại lệnh xoá cookie', async () => {
    let finish: (revoked: boolean) => void = () => undefined;
    const pending = new Promise<boolean>((resolve) => {
      finish = resolve;
    });
    const { controller, cookies, req, res } = build({
      cookie: 'token-cu',
      revoke: () => pending,
    });

    const running = controller.create(req, res);
    await Promise.resolve();
    expect(cookies.clear).not.toHaveBeenCalled();

    finish(true);
    await running;
    expect(cookies.clear).toHaveBeenCalledTimes(1);
  });
});
