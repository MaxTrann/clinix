import type { Response } from 'express';
import { vi } from 'vitest';
import { AppException } from '../../common/errors/app.exception.js';
import type { RefreshCookieService } from '../session/refresh-cookie.service.js';
import { ChangePasswordController } from './change-password.controller.js';
import type { ChangePasswordService } from './change-password.service.js';

// Task A13 — controller chỉ nhận/trả: tài khoản và phiên từ `CurrentUser`, chép đúng hai mật khẩu xuống dịch vụ, đặt cookie, no-store trên MỌI nhánh, lỗi không đặt cookie.
// Trạng thái HTTP, guard, cờ cookie thật: test/auth-change-password.e2e-spec.ts. Mã DMU-Cnn là [đề xuất].
const expiresAt = new Date('2026-11-02T01:30:00.000Z');
const rotated = {
  refreshToken: 'moi.moi.moi',
  refreshTokenExpiresAt: expiresAt,
};
const user = { accountId: '5', sessionId: '12', role: 'BenhNhan' } as const;
const body = {
  matKhauCu: 'Mat-Khau-Cu-7!',
  matKhauMoi: 'Mat-Khau-Moi-8!',
  xacNhan: 'Mat-Khau-Moi-8!',
};

function build(change = vi.fn((_input: unknown) => Promise.resolve(rotated))) {
  const set = vi.fn();
  const setHeader = vi.fn();
  return {
    controller: new ChangePasswordController(
      { change } as unknown as ChangePasswordService,
      { set } as unknown as RefreshCookieService,
    ),
    change,
    set,
    setHeader,
    res: { setHeader } as unknown as Response,
  };
}

describe('ChangePasswordController', () => {
  it('DMU-C01 tài khoản và phiên lấy từ access token, trường lạ trong thân không đi xuống; xacNhan dừng ở DTO; đặt cookie refresh mới; thân chỉ { daDoiMatKhau: true }', async () => {
    const { controller, change, set, setHeader, res } = build();

    const result = await controller.changePassword(
      user,
      { ...body, taiKhoanId: '9' } as typeof body,
      res,
    );

    expect(result).toEqual({ daDoiMatKhau: true });
    expect(change.mock.calls).toEqual([
      [
        {
          accountId: '5',
          sessionId: '12',
          matKhauCu: body.matKhauCu,
          matKhauMoi: body.matKhauMoi,
        },
      ],
    ]);
    expect(set).toHaveBeenCalledExactlyOnceWith(res, 'moi.moi.moi', expiresAt);
    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('DMU-C02 lỗi của dịch vụ được chuyển nguyên lên, KHÔNG đặt cookie, vẫn no-store', async () => {
    const failure = new AppException(400, 'MAT_KHAU_CU_SAI');
    const { controller, set, setHeader, res } = build(
      vi.fn(() => Promise.reject(failure)),
    );

    await expect(controller.changePassword(user, body, res)).rejects.toBe(
      failure,
    );

    expect(set).not.toHaveBeenCalled();
    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });
});
