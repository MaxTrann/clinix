import 'reflect-metadata';
import {
  HEADERS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants.js';
import { Reflector } from '@nestjs/core';
import { vi } from 'vitest';
import type { AuthenticatedUser } from '../../auth/decorators/current-user.decorator.js';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator.js';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator.js';
import { ParseAppointmentCodePipe } from '../appointment-code.pipe.js';
import { DoctorAppointmentsController } from './doctor-appointments.controller.js';
import {
  DoctorAppointmentsQueryDto,
  type DoctorAppointmentDetail,
  type DoctorAppointmentsPage,
} from './doctor-appointments.dto.js';
import type { DoctorAppointmentsService } from './doctor-appointments.service.js';

// Task B5 — DoctorAppointmentsController: chỉ nhận/trả (không DB). Mã QB-nn, DSB-nn là PLAN 7.8, 7.9. Chuẩn hoá `maLichHen` và thân 404: pipe (appointment-code.pipe.spec.ts) và e2e.
const USER: AuthenticatedUser = {
  accountId: '77',
  sessionId: 's1',
  role: 'BacSi',
};
const EMPTY_PAGE: DoctorAppointmentsPage = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  demTheoTrangThai: {
    ChoThanhToan: 0,
    DaXacNhan: 0,
    DaTiepDon: 0,
    HoanThanh: 0,
    DaHuy: 0,
    VangMat: 0,
  },
};
// Chỉ cần một đối tượng để kiểm "trả nguyên": controller không đọc nội dung
const DETAIL_RESULT = {
  maLichHen: 'CLX-20261110-7K3QD',
} as DoctorAppointmentDetail;

function setup() {
  const list = vi.fn((..._args: unknown[]) => Promise.resolve(EMPTY_PAGE));
  const detail = vi.fn((..._args: unknown[]) => Promise.resolve(DETAIL_RESULT));
  const controller = new DoctorAppointmentsController({
    list,
    detail,
  } as unknown as DoctorAppointmentsService);
  return { controller, list, detail };
}

const queryOf = (values: Partial<DoctorAppointmentsQueryDto> = {}) =>
  Object.assign(new DoctorAppointmentsQueryDto(), values);
const handlerOf = (name: 'list' | 'detail') =>
  Reflect.get(DoctorAppointmentsController.prototype, name) as (
    ...args: unknown[]
  ) => unknown;

describe.each([
  ['list', ''],
  ['detail', ':maLichHen'],
] as const)(
  'DoctorAppointmentsController.%s: metadata của route',
  (name, path) => {
    const handler = handlerOf(name);

    it('QB-02, AR-02 route GET doctor/appointments; @Roles("BacSi") DUY NHẤT ngay trên route, không @Public', () => {
      const reflector = new Reflector();
      expect(
        Reflect.getMetadata(PATH_METADATA, DoctorAppointmentsController),
      ).toBe('doctor/appointments');
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
        path === '' ? '/' : path,
      );
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBeDefined();
      expect(reflector.get<string[]>(ROLES_KEY, handler)).toStrictEqual([
        'BacSi',
      ]);
      expect(reflector.get<boolean | undefined>(IS_PUBLIC_KEY, handler)).toBe(
        undefined,
      );
    });

    it('QB-08 Cache-Control: no-store khai bằng @Header (Nest áp sau guard và TRƯỚC pipe nên 404 của pipe và 400 của DTO cũng có)', () => {
      expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toStrictEqual([
        { name: 'Cache-Control', value: 'no-store' },
      ]);
    });
  },
);

describe('DoctorAppointmentsController', () => {
  it('QB-09 tham số :maLichHen đi qua ParseAppointmentCodePipe (không dùng giá trị thô)', () => {
    const args = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      DoctorAppointmentsController,
      'detail',
    ) as Record<string, { data?: string; pipes?: unknown[]; index: number }>;
    const param = Object.values(args).find((arg) => arg.data === 'maLichHen');
    expect(param?.pipes).toStrictEqual([ParseAppointmentCodePipe]);
  });

  it('DSB-01 bác sĩ CHỈ lấy từ người dùng đã xác thực; `bacSiId` của query (và khoá lạ gán thêm) KHÔNG tới service', async () => {
    const { controller, list } = setup();
    const query = Object.assign(queryOf({ q: 'abc', bacSiId: '999' }), {
      benhNhanId: '888',
    });
    await controller.list(USER, query);
    expect(list).toHaveBeenCalledTimes(1);
    expect(list.mock.calls[0]?.[0]).toBe('77');
    const forwarded = JSON.stringify(list.mock.calls[0]?.[1]);
    expect(forwarded).not.toContain('999');
    expect(forwarded).not.toContain('888');
    expect(list.mock.calls[0]?.[1]).not.toHaveProperty('bacSiId');
  });

  it('DSB-04 chuyển TƯỜNG MINH chín giá trị, kể cả `offset` (getter của DTO); kết quả trả nguyên', async () => {
    const { controller, list } = setup();
    const query = queryOf({
      trangThai: ['DaHuy'],
      ca: 'CaChieu',
      tuNgay: '2026-11-01',
      denNgay: '2026-11-30',
      q: 'dang',
      sapXep: 'CuNhat',
      page: 3,
      pageSize: 25,
    });
    const result = await controller.list(USER, query);
    expect(list.mock.calls[0]?.[1]).toStrictEqual({
      trangThai: ['DaHuy'],
      ca: 'CaChieu',
      tuNgay: '2026-11-01',
      denNgay: '2026-11-30',
      q: 'dang',
      sapXep: 'CuNhat',
      page: 3,
      pageSize: 25,
      offset: 50,
    });
    expect(result).toBe(EMPTY_PAGE);
  });

  it('DSB-07 chi tiết: mã lịch đi nguyên vào service cùng tài khoản; kết quả trả nguyên', async () => {
    const { controller, detail } = setup();
    const result = await controller.detail(USER, 'CLX-20261110-7K3QD');
    expect(detail.mock.calls[0]).toStrictEqual(['77', 'CLX-20261110-7K3QD']);
    expect(result).toBe(DETAIL_RESULT);
  });

  it('QB-06 lỗi của service (404) lan ra nguyên vẹn, controller không bắt và không đổi', async () => {
    const { controller, list, detail } = setup();
    const error = new Error('lỗi giả');
    list.mockRejectedValueOnce(error);
    detail.mockRejectedValueOnce(error);
    await expect(controller.list(USER, queryOf())).rejects.toBe(error);
    await expect(controller.detail(USER, 'CLX-20261110-7K3QD')).rejects.toBe(
      error,
    );
  });
});
