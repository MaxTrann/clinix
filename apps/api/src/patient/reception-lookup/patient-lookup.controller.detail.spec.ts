import { RequestMethod } from '@nestjs/common';
import {
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
import { ParseRelativeIdPipe } from '../relatives/relative-id.pipe.js';
import { PatientLookupController } from './patient-lookup.controller.js';
import type { PatientDetail } from './patient-lookup.dto.js';
import type { PatientLookupService } from './patient-lookup.service.js';

// Task B7 — controller của GET /reception/patients/:id chỉ nhận/trả: id từ đường dẫn (đã qua pipe), chép nguyên kết quả dịch vụ, no-store trên MỌI nhánh
// của handler, @Roles('LeTan') duy nhất. HTTP thật: test/patient-lookup-detail.e2e-spec.ts. Mã ca PDC-nn là [đề xuất] (TRACKING patient B7-G).
// File MỚI (không sửa patient-lookup.controller.spec.ts của B6, vốn không khẳng định danh sách route).
const detail: PatientDetail = {
  hoTen: 'Nguyễn Văn Thử',
  email: 'thu@example.invalid',
  soDienThoai: '0901234567',
  gioiTinh: 'Nam',
  ngaySinh: '1990-05-15',
  diaChi: null,
  thoiDiemTao: '2026-11-08T01:00:00.000Z',
  trangThai: 'DangHoatDong',
  soLanVangMat: 2,
  nguoiThan: [],
};

function build(
  getDetail = vi.fn((_id: string) => Promise.resolve(detail)),
  setHeader = vi.fn(),
) {
  return {
    controller: new PatientLookupController({
      getDetail,
    } as unknown as PatientLookupService),
    getDetail,
    setHeader,
    res: { setHeader } as unknown as Response,
  };
}

const detailHandler = Object.getOwnPropertyDescriptor(
  PatientLookupController.prototype,
  'detail',
)?.value as () => unknown;

describe('PatientLookupController.detail', () => {
  it('PDC-01 (QP-04, QP-08) route detail là GET :id của reception/patients, @Roles đúng MỘT vai trò LeTan (không BenhNhan, BacSi, QuanTriVien), không @Public, không @HttpCode', () => {
    const reflector = new Reflector();
    const targets = [detailHandler, PatientLookupController];

    expect(Reflect.getMetadata(PATH_METADATA, PatientLookupController)).toBe(
      'reception/patients',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, detailHandler)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, detailHandler)).toBe(':id');
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, detailHandler)).toBe(
      undefined,
    );
    expect(reflector.getAllAndOverride(ROLES_KEY, targets)).toEqual(['LeTan']);
    expect(
      reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, targets),
    ).toBeUndefined();
  });

  it('PDC-02 (TC-15) no-store được đặt TRƯỚC khi dịch vụ chạy: thành công có header, dịch vụ ném lỗi thì header vẫn đã có', async () => {
    const ok = build();
    await ok.controller.detail('5', ok.res);
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

    await expect(controller.detail('5', res)).rejects.toBe(failure);

    expect(headersWhenServiceRan).toBe(1);
    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('PDC-03 (Q27, QP-04) tham số handler: chỉ Param id (CÓ ParseRelativeIdPipe, sai dạng ⇒ 404 trước handler) và Res; không Query (query lạ bị bỏ qua), không Body, không CurrentUser (phạm vi toàn hệ thống)', () => {
    const args = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      PatientLookupController,
      'detail',
    ) as Record<string, { data?: unknown; pipes?: unknown[] }>;

    const kinds = Object.keys(args)
      .map((key) => key.split(':')[0])
      .sort();
    expect(kinds).toEqual(
      [String(RouteParamtypes.PARAM), String(RouteParamtypes.RESPONSE)].sort(),
    );
    const param = Object.entries(args).find(([key]) =>
      key.startsWith(`${String(RouteParamtypes.PARAM)}:`),
    )?.[1];
    expect(param?.data).toBe('id');
    expect(param?.pipes).toEqual([ParseRelativeIdPipe]);
  });

  it('PDC-04 (TC-11) chuyển đúng id (chuỗi, không đổi) cho getDetail, không gì khác, và trả nguyên kết quả của dịch vụ', async () => {
    const { controller, getDetail, res } = build();

    await expect(controller.detail('9007199254740993', res)).resolves.toBe(
      detail,
    );

    expect(getDetail).toHaveBeenCalledOnce();
    expect(getDetail.mock.calls[0]).toStrictEqual(['9007199254740993']);
  });

  it('PDC-05 (TC-12) AppException của dịch vụ đi nguyên (controller không bọc, không đổi mã)', async () => {
    const failure = new AppException(404, 'KHONG_TIM_THAY');
    const { controller, res } = build(vi.fn(() => Promise.reject(failure)));

    await expect(controller.detail('5', res)).rejects.toBe(failure);
  });
});
