import type { Response } from 'express';
import { vi } from 'vitest';
import { AppException } from '../../common/errors/app.exception.js';
import { ForgotPasswordController } from './forgot-password.controller.js';
import type { ForgotPasswordService } from './forgot-password.service.js';

// Task A11 — controller chỉ nhận/trả: cả hai route cấp mã đi vào CÙNG một hàm của dịch vụ, thân đúng khoá, `Cache-Control: no-store` CHỈ ở verify-otp
// thành công, không đặt header ở nhánh lỗi. Mã FC-nn là [đề xuất]. Trạng thái HTTP, `@Public()` và thân lỗi thật qua HTTP: test/auth-forgot-password.e2e-spec.ts.
const codeResult = {
  hetHanLuc: new Date('2026-11-02T01:10:00.000Z'),
  coTheGuiLaiLuc: new Date('2026-11-02T01:01:00.000Z'),
};
const tokenResult = {
  resetToken: 'reset-token-gia',
  hetHanLuc: new Date('2026-11-02T01:10:00.000Z'),
};

function build(
  overrides: {
    requestCode?: (email: string) => Promise<typeof codeResult>;
    verifyCode?: (email: string, otp: string) => Promise<typeof tokenResult>;
  } = {},
) {
  const service = {
    requestCode: vi.fn(
      overrides.requestCode ??
        ((_email: string) => Promise.resolve(codeResult)),
    ),
    verifyCode: vi.fn(
      overrides.verifyCode ??
        ((_email: string, _otp: string) => Promise.resolve(tokenResult)),
    ),
  };
  const res = { setHeader: vi.fn() };
  return {
    controller: new ForgotPasswordController(
      service as unknown as ForgotPasswordService,
    ),
    service,
    res: res as unknown as Response,
    headers: res.setHeader,
  };
}

describe('ForgotPasswordController', () => {
  it('FC-01 forgot-password và resend-otp gọi CÙNG `requestCode` với đúng email, trả nguyên kết quả, không đụng header', async () => {
    const { controller, service } = build();

    expect(await controller.requestCode({ email: 'a@example.com' })).toBe(
      codeResult,
    );
    expect(await controller.resendOtp({ email: 'b@example.com' })).toBe(
      codeResult,
    );

    expect(service.requestCode.mock.calls).toEqual([
      ['a@example.com'],
      ['b@example.com'],
    ]);
    expect(service.verifyCode).not.toHaveBeenCalled();
  });

  it('FC-02 verify-otp thành công: thân CHỈ có resetToken và hetHanLuc, Cache-Control: no-store', async () => {
    const { controller, service, res, headers } = build();

    const body = await controller.verifyOtp(
      { email: 'a@example.com', otp: '012345' },
      res,
    );

    expect(body).toEqual(tokenResult);
    expect(Object.keys(body).sort()).toEqual(['hetHanLuc', 'resetToken']);
    expect(headers).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(service.verifyCode).toHaveBeenCalledWith('a@example.com', '012345');
  });

  it('FC-03 verify-otp lỗi: chuyển nguyên lỗi lên và KHÔNG đặt header', async () => {
    const failure = new AppException(400, 'OTP_SAI');
    const { controller, res, headers } = build({
      verifyCode: vi.fn(() => Promise.reject(failure)),
    });

    await expect(
      controller.verifyOtp({ email: 'a@example.com', otp: '012345' }, res),
    ).rejects.toBe(failure);

    expect(headers).not.toHaveBeenCalled();
  });

  it('FC-04 lỗi của route cấp mã (404, 403, 429, 503) được chuyển nguyên lên', async () => {
    const failure = new AppException(404, 'EMAIL_CHUA_DANG_KY');
    const { controller } = build({
      requestCode: vi.fn(() => Promise.reject(failure)),
    });

    await expect(
      controller.requestCode({ email: 'a@example.com' }),
    ).rejects.toBe(failure);
    await expect(controller.resendOtp({ email: 'a@example.com' })).rejects.toBe(
      failure,
    );
  });

  it('FC-05 DTO có thêm trường (khó xảy ra vì ValidationPipe đã chặn) cũng không lọt xuống dịch vụ: chỉ email và otp được chép', async () => {
    const { controller, service, res } = build();

    await controller.verifyOtp(
      {
        email: 'a@example.com',
        otp: '012345',
        maXacThucId: '9',
      } as { email: string; otp: string },
      res,
    );
    await controller.requestCode({
      email: 'a@example.com',
      otp: '012345',
    } as { email: string });

    expect(service.verifyCode.mock.calls).toEqual([
      ['a@example.com', '012345'],
    ]);
    expect(service.requestCode.mock.calls).toEqual([['a@example.com']]);
  });
});
