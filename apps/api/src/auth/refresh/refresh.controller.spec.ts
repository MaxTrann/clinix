import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants.js';
import { RequestMethod } from '@nestjs/common';
import type { Request, Response } from 'express';
import { vi } from 'vitest';
import { AUTH_ERROR_CODES } from '../auth.constants.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { OriginGuard } from '../guards/origin.guard.js';
import type { RefreshCookieService } from '../session/refresh-cookie.service.js';
import type {
  RefreshFailureReason,
  RefreshResult,
  SessionService,
} from '../session/session.service.js';
import { expectHttpError, thrownBy } from '../testing/http-test-helpers.js';
import { RefreshController } from './refresh.controller.js';

// Task A9 — controller chỉ nhận/trả: đọc cookie, gọi SessionService.refresh, đặt cookie mới hoặc xoá cookie, thân CHỈ có accessToken, Cache-Control:
// no-store, và KHÔNG đụng cookie khi lỗi hệ thống. Mã RF-nn là [đề xuất]. Cờ cookie, Origin và DB thật qua HTTP: test/auth-refresh*.e2e-spec.ts.
const tokens = {
  sessionId: '55',
  accessToken: 'access-token-gia',
  accessTokenExpiresAt: new Date('2026-11-02T01:15:00.000Z'),
  refreshToken: 'refresh-token-moi-gia',
  refreshTokenExpiresAt: new Date('2026-11-02T01:30:00.000Z'),
};

function build(options: {
  cookie?: string;
  refresh?: () => Promise<RefreshResult>;
}) {
  const sessions = {
    refresh: vi.fn(
      options.refresh ??
        (() => Promise.resolve({ ok: true, accountId: '9', tokens })),
    ),
  };
  const cookies = {
    read: vi.fn(() => options.cookie),
    set: vi.fn(),
    clear: vi.fn(),
  };
  const res = { setHeader: vi.fn() };
  const req = {} as Request;
  const controller = new RefreshController(
    sessions as unknown as SessionService,
    cookies as unknown as RefreshCookieService,
  );
  return {
    controller,
    sessions,
    cookies,
    req,
    res: res as unknown as Response,
    headers: res.setHeader,
  };
}

const REASONS: RefreshFailureReason[] = [
  'INVALID_TOKEN',
  'SESSION_NOT_FOUND',
  'SESSION_REVOKED',
  'REUSE_DETECTED',
  'ABSOLUTE_EXPIRED',
  'IDLE_EXPIRED',
  'ACCOUNT_INACTIVE',
];

describe('RefreshController', () => {
  it('RF-01 (DN-27) thành công: đặt cookie với refresh token mới và hạn không hoạt động mới, thân CHỈ có accessToken, Cache-Control: no-store, không xoá cookie', async () => {
    const { controller, sessions, cookies, req, res, headers } = build({
      cookie: 'token-cu',
    });

    const body = await controller.create(req, res);

    expect(body).toEqual({ accessToken: 'access-token-gia' });
    expect(Object.keys(body)).toEqual(['accessToken']);
    expect(JSON.stringify(body)).not.toContain('refresh-token-moi-gia');
    expect(sessions.refresh).toHaveBeenCalledExactlyOnceWith('token-cu');
    expect(cookies.set).toHaveBeenCalledExactlyOnceWith(
      res,
      'refresh-token-moi-gia',
      tokens.refreshTokenExpiresAt,
    );
    expect(cookies.clear).not.toHaveBeenCalled();
    expect(headers).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('RF-02 không có cookie dùng được: 401 CHUA_DANG_NHAP, không gọi SessionService, không đặt hay xoá cookie, vẫn no-store', async () => {
    const { controller, sessions, cookies, req, res, headers } = build({});

    const error = await thrownBy(() => controller.create(req, res));

    expectHttpError(error, 401, AUTH_ERROR_CODES.NOT_LOGGED_IN);
    expect(sessions.refresh).not.toHaveBeenCalled();
    expect(cookies.set).not.toHaveBeenCalled();
    expect(cookies.clear).not.toHaveBeenCalled();
    expect(headers).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it.each(REASONS)(
    'RF-03 (DN-28, DN-30, DN-31) lý do %s: CÙNG một lỗi 401 PHIEN_HET_HIEU_LUC, xoá cookie đúng một lần, không đặt cookie, vẫn no-store',
    async (reason) => {
      const { controller, cookies, req, res, headers } = build({
        cookie: 'token-cu',
        refresh: () => Promise.resolve({ ok: false, reason }),
      });

      const error = await thrownBy(() => controller.create(req, res));

      expectHttpError(error, 401, AUTH_ERROR_CODES.SESSION_INACTIVE);
      expect(cookies.clear).toHaveBeenCalledExactlyOnceWith(res);
      expect(cookies.set).not.toHaveBeenCalled();
      expect(headers).toHaveBeenCalledWith('Cache-Control', 'no-store');
    },
  );

  it('RF-04 lỗi hệ thống của SessionService (DB): lỗi đi thẳng ra ngoài, KHÔNG đặt và KHÔNG xoá cookie (giao dịch đã hoàn tác nên token cũ vẫn dùng được)', async () => {
    const failure = new Error('mất kết nối DB');
    const { controller, cookies, req, res } = build({
      cookie: 'token-cu',
      refresh: () => Promise.reject(failure),
    });

    const error = await thrownBy(() => controller.create(req, res));

    expect(error).toBe(failure);
    expect(cookies.set).not.toHaveBeenCalled();
    expect(cookies.clear).not.toHaveBeenCalled();
  });

  it('RF-05 (DN-34) khai báo: POST auth/refresh, 200, công khai (@Public), có OriginGuard ở cấp controller', () => {
    expect(Reflect.getMetadata(PATH_METADATA, RefreshController)).toBe(
      'auth/refresh',
    );
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, RefreshController)).toBe(true);
    expect(Reflect.getMetadata(GUARDS_METADATA, RefreshController)).toEqual([
      OriginGuard,
    ]);
    const handler = Object.getOwnPropertyDescriptor(
      RefreshController.prototype,
      'create',
    )?.value as object;
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(200);
  });
});
