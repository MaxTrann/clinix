import { RequestMethod } from '@nestjs/common';
import {
  CUSTOM_ROUTE_ARGS_METADATA,
  HTTP_CODE_METADATA,
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
import { AppException } from '../../common/errors/app.exception.js';
import { ParseRelativeIdPipe } from './relative-id.pipe.js';
import { RelativesController } from './relatives.controller.js';
import type { DeactivateRelativeResponse } from './relatives.dto.js';
import type { RelativesService } from './relatives.service.js';

// Task B5 — controller của POST /patient/relatives/:id/deactivate chỉ nhận/trả: chủ sở hữu từ `user.accountId`, id từ đường dẫn (đã qua pipe), chép nguyên kết quả
// dịch vụ, no-store trên MỌI nhánh, @Roles('BenhNhan') duy nhất, @HttpCode(200), không @Body và không @Query. HTTP thật: test/patient-relatives-deactivate.e2e-spec.ts.
// Mã ca RDC-nn là [đề xuất] (TRACKING patient B5-G). `user.role` cố ý khác 'BenhNhan' để chứng minh controller không đọc vai trò từ chỗ khác.
const user = { accountId: '5', sessionId: '12', role: 'QuanTriVien' } as const;
const done: DeactivateRelativeResponse = { trangThaiHieuLuc: false };

function build(
  deactivate = vi.fn((_accountId: string, _id: string) =>
    Promise.resolve(done),
  ),
  setHeader = vi.fn(),
) {
  return {
    controller: new RelativesController({
      deactivate,
    } as unknown as RelativesService),
    deactivate,
    setHeader,
    res: { setHeader } as unknown as Response,
  };
}

const handler = Object.getOwnPropertyDescriptor(
  RelativesController.prototype,
  'deactivate',
)?.value as () => unknown;

describe('RelativesController.deactivate (POST :id/deactivate)', () => {
  it('RDC-01 (NT-10, QP-06) chủ sở hữu từ user.accountId (cố ý để user.role khác); id là chuỗi truyền nguyên; dịch vụ gọi đúng một lần với đúng hai đối số; trả nguyên kết quả', async () => {
    const { controller, deactivate, res } = build();

    const result = await controller.deactivate(user, '9007199254740993', res);

    expect(result).toBe(done);
    expect(deactivate).toHaveBeenCalledTimes(1);
    expect(deactivate.mock.calls[0]).toStrictEqual(['5', '9007199254740993']);
  });

  it('RDC-02 no-store đặt TRƯỚC khi gọi service: ở nhánh thành công và cả khi service ném lỗi', async () => {
    const ok = build();
    await ok.controller.deactivate(user, '77', ok.res);
    expect(ok.setHeader).toHaveBeenCalledTimes(1);
    expect(ok.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');

    const failure = new Error('mất kết nối');
    const setHeader = vi.fn();
    let headersWhenServiceRan = -1;
    const { controller, res } = build(
      vi.fn(() => {
        headersWhenServiceRan = setHeader.mock.calls.length;
        return Promise.reject(failure);
      }),
      setHeader,
    );

    await expect(controller.deactivate(user, '77', res)).rejects.toBe(failure);

    expect(headersWhenServiceRan).toBe(1);
    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('RDC-03 (QP-03, QP-08) @Roles của deactivate đúng MỘT vai trò BenhNhan (không BacSi, LeTan, QuanTriVien), không @Public', () => {
    const reflector = new Reflector();
    const targets = [handler, RelativesController];

    expect(reflector.getAllAndOverride(ROLES_KEY, targets)).toEqual([
      'BenhNhan',
    ]);
    expect(
      reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, targets),
    ).toBeUndefined();
  });

  it('RDC-04 route là POST :id/deactivate dưới patient/relatives, @HttpCode(200) (@Post mặc định là 201, đã đo)', () => {
    expect(Reflect.getMetadata(PATH_METADATA, RelativesController)).toBe(
      'patient/relatives',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(':id/deactivate');
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(200);
  });

  it('RDC-05 (QP-06, NT-08) tham số handler: CurrentUser, Param id (có ParseRelativeIdPipe), Res; KHÔNG Body, KHÔNG Query (thân và ?benhNhanId bị bỏ qua)', () => {
    const args = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      RelativesController,
      'deactivate',
    ) as Record<string, { data?: unknown; pipes?: unknown[] }>;

    const kinds = Object.keys(args)
      .map((key) =>
        key.includes(CUSTOM_ROUTE_ARGS_METADATA) ? 'custom' : key.split(':')[0],
      )
      .sort();
    expect(kinds).toEqual(
      [
        String(RouteParamtypes.PARAM),
        String(RouteParamtypes.RESPONSE),
        'custom',
      ].sort(),
    );
    const param = Object.entries(args).find(([key]) =>
      key.startsWith(`${String(RouteParamtypes.PARAM)}:`),
    )?.[1];
    expect(param?.data).toBe('id');
    expect(param?.pipes).toEqual([ParseRelativeIdPipe]);
  });

  it('RDC-06 (NT-08, NT-12) AppException 404 và 409 của dịch vụ đi nguyên tới người gọi (controller không bắt, không đổi)', async () => {
    const notFound = new AppException(404, 'KHONG_TIM_THAY');
    const conflict = new AppException(
      409,
      'HO_SO_NGUOI_THAN_DANG_CO_LICH_HEN',
      {
        chiTiet: [],
      },
    );
    for (const failure of [notFound, conflict]) {
      const { controller, res, setHeader } = build(
        vi.fn(() => Promise.reject(failure)),
      );

      await expect(controller.deactivate(user, '77', res)).rejects.toBe(
        failure,
      );
      expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    }
  });
});
