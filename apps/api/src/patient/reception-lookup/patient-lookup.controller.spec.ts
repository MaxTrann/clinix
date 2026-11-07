import { RequestMethod } from '@nestjs/common';
import {
  METHOD_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
  HTTP_CODE_METADATA,
} from '@nestjs/common/constants.js';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum.js';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { vi } from 'vitest';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator.js';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator.js';
import { AppException } from '../../common/errors/app.exception.js';
import { PatientLookupController } from './patient-lookup.controller.js';
import {
  SearchPatientsQueryDto,
  type PatientLookupPage,
  type PatientLookupQuery,
} from './patient-lookup.dto.js';
import type { PatientLookupService } from './patient-lookup.service.js';

// Task B6 — controller chỉ nhận/trả: chuyển ĐÚNG bốn giá trị của query, chép nguyên kết quả dịch vụ, no-store trên MỌI nhánh, @Roles('LeTan') duy nhất.
// HTTP thật: test/patient-lookup.e2e-spec.ts. Mã ca PLC-nn là [đề xuất] (TRACKING patient B6-G).
// Cố ý KHÔNG khẳng định danh sách route đầy đủ của controller (bài học RLC-05 của B3: ca đó đỏ khi B5 thêm route); B7 sẽ thêm `:id` mà không sửa file này.
const page: PatientLookupPage = {
  items: [
    {
      taiKhoanId: '5',
      hoTen: 'Nguyễn Văn Thử',
      soDienThoai: '0901234567',
      email: 'thu@example.invalid',
      trangThai: 'DangHoatDong',
    },
  ],
  total: 1,
  page: 2,
  pageSize: 10,
};

const asQuery = (value: Partial<SearchPatientsQueryDto>) =>
  Object.assign(new SearchPatientsQueryDto(), value);

function build(
  search = vi.fn((_query: PatientLookupQuery) => Promise.resolve(page)),
  setHeader = vi.fn(),
) {
  return {
    controller: new PatientLookupController({
      search,
    } as unknown as PatientLookupService),
    search,
    setHeader,
    res: { setHeader } as unknown as Response,
  };
}

const searchHandler = Object.getOwnPropertyDescriptor(
  PatientLookupController.prototype,
  'search',
)?.value as () => unknown;

describe('PatientLookupController', () => {
  it('PLC-01 (QP-04, QP-08) route search là GET reception/patients, @Roles đúng MỘT vai trò LeTan (không BenhNhan, BacSi, QuanTriVien), không @Public, không @HttpCode', () => {
    const reflector = new Reflector();
    const targets = [searchHandler, PatientLookupController];

    expect(Reflect.getMetadata(PATH_METADATA, PatientLookupController)).toBe(
      'reception/patients',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, searchHandler)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, searchHandler)).toBe('/');
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, searchHandler)).toBe(
      undefined,
    );
    expect(reflector.getAllAndOverride(ROLES_KEY, targets)).toEqual(['LeTan']);
    expect(
      reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, targets),
    ).toBeUndefined();
  });

  it('PLC-02 (TC-10) chuyển ĐÚNG bốn giá trị { q, page, pageSize, offset } (offset là getter của DTO), không gì khác; trả nguyên kết quả của dịch vụ', async () => {
    const { controller, search, res } = build();
    const query = asQuery({ q: 'nguyen', page: 3, pageSize: 25 });

    await expect(controller.search(query, res)).resolves.toBe(page);

    expect(search).toHaveBeenCalledOnce();
    expect(search.mock.calls[0]).toStrictEqual([
      { q: 'nguyen', page: 3, pageSize: 25, offset: 50 },
    ]);
  });

  it('PLC-03 (TC-15) no-store được đặt TRƯỚC khi dịch vụ chạy: thành công có header, dịch vụ ném lỗi thì header vẫn đã có', async () => {
    const ok = build();
    await ok.controller.search(asQuery({ q: 'ab' }), ok.res);
    expect(ok.setHeader).toHaveBeenCalledOnce();
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

    await expect(controller.search(asQuery({ q: 'ab' }), res)).rejects.toBe(
      failure,
    );

    expect(headersWhenServiceRan).toBe(1);
    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('PLC-04 tham số handler: chỉ Query và Res (không Body, không Param, không CurrentUser: phạm vi toàn hệ thống); kiểu của Query là SearchPatientsQueryDto (import giá trị cho ValidationPipe)', () => {
    const kinds = Object.keys(
      Reflect.getMetadata(
        ROUTE_ARGS_METADATA,
        PatientLookupController,
        'search',
      ) as Record<string, unknown>,
    )
      .map((key) => key.split(':')[0])
      .sort();
    expect(kinds).toEqual(
      [String(RouteParamtypes.QUERY), String(RouteParamtypes.RESPONSE)].sort(),
    );

    // import type sẽ làm kiểu này thành Object và ValidationPipe bỏ qua việc kiểm
    const paramTypes = Reflect.getMetadata(
      'design:paramtypes',
      PatientLookupController.prototype,
      'search',
    ) as unknown[];
    expect(paramTypes[0]).toBe(SearchPatientsQueryDto);
  });

  it('PLC-05 AppException của dịch vụ đi nguyên (controller không bọc, không đổi mã)', async () => {
    const failure = new AppException(409, 'MA_LOI_GIA');
    const { controller, res } = build(vi.fn(() => Promise.reject(failure)));

    await expect(controller.search(asQuery({ q: 'ab' }), res)).rejects.toBe(
      failure,
    );
  });
});
