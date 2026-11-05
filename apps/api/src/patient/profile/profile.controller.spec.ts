import { RequestMethod, UnauthorizedException } from '@nestjs/common';
import {
  CUSTOM_ROUTE_ARGS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants.js';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum.js';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { vi } from 'vitest';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator.js';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator.js';
import type { ProfileResponse } from './profile.dto.js';
import { ProfileController } from './profile.controller.js';
import type { ProfileService } from './profile.service.js';

// Task B1 — controller chỉ nhận/trả: tài khoản từ `CurrentUser`, chép nguyên kết quả dịch vụ, no-store trên MỌI nhánh. HTTP thật: test/patient-profile.e2e-spec.ts.
// Mã ca PFC-nn là [đề xuất] (TRACKING patient B1-G). `user.role` cố ý khác `profile.vaiTro` để chứng minh controller không rẽ nhánh theo vai trò của token.
const user = { accountId: '5', sessionId: '12', role: 'BenhNhan' } as const;
const profile: ProfileResponse = {
  hoTen: 'Trần Thị B',
  email: 'b@example.invalid',
  soDienThoai: '0901234567',
  gioiTinh: null,
  ngaySinh: null,
  diaChi: null,
  anhDaiDien: null,
  vaiTro: 'QuanTriVien',
  chiNhanh: null,
  phamViQuanTri: 'ToanHeThong',
};

function build(
  getProfile = vi.fn((_id: string) => Promise.resolve(profile)),
  setHeader = vi.fn(),
) {
  return {
    controller: new ProfileController({
      getProfile,
    } as unknown as ProfileService),
    getProfile,
    setHeader,
    res: { setHeader } as unknown as Response,
  };
}

const handler = () =>
  Object.getOwnPropertyDescriptor(ProfileController.prototype, 'get')
    ?.value as () => unknown;

describe('ProfileController', () => {
  it('PFC-01 (HS-01, QP-05) lấy tài khoản từ token, gọi dịch vụ đúng một lần, trả nguyên kết quả; không đọc query, param, body', async () => {
    const { controller, getProfile, res } = build();

    await expect(controller.get(user, res)).resolves.toStrictEqual(profile);

    expect(getProfile.mock.calls).toEqual([['5']]);
    // Tham số của handler chỉ có CurrentUser (decorator tuỳ biến) và Res: không @Query/@Param/@Body
    const args = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      ProfileController,
      'get',
    ) as Record<string, unknown>;
    const kinds = Object.keys(args)
      .map((key) =>
        key.includes(CUSTOM_ROUTE_ARGS_METADATA) ? 'custom' : key.split(':')[0],
      )
      .sort();
    expect(kinds).toEqual([String(RouteParamtypes.RESPONSE), 'custom'].sort());
  });

  it('PFC-02 phản hồi thành công có no-store', async () => {
    const { controller, setHeader, res } = build();

    await controller.get(user, res);

    expect(setHeader).toHaveBeenCalledExactlyOnceWith(
      'Cache-Control',
      'no-store',
    );
  });

  it('PFC-03 dịch vụ báo 401 thì lỗi đi nguyên, và no-store đã được đặt TRƯỚC lúc dịch vụ chạy', async () => {
    const failure = new UnauthorizedException('PHIEN_HET_HIEU_LUC');
    const setHeader = vi.fn();
    let headersWhenServiceRan = -1;
    const getProfile = vi.fn((_id: string): Promise<ProfileResponse> => {
      headersWhenServiceRan = setHeader.mock.calls.length;
      return Promise.reject(failure);
    });
    const { controller, res } = build(getProfile, setHeader);

    await expect(controller.get(user, res)).rejects.toBe(failure);

    expect(headersWhenServiceRan).toBe(1);
    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('PFC-04 (QP-02, QP-08) @Roles của route đúng bốn vai trò, không @Public', () => {
    const reflector = new Reflector();
    const targets = [handler(), ProfileController];

    expect(reflector.getAllAndOverride(ROLES_KEY, targets)).toEqual([
      'BenhNhan',
      'BacSi',
      'LeTan',
      'QuanTriVien',
    ]);
    expect(
      reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, targets),
    ).toBeUndefined();
  });

  it('PFC-05 route là GET profile', () => {
    expect(Reflect.getMetadata(PATH_METADATA, ProfileController)).toBe(
      'profile',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, handler())).toBe(
      RequestMethod.GET,
    );
  });
});
