import 'reflect-metadata';
import {
  HEADERS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants.js';
import { RequestMethod } from '@nestjs/common';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum.js';
import { Reflector } from '@nestjs/core';
import { vi } from 'vitest';
import type { AuthenticatedUser } from '../../../auth/decorators/current-user.decorator.js';
import { IS_PUBLIC_KEY } from '../../../auth/decorators/public.decorator.js';
import { ROLES_KEY } from '../../../auth/decorators/roles.decorator.js';
import { PatientExamRecordsController } from './patient-exam-records.controller.js';
import {
  PatientExamRecordsQueryDto,
  type PatientExamRecordsPage,
} from './patient-exam-records.dto.js';
import type { PatientExamRecordsService } from './patient-exam-records.service.js';

// doctor-exam B4 — PatientExamRecordsController: chỉ nhận/trả, không DB (PLAN 5.6, 5.11; XHS-11, XHS-12, QHK-01, QHK-03, QHK-09, QHK-12). Hành vi qua HTTP thật: test/doctor-exam-patient-records.e2e-spec.ts.
const USER: AuthenticatedUser = {
  accountId: '41',
  sessionId: 's1',
  role: 'BenhNhan',
};
const PAGE: PatientExamRecordsPage = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  demTheoThang: {},
  nguoiKham: [],
};

const handler = Reflect.get(PatientExamRecordsController.prototype, 'list') as (
  ...args: unknown[]
) => unknown;

function setup() {
  const list = vi.fn((..._args: unknown[]) => Promise.resolve(PAGE));
  const controller = new PatientExamRecordsController({
    list,
  } as unknown as PatientExamRecordsService);
  return { controller, list };
}

describe('PatientExamRecordsController: metadata của route', () => {
  it('QHK-09, XHS-11: GET patient/exam-records; @Roles("BenhNhan") ngay trên route, không @Public', () => {
    const reflector = new Reflector();
    expect(
      Reflect.getMetadata(PATH_METADATA, PatientExamRecordsController),
    ).toBe('patient/exam-records');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.GET,
    );
    expect(reflector.get<string[]>(ROLES_KEY, handler)).toStrictEqual([
      'BenhNhan',
    ]);
    expect(reflector.get<boolean>(IS_PUBLIC_KEY, handler)).toBeUndefined();
    expect(
      reflector.get<boolean>(IS_PUBLIC_KEY, PatientExamRecordsController),
    ).toBeUndefined();
  });

  it('200 mặc định của @Get (không @HttpCode): không lịch nào ⇒ 200 `items: []`, không 404', () => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBeUndefined();
  });

  it('QHK-12: Cache-Control: no-store khai bằng @Header (Nest áp sau guard và TRƯỚC pipe nên 400 do query cũng có)', () => {
    expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toEqual([
      { name: 'Cache-Control', value: 'no-store' },
    ]);
  });

  it('QHK-03: tham số là CurrentUser và MỘT Query là PatientExamRecordsQueryDto (import giá trị); KHÔNG Param, KHÔNG Body', () => {
    const args = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      PatientExamRecordsController,
      'list',
    ) as Record<string, unknown>;
    const keys = Object.keys(args);
    expect(keys).toHaveLength(2);
    const kinds = (type: RouteParamtypes) =>
      keys.filter((key) => key.startsWith(`${String(type)}:`));
    expect(kinds(RouteParamtypes.QUERY)).toHaveLength(1);
    expect(kinds(RouteParamtypes.PARAM)).toEqual([]);
    expect(kinds(RouteParamtypes.BODY)).toEqual([]);
    const paramTypes = Reflect.getMetadata(
      'design:paramtypes',
      PatientExamRecordsController.prototype,
      'list',
    ) as unknown[];
    expect(paramTypes).toContain(PatientExamRecordsQueryDto);
  });
});

describe('PatientExamRecordsController: hành vi', () => {
  it('QHK-03: Bệnh nhân CHỈ lấy từ người dùng đã xác thực; từng giá trị của query đi sang service (kể cả offset của DTO); trả đúng kết quả của service', async () => {
    const t = setup();
    const query = Object.assign(new PatientExamRecordsQueryDto(), {
      nguoiKham: 'BanThan',
      nam: 2026,
      thang: 11,
      page: 3,
      pageSize: 50,
    });
    await expect(t.controller.list(USER, query)).resolves.toBe(PAGE);
    expect(t.list).toHaveBeenCalledWith('41', {
      nguoiKham: 'BanThan',
      nam: 2026,
      thang: 11,
      page: 3,
      pageSize: 50,
      offset: 100,
    });
  });

  it('lỗi của service đi nguyên ra ngoài, controller không bắt', async () => {
    const t = setup();
    const failure = new Error('lỗi của service');
    t.list.mockRejectedValueOnce(failure);
    await expect(
      t.controller.list(USER, new PatientExamRecordsQueryDto()),
    ).rejects.toBe(failure);
  });
});
