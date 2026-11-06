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
import { ParseRelativeIdPipe } from './relative-id.pipe.js';
import { RelativesController } from './relatives.controller.js';
import { UpdateRelativeDto, type RelativeResponse } from './relatives.dto.js';
import type { NewRelative } from './relatives.repository.js';
import type { RelativesService } from './relatives.service.js';

// Task B4 — controller của PUT /patient/relatives/:id chỉ nhận/trả: chủ sở hữu từ `user.accountId`, id từ đường dẫn (đã qua pipe), chuyển ĐÚNG năm trường,
// chép nguyên kết quả dịch vụ, no-store trên MỌI nhánh, @Roles('BenhNhan') duy nhất. HTTP thật: test/patient-relatives-update.e2e-spec.ts.
// Mã ca RUC-nn là [đề xuất] (TRACKING patient B4-G). `user.role` cố ý khác 'BenhNhan' để chứng minh controller không đọc vai trò từ chỗ khác.
const user = { accountId: '5', sessionId: '12', role: 'QuanTriVien' } as const;
const input: NewRelative = {
  hoTen: 'Trần Thị Con',
  moiQuanHe: 'Con',
  gioiTinh: 'Nu',
  ngaySinh: '2018-03-04',
  soDienThoai: '0911000001',
};
const updated: RelativeResponse = {
  hoSoNguoiThanId: '77',
  ...input,
  trangThaiHieuLuc: true,
};

const asDto = (value: object) =>
  Object.assign(new UpdateRelativeDto(), value) as UpdateRelativeDto;

function build(
  update = vi.fn((_id: string, _rid: string, _input: NewRelative) =>
    Promise.resolve(updated),
  ),
  setHeader = vi.fn(),
) {
  return {
    controller: new RelativesController({
      update,
    } as unknown as RelativesService),
    update,
    setHeader,
    res: { setHeader } as unknown as Response,
  };
}

const handler = Object.getOwnPropertyDescriptor(
  RelativesController.prototype,
  'update',
)?.value as () => unknown;

describe('RelativesController.update (PUT :id)', () => {
  it('RUC-01 (NT-07, QP-06) chủ sở hữu từ user.accountId (cố ý để user.role khác); id là chuỗi truyền nguyên; dịch vụ gọi đúng một lần với đúng ba đối số và đúng năm trường; trả nguyên kết quả', async () => {
    const { controller, update, res } = build();
    // Thuộc tính thừa gán sau pipe (benhNhanId…) không bao giờ được chuyển cho dịch vụ
    const dto = asDto({
      ...input,
      benhNhanId: '999',
      trangThaiHieuLuc: false,
      diaChi: 'x',
    });

    const result = await controller.update(user, '9007199254740993', dto, res);

    expect(result).toBe(updated);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]).toStrictEqual([
      '5',
      '9007199254740993',
      input,
    ]);
  });

  it('RUC-01b (NT-04) soDienThoai undefined (thiếu khoá) hoặc null ⇒ dịch vụ nhận null (PUT thay cả bộ: xoá SĐT)', async () => {
    for (const soDienThoai of [undefined, null]) {
      const { controller, update, res } = build();

      await controller.update(
        user,
        '77',
        asDto({ ...input, soDienThoai }),
        res,
      );

      expect(update.mock.calls[0]?.[2]).toStrictEqual({
        ...input,
        soDienThoai: null,
      });
    }
  });

  it('RUC-02 no-store đặt TRƯỚC khi gọi service: ở nhánh thành công và cả khi service ném lỗi', async () => {
    const ok = build();
    await ok.controller.update(user, '77', asDto(input), ok.res);
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

    await expect(controller.update(user, '77', asDto(input), res)).rejects.toBe(
      failure,
    );

    expect(headersWhenServiceRan).toBe(1);
    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('RUC-03 (QP-03, QP-08) @Roles của update đúng MỘT vai trò BenhNhan (không BacSi, LeTan, QuanTriVien), không @Public', () => {
    const reflector = new Reflector();
    const targets = [handler, RelativesController];

    expect(reflector.getAllAndOverride(ROLES_KEY, targets)).toEqual([
      'BenhNhan',
    ]);
    expect(
      reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, targets),
    ).toBeUndefined();
  });

  it('RUC-04 route là PUT :id dưới patient/relatives; không @HttpCode (200 mặc định của @Put)', () => {
    expect(Reflect.getMetadata(PATH_METADATA, RelativesController)).toBe(
      'patient/relatives',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.PUT,
    );
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(':id');
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBeUndefined();
  });

  it('RUC-05 (QP-06, NT-08) tham số handler: CurrentUser, Param id (có ParseRelativeIdPipe), Body, Res; không Query; Body là UpdateRelativeDto (import giá trị)', () => {
    const args = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      RelativesController,
      'update',
    ) as Record<string, { data?: unknown; pipes?: unknown[] }>;

    const kinds = Object.keys(args)
      .map((key) =>
        key.includes(CUSTOM_ROUTE_ARGS_METADATA) ? 'custom' : key.split(':')[0],
      )
      .sort();
    expect(kinds).toEqual(
      [
        String(RouteParamtypes.PARAM),
        String(RouteParamtypes.BODY),
        String(RouteParamtypes.RESPONSE),
        'custom',
      ].sort(),
    );
    const param = Object.entries(args).find(([key]) =>
      key.startsWith(`${String(RouteParamtypes.PARAM)}:`),
    )?.[1];
    expect(param?.data).toBe('id');
    expect(param?.pipes).toEqual([ParseRelativeIdPipe]);
    // ValidationPipe chỉ kiểm được nếu kiểu tham số có mặt LÚC CHẠY: import type sẽ làm kiểu này thành Object
    const paramTypes = Reflect.getMetadata(
      'design:paramtypes',
      RelativesController.prototype,
      'update',
    ) as unknown[];
    expect(paramTypes[1]).toBe(String);
    expect(paramTypes[2]).toBe(UpdateRelativeDto);
  });
});
