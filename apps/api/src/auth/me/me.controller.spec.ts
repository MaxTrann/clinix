import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { vi } from 'vitest';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { MeController } from './me.controller.js';
import type { MeResponse, MeService } from './me.service.js';

// Task A15 — controller chỉ nhận/trả: tài khoản từ `CurrentUser`, chép nguyên kết quả dịch vụ, no-store trên MỌI nhánh. HTTP thật: test/auth-me.e2e-spec.ts. Mã MEU-Cnn là [đề xuất].
// `user.role` cố ý KHÁC vaiTro của dịch vụ: qua HTTP cả hai đều đọc từ DB nên chỉ ở đây mới phân biệt được nguồn vai trò.
const user = { accountId: '5', sessionId: '12', role: 'BenhNhan' } as const;
const profile: MeResponse = {
  vaiTro: 'QuanTriVien',
  hoTen: 'Trần Thị B',
  daXacMinhEmail: false,
};

function build(getProfile = vi.fn((_id: string) => Promise.resolve(profile))) {
  const setHeader = vi.fn();
  return {
    controller: new MeController({ getProfile } as unknown as MeService),
    getProfile,
    setHeader,
    res: { setHeader } as unknown as Response,
  };
}

describe('MeController', () => {
  it('MEU-C01 lấy tài khoản từ token, trả nguyên kết quả dịch vụ (vaiTro theo hàng DB, không theo user.role)', async () => {
    const { controller, getProfile, res } = build();

    await expect(controller.me(user, res)).resolves.toStrictEqual(profile);

    expect(getProfile.mock.calls).toEqual([['5']]);
  });

  it('MEU-C02 phản hồi thành công có no-store', async () => {
    const { controller, setHeader, res } = build();

    await controller.me(user, res);

    expect(setHeader).toHaveBeenCalledExactlyOnceWith(
      'Cache-Control',
      'no-store',
    );
  });

  it('MEU-C03 dịch vụ báo 401 thì phản hồi lỗi vẫn có no-store', async () => {
    const failure = new UnauthorizedException('PHIEN_HET_HIEU_LUC');
    const { controller, setHeader, res } = build(
      vi.fn(() => Promise.reject(failure)),
    );

    await expect(controller.me(user, res)).rejects.toBe(failure);

    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('MEU-C04 route không gắn Public(): phải đăng nhập', () => {
    const handler = Object.getOwnPropertyDescriptor(
      MeController.prototype,
      'me',
    )?.value as () => unknown;

    expect(
      new Reflector().getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
        handler,
        MeController,
      ]),
    ).toBeUndefined();
  });
});
