import { vi } from 'vitest';
import { AppException } from '../../common/errors/app.exception.js';
import { ResetPasswordController } from './reset-password.controller.js';
import type { ResetPasswordService } from './reset-password.service.js';

// Task A12 — controller chỉ nhận/trả: chép đúng hai trường xuống dịch vụ (xacNhan không đi xa hơn DTO), trả nguyên hai cờ, chuyển nguyên lỗi.
// Trạng thái HTTP 200, `@Public()`, không `no-store`, thân lỗi thật: test/auth-reset-password.e2e-spec.ts. Mã MKU-Cnn là [đề xuất].
const flags = { taiKhoanNgung: false, canDangKyLai: true };
const body = {
  resetToken: 'a.b.c',
  matKhauMoi: 'Mat-Khau-Moi-8!',
  xacNhan: 'Mat-Khau-Moi-8!',
};

function build(reset = vi.fn((_input: unknown) => Promise.resolve(flags))) {
  return {
    controller: new ResetPasswordController({
      reset,
    } as unknown as ResetPasswordService),
    reset,
  };
}

describe('ResetPasswordController', () => {
  it('MKU-C01 gọi dịch vụ với đúng { resetToken, matKhauMoi } (không có xacNhan hay trường thừa), trả nguyên hai cờ', async () => {
    const { controller, reset } = build();

    const result = await controller.resetPassword({
      ...body,
      taiKhoanId: '9',
    } as typeof body);

    expect(result).toBe(flags);
    expect(reset.mock.calls).toEqual([
      [{ resetToken: 'a.b.c', matKhauMoi: 'Mat-Khau-Moi-8!' }],
    ]);
  });

  it('MKU-C02 lỗi của dịch vụ được chuyển nguyên lên', async () => {
    const failure = new AppException(403, 'RESET_TOKEN_HET_HIEU_LUC');
    const { controller } = build(vi.fn(() => Promise.reject(failure)));

    await expect(controller.resetPassword(body)).rejects.toBe(failure);
  });
});
