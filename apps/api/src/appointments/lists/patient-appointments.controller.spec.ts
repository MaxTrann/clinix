import 'reflect-metadata';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants.js';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { vi } from 'vitest';
import type { AuthenticatedUser } from '../../auth/decorators/current-user.decorator.js';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator.js';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator.js';
import { PatientAppointmentsController } from './patient-appointments.controller.js';
import {
  PatientAppointmentsQueryDto,
  type PatientAppointmentsPage,
} from './patient-appointments.dto.js';
import type { PatientAppointmentsService } from './patient-appointments.service.js';

// Task B1 — PatientAppointmentsController: chỉ nhận/trả (không DB). Mã QB-nn, LSH-nn là [đề xuất] (TRACKING 3.13.4).
const USER: AuthenticatedUser = {
  accountId: '77',
  sessionId: 's1',
  role: 'BenhNhan',
};
const EMPTY_PAGE: PatientAppointmentsPage = {
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

function setup() {
  const calls: string[] = [];
  const headers = new Map<string, string>();
  const res = {
    setHeader: vi.fn((name: string, value: string) => {
      calls.push('setHeader');
      headers.set(name, value);
    }),
  } as unknown as Response;
  const list = vi.fn((..._args: unknown[]) => {
    calls.push('service');
    return Promise.resolve(EMPTY_PAGE);
  });
  const controller = new PatientAppointmentsController({
    list,
  } as unknown as PatientAppointmentsService);
  return { controller, list, res, calls, headers };
}

function queryOf(values: Partial<PatientAppointmentsQueryDto> = {}) {
  return Object.assign(new PatientAppointmentsQueryDto(), values);
}

describe('PatientAppointmentsController', () => {
  it('QB-07 route GET patient/appointments; @Roles("BenhNhan") DUY NHẤT ngay trên route, không @Public (AR-02)', () => {
    const handler = Reflect.get(
      PatientAppointmentsController.prototype,
      'list',
    ) as (...args: unknown[]) => unknown;
    const reflector = new Reflector();
    expect(
      Reflect.getMetadata(PATH_METADATA, PatientAppointmentsController),
    ).toBe('patient/appointments');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBeDefined();
    expect(reflector.get<string[]>(ROLES_KEY, handler)).toStrictEqual([
      'BenhNhan',
    ]);
    expect(reflector.get<boolean | undefined>(IS_PUBLIC_KEY, handler)).toBe(
      undefined,
    );
  });

  it('QB-08 Cache-Control: no-store được đặt TRƯỚC khi gọi service (nhánh lỗi sinh trong handler cũng có)', async () => {
    const { controller, res, calls, headers } = setup();
    await controller.list(USER, queryOf(), res);
    expect(headers.get('Cache-Control')).toBe('no-store');
    expect(calls).toStrictEqual(['setHeader', 'service']);

    const failing = setup();
    failing.list.mockImplementation(() => {
      failing.calls.push('service');
      return Promise.reject(new Error('lỗi giả'));
    });
    await expect(
      failing.controller.list(USER, queryOf(), failing.res),
    ).rejects.toThrow('lỗi giả');
    expect(failing.headers.get('Cache-Control')).toBe('no-store');
    expect(failing.calls).toStrictEqual(['setHeader', 'service']);
  });

  it('LSH-01 chủ sở hữu CHỈ lấy từ người dùng đã xác thực; query không có đường nào đổi nó', async () => {
    const { controller, list, res } = setup();
    // Dù đối tượng query bị gán thêm khoá lạ, service chỉ nhận đúng các giá trị được liệt kê
    const query = Object.assign(queryOf({ q: 'abc' }), {
      benhNhanId: '999',
    });
    await controller.list(USER, query, res);
    expect(list).toHaveBeenCalledTimes(1);
    expect(list.mock.calls[0]?.[0]).toBe('77');
    expect(JSON.stringify(list.mock.calls[0]?.[1])).not.toContain('999');
  });

  it('LSH-07 chuyển TƯỜNG MINH mười một giá trị, kể cả `offset` (getter của DTO) và kết quả trả nguyên', async () => {
    const { controller, list, res } = setup();
    const query = queryOf({
      trangThai: ['DaHuy'],
      nhom: 'LichSu',
      hoSoNguoiThanId: 'BanThan',
      bacSiId: '1',
      chuyenKhoaId: '2',
      tuNgay: '2026-11-01',
      denNgay: '2026-11-30',
      q: 'dang',
      page: 3,
      pageSize: 25,
    });
    const result = await controller.list(USER, query, res);
    expect(list.mock.calls[0]?.[1]).toStrictEqual({
      trangThai: ['DaHuy'],
      nhom: 'LichSu',
      hoSoNguoiThanId: 'BanThan',
      bacSiId: '1',
      chuyenKhoaId: '2',
      tuNgay: '2026-11-01',
      denNgay: '2026-11-30',
      q: 'dang',
      page: 3,
      pageSize: 25,
      offset: 50,
    });
    expect(result).toBe(EMPTY_PAGE);
  });
});
