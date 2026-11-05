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
import { ProfileController } from './profile.controller.js';
import type { ProfileResponse } from './profile.dto.js';
import { UpdateProfileDto } from './profile.dto.js';
import type { ProfileChanges } from './profile.repository.js';
import type { ProfileService } from './profile.service.js';

// Task B2 — controller của PUT chỉ nhận/trả: tài khoản từ `user.accountId`, chuyển ĐÚNG năm trường, chép nguyên kết quả dịch vụ, no-store trên MỌI nhánh.
// HTTP thật: test/patient-profile-update.e2e-spec.ts. Mã ca PUC-nn là [đề xuất] (TRACKING patient B2-G). `user.role` cố ý khác `profile.vaiTro`.
const user = { accountId: '5', sessionId: '12', role: 'BenhNhan' } as const;
const body: ProfileChanges = {
  hoTen: 'Trần Thị B',
  soDienThoai: '0901234567',
  gioiTinh: 'Nu',
  ngaySinh: '1990-05-15',
  diaChi: null,
};
const saved: ProfileResponse = {
  ...body,
  email: 'b@example.invalid',
  anhDaiDien: null,
  vaiTro: 'QuanTriVien',
  chiNhanh: null,
  phamViQuanTri: 'ToanHeThong',
};

const asDto = (value: object) =>
  Object.assign(new UpdateProfileDto(), value) as UpdateProfileDto;

function build(
  updateProfile = vi.fn((_id: string, _changes: ProfileChanges) =>
    Promise.resolve(saved),
  ),
  setHeader = vi.fn(),
) {
  return {
    controller: new ProfileController({
      updateProfile,
    } as unknown as ProfileService),
    updateProfile,
    setHeader,
    res: { setHeader } as unknown as Response,
  };
}

const handler = () =>
  Object.getOwnPropertyDescriptor(ProfileController.prototype, 'update')
    ?.value as () => unknown;

describe('ProfileController.update (PUT)', () => {
  it('PUC-01 (HS-04, QP-05) tài khoản từ user.accountId; dịch vụ nhận ĐÚNG năm trường (thuộc tính thừa của DTO không lọt); trả nguyên kết quả', async () => {
    const { controller, updateProfile, res } = build();
    const dto = asDto({
      ...body,
      taiKhoanId: '999',
      email: 'khac@example.invalid',
      anhDaiDien: 'x',
    });

    await expect(controller.update(user, dto, res)).resolves.toStrictEqual(
      saved,
    );

    expect(updateProfile).toHaveBeenCalledOnce();
    expect(updateProfile.mock.calls[0]).toStrictEqual(['5', body]);
  });

  it('PUC-02 phản hồi thành công có no-store', async () => {
    const { controller, setHeader, res } = build();

    await controller.update(user, asDto(body), res);

    expect(setHeader).toHaveBeenCalledExactlyOnceWith(
      'Cache-Control',
      'no-store',
    );
  });

  it('PUC-03 dịch vụ báo 401 hoặc lỗi DB thì lỗi đi nguyên, và no-store đã được đặt TRƯỚC lúc dịch vụ chạy', async () => {
    for (const failure of [
      new UnauthorizedException('PHIEN_HET_HIEU_LUC'),
      new Error('mất kết nối'),
    ]) {
      const setHeader = vi.fn();
      let headersWhenServiceRan = -1;
      const updateProfile = vi.fn(
        (_id: string, _changes: ProfileChanges): Promise<ProfileResponse> => {
          headersWhenServiceRan = setHeader.mock.calls.length;
          return Promise.reject(failure);
        },
      );
      const { controller, res } = build(updateProfile, setHeader);

      await expect(controller.update(user, asDto(body), res)).rejects.toBe(
        failure,
      );

      expect(headersWhenServiceRan).toBe(1);
      expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    }
  });

  it('PUC-04 (QP-02, QP-08) @Roles của PUT đúng bốn vai trò, không @Public', () => {
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

  it('PUC-05 route là PUT profile; GET của B1 vẫn còn', () => {
    expect(Reflect.getMetadata(PATH_METADATA, ProfileController)).toBe(
      'profile',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, handler())).toBe(
      RequestMethod.PUT,
    );
    const get = Object.getOwnPropertyDescriptor(
      ProfileController.prototype,
      'get',
    )?.value as () => unknown;
    expect(Reflect.getMetadata(METHOD_METADATA, get)).toBe(RequestMethod.GET);
  });

  it('PUC-06 (QP-05) tham số handler chỉ có CurrentUser, Body, Res; Body là UpdateProfileDto (import giá trị); không Query, không Param', () => {
    const args = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      ProfileController,
      'update',
    ) as Record<string, unknown>;
    const kinds = Object.keys(args)
      .map((key) =>
        key.includes(CUSTOM_ROUTE_ARGS_METADATA) ? 'custom' : key.split(':')[0],
      )
      .sort();
    expect(kinds).toEqual(
      [
        String(RouteParamtypes.BODY),
        String(RouteParamtypes.RESPONSE),
        'custom',
      ].sort(),
    );
    // ValidationPipe chỉ kiểm được nếu kiểu tham số có mặt LÚC CHẠY: import type sẽ làm kiểu này thành Object
    const paramTypes = Reflect.getMetadata(
      'design:paramtypes',
      ProfileController.prototype,
      'update',
    ) as unknown[];
    expect(paramTypes[1]).toBe(UpdateProfileDto);
  });
});
