import { vi } from 'vitest';
import type { Response } from 'express';
import { AppException } from '../../common/errors/app.exception.js';
import type { RefreshCookieService } from '../session/refresh-cookie.service.js';
import { LoginController } from './login.controller.js';
import type { LoginService } from './login.service.js';

// Task A8 — controller chỉ nhận/trả: đặt cookie bằng RefreshCookieService, thân CHỈ có accessToken và vaiTro (DN-23), Cache-Control: no-store,
// và KHÔNG đặt cookie hay header ở nhánh lỗi. Mã LC-nn là [đề xuất]. Cờ cookie thật qua HTTP: test/auth-login.e2e-spec.ts.
const session = {
  sessionId: '55',
  accessToken: 'access-token-gia',
  accessTokenExpiresAt: new Date('2026-11-02T01:15:00.000Z'),
  refreshToken: 'refresh-token-gia',
  refreshTokenExpiresAt: new Date('2026-11-02T01:30:00.000Z'),
};

function build(login: () => Promise<unknown>) {
  const service = { login: vi.fn(login) };
  const cookies = { set: vi.fn() };
  const res = { setHeader: vi.fn() };
  const controller = new LoginController(
    service as unknown as LoginService,
    cookies as unknown as RefreshCookieService,
  );
  return {
    controller,
    service,
    cookies,
    res: res as unknown as Response,
    headers: res.setHeader,
  };
}

describe('LoginController', () => {
  it('LC-01 thành công: đặt cookie refresh với hạn không hoạt động của phiên, thân CHỈ có accessToken và vaiTro, Cache-Control: no-store', async () => {
    const { controller, service, cookies, res, headers } = build(() =>
      Promise.resolve({ vaiTro: 'BacSi', session }),
    );

    const body = await controller.create(
      { email: 'nguoi.dung@example.com', matKhau: 'Mat-Khau-Gia-1!' },
      res,
    );

    expect(body).toEqual({ accessToken: 'access-token-gia', vaiTro: 'BacSi' });
    expect(Object.keys(body)).toEqual(['accessToken', 'vaiTro']);
    expect(JSON.stringify(body)).not.toContain('refresh-token-gia');
    expect(cookies.set).toHaveBeenCalledTimes(1);
    expect(cookies.set).toHaveBeenCalledWith(
      res,
      'refresh-token-gia',
      session.refreshTokenExpiresAt,
    );
    expect(headers).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(service.login).toHaveBeenCalledWith({
      email: 'nguoi.dung@example.com',
      matKhau: 'Mat-Khau-Gia-1!',
    });
  });

  it('LC-02 lỗi: chuyển nguyên lỗi lên, KHÔNG đặt cookie, KHÔNG đặt header', async () => {
    const failure = new AppException(401, 'DANG_NHAP_SAI');
    const { controller, cookies, res, headers } = build(() =>
      Promise.reject(failure),
    );

    await expect(
      controller.create({ email: 'a@example.com', matKhau: 'x' }, res),
    ).rejects.toBe(failure);

    expect(cookies.set).not.toHaveBeenCalled();
    expect(headers).not.toHaveBeenCalled();
  });

  it('LC-03 DTO có thêm trường (khó xảy ra vì ValidationPipe đã chặn) cũng không lọt xuống dịch vụ: chỉ email và matKhau được chép', async () => {
    const { controller, service, res } = build(() =>
      Promise.resolve({ vaiTro: 'BenhNhan', session }),
    );
    const dto = {
      email: 'a@example.com',
      matKhau: 'x',
      loaiTaiKhoan: 'QuanTriVien',
    };

    await controller.create(dto, res);

    expect(service.login).toHaveBeenCalledWith({
      email: 'a@example.com',
      matKhau: 'x',
    });
  });
});
