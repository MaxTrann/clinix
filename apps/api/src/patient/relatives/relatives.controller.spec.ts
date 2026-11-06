import { RequestMethod } from '@nestjs/common';
import {
  CUSTOM_ROUTE_ARGS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants.js';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum.js';
import { MetadataScanner, Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { vi } from 'vitest';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator.js';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator.js';
import { RelativesController } from './relatives.controller.js';
import {
  CreateRelativeDto,
  type RelativeResponse,
  type RelativesListResponse,
} from './relatives.dto.js';
import type { NewRelative } from './relatives.repository.js';
import type { RelativesService } from './relatives.service.js';

// Task B3 — controller chỉ nhận/trả: chủ sở hữu từ `user.accountId`, chuyển ĐÚNG năm trường, chép nguyên kết quả dịch vụ, no-store trên MỌI nhánh,
// @Roles('BenhNhan') duy nhất. HTTP thật: test/patient-relatives.e2e-spec.ts. Mã ca RLC-nn là [đề xuất] (TRACKING patient B3-G).
// `user.role` cố ý khác 'BenhNhan' ở ca dùng nó để chứng minh controller không đọc vai trò từ chỗ khác.
const user = { accountId: '5', sessionId: '12', role: 'BenhNhan' } as const;
const input: NewRelative = {
  hoTen: 'Trần Thị Con',
  moiQuanHe: 'Con',
  gioiTinh: 'Nu',
  ngaySinh: '2018-03-04',
  soDienThoai: null,
};
const created: RelativeResponse = {
  hoSoNguoiThanId: '77',
  ...input,
  trangThaiHieuLuc: true,
};
const listed: RelativesListResponse = { items: [created] };

const asDto = (value: object) =>
  Object.assign(new CreateRelativeDto(), value) as CreateRelativeDto;

function build(
  list = vi.fn((_id: string) => Promise.resolve(listed)),
  create = vi.fn((_id: string, _input: NewRelative) =>
    Promise.resolve(created),
  ),
  setHeader = vi.fn(),
) {
  return {
    controller: new RelativesController({
      list,
      create,
    } as unknown as RelativesService),
    list,
    create,
    setHeader,
    res: { setHeader } as unknown as Response,
  };
}

const handlerOf = (name: 'list' | 'create') =>
  Object.getOwnPropertyDescriptor(RelativesController.prototype, name)
    ?.value as () => unknown;

describe('RelativesController', () => {
  it('RLC-01 (NT-06, QP-06) list: chủ sở hữu từ user.accountId (cố ý để user.role khác); dịch vụ gọi đúng một lần với đúng một đối số; trả nguyên kết quả', async () => {
    const { controller, list, res } = build();

    await expect(
      controller.list({ ...user, role: 'QuanTriVien' }, res),
    ).resolves.toStrictEqual(listed);

    expect(list).toHaveBeenCalledOnce();
    expect(list.mock.calls[0]).toStrictEqual(['5']);
  });

  it('RLC-02 (NT-01, QP-06) create: chủ sở hữu từ user.accountId; dịch vụ nhận ĐÚNG năm trường (thuộc tính thừa của DTO không lọt); soDienThoai thiếu khoá (undefined) ⇒ null; trả nguyên kết quả', async () => {
    const { controller, create, res } = build();
    const dto = asDto({
      hoTen: input.hoTen,
      moiQuanHe: input.moiQuanHe,
      gioiTinh: input.gioiTinh,
      ngaySinh: input.ngaySinh,
      // cố ý không có soDienThoai; các thuộc tính dưới đây không được tới dịch vụ
      benhNhanId: '999',
      diaChi: 'Địa chỉ nhét thêm',
      trangThaiHieuLuc: false,
    });

    await expect(controller.create(user, dto, res)).resolves.toStrictEqual(
      created,
    );

    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0]).toStrictEqual(['5', input]);
  });

  it('RLC-02b create: soDienThoai có giá trị được chuyển nguyên', async () => {
    const { controller, create, res } = build();

    await controller.create(
      user,
      asDto({ ...input, soDienThoai: '0901234567' }),
      res,
    );

    expect(create.mock.calls[0]).toStrictEqual([
      '5',
      { ...input, soDienThoai: '0901234567' },
    ]);
  });

  it('RLC-03 no-store được đặt TRƯỚC khi dịch vụ chạy ở cả hai route: thành công có header, dịch vụ ném lỗi thì header vẫn đã có', async () => {
    const ok = build();
    await ok.controller.list(user, ok.res);
    await ok.controller.create(user, asDto(input), ok.res);
    expect(ok.setHeader).toHaveBeenCalledTimes(2);
    expect(ok.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');

    for (const route of ['list', 'create'] as const) {
      const failure = new Error('mất kết nối');
      const setHeader = vi.fn();
      let headersWhenServiceRan = -1;
      const rejects = () => {
        headersWhenServiceRan = setHeader.mock.calls.length;
        return Promise.reject(failure);
      };
      const { controller, res } = build(
        vi.fn(rejects),
        vi.fn(rejects),
        setHeader,
      );

      const call =
        route === 'list'
          ? controller.list(user, res)
          : controller.create(user, asDto(input), res);
      await expect(call).rejects.toBe(failure);

      expect(headersWhenServiceRan).toBe(1);
      expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    }
  });

  it('RLC-04 (QP-03, QP-08) @Roles của list và create đúng MỘT vai trò BenhNhan (không BacSi, LeTan, QuanTriVien), không @Public', () => {
    const reflector = new Reflector();
    for (const route of ['list', 'create'] as const) {
      const targets = [handlerOf(route), RelativesController];

      expect(reflector.getAllAndOverride(ROLES_KEY, targets)).toEqual([
        'BenhNhan',
      ]);
      expect(
        reflector.getAllAndOverride<boolean | undefined>(
          IS_PUBLIC_KEY,
          targets,
        ),
      ).toBeUndefined();
    }
  });

  it('RLC-05 route là GET patient/relatives và POST patient/relatives (POST không @HttpCode ⇒ 201 mặc định) và PUT :id (B4); controller không có route nào khác (B5 chưa làm)', () => {
    expect(Reflect.getMetadata(PATH_METADATA, RelativesController)).toBe(
      'patient/relatives',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, handlerOf('list'))).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(METHOD_METADATA, handlerOf('create'))).toBe(
      RequestMethod.POST,
    );
    expect(
      Reflect.getMetadata(HTTP_CODE_METADATA, handlerOf('create')),
    ).toBeUndefined();
    // B4: PUT :id (chi tiết ở relatives.controller.update.spec.ts)
    const updateHandler = Object.getOwnPropertyDescriptor(
      RelativesController.prototype,
      'update',
    )?.value as () => unknown;
    expect(Reflect.getMetadata(METHOD_METADATA, updateHandler)).toBe(
      RequestMethod.PUT,
    );
    expect(Reflect.getMetadata(PATH_METADATA, updateHandler)).toBe(':id');

    const routes = new MetadataScanner()
      .getAllMethodNames(RelativesController.prototype)
      .filter(
        (name) =>
          Reflect.getMetadata(
            METHOD_METADATA,
            (
              RelativesController.prototype as unknown as Record<string, object>
            )[name],
          ) !== undefined,
      );
    expect(routes.sort()).toEqual(['create', 'list', 'update']);
  });

  it('RLC-06 (QP-06) tham số handler: list chỉ CurrentUser và Res; create chỉ CurrentUser, Body và Res; Body là CreateRelativeDto (import giá trị); không Query, không Param', () => {
    const kindsOf = (name: string) =>
      Object.keys(
        Reflect.getMetadata(
          ROUTE_ARGS_METADATA,
          RelativesController,
          name,
        ) as Record<string, unknown>,
      )
        .map((key) =>
          key.includes(CUSTOM_ROUTE_ARGS_METADATA)
            ? 'custom'
            : key.split(':')[0],
        )
        .sort();

    expect(kindsOf('list')).toEqual(
      [String(RouteParamtypes.RESPONSE), 'custom'].sort(),
    );
    expect(kindsOf('create')).toEqual(
      [
        String(RouteParamtypes.BODY),
        String(RouteParamtypes.RESPONSE),
        'custom',
      ].sort(),
    );
    // ValidationPipe chỉ kiểm được nếu kiểu tham số có mặt LÚC CHẠY: import type sẽ làm kiểu này thành Object
    const paramTypes = Reflect.getMetadata(
      'design:paramtypes',
      RelativesController.prototype,
      'create',
    ) as unknown[];
    expect(paramTypes[1]).toBe(CreateRelativeDto);
  });
});
