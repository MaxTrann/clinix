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
import {
  OperationsAppointmentsQueryDto,
  type OperationsAppointmentsPage,
  type ReceptionAppointmentDetail,
} from './operations-appointments.dto.js';
import { ReceptionAppointmentsController } from './reception-appointments.controller.js';
import type { ReceptionAppointmentsService } from './reception-appointments.service.js';

// Task B3 — ReceptionAppointmentsController: chỉ nhận/trả (không DB). Mã QB-nn, DSV-nn là PLAN 7.7, 7.9. Chuẩn hoá `maLichHen` và thân 404: pipe (appointment-code.pipe.spec.ts) và e2e.
const USER: AuthenticatedUser = {
  accountId: '77',
  sessionId: 's1',
  role: 'LeTan',
};
const EMPTY_PAGE: OperationsAppointmentsPage = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
};
// Chỉ cần một đối tượng để kiểm "trả nguyên": controller không đọc nội dung
const DETAIL_RESULT = {
  maLichHen: 'CLX-20261110-7K3QD',
} as ReceptionAppointmentDetail;

function setup() {
  const list = vi.fn((..._args: unknown[]) => Promise.resolve(EMPTY_PAGE));
  const detail = vi.fn((..._args: unknown[]) => Promise.resolve(DETAIL_RESULT));
  const controller = new ReceptionAppointmentsController({
    list,
    detail,
  } as unknown as ReceptionAppointmentsService);
  return { controller, list, detail };
}

const queryOf = (values: Partial<OperationsAppointmentsQueryDto> = {}) =>
  Object.assign(new OperationsAppointmentsQueryDto(), values);
const handlerOf = (name: 'list' | 'detail') =>
  Reflect.get(ReceptionAppointmentsController.prototype, name) as (
    ...args: unknown[]
  ) => unknown;

describe.each([
  ['list', ''],
  ['detail', ':maLichHen'],
] as const)(
  'ReceptionAppointmentsController.%s: metadata của route',
  (name, path) => {
    const handler = handlerOf(name);

    it('QB-07, QB-02 route GET reception/appointments; @Roles("LeTan") DUY NHẤT ngay trên route, không @Public (AR-02)', () => {
      const reflector = new Reflector();
      expect(
        Reflect.getMetadata(PATH_METADATA, ReceptionAppointmentsController),
      ).toBe('reception/appointments');
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
        path === '' ? '/' : path,
      );
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBeDefined();
      expect(reflector.get<string[]>(ROLES_KEY, handler)).toStrictEqual([
        'LeTan',
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

describe('ReceptionAppointmentsController', () => {
  it('QB-09 tham số :maLichHen đi qua ParseAppointmentCodePipe (không dùng giá trị thô)', () => {
    const args = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      ReceptionAppointmentsController,
      'detail',
    ) as Record<string, { data?: string; pipes?: unknown[]; index: number }>;
    const param = Object.values(args).find((arg) => arg.data === 'maLichHen');
    expect(param?.pipes).toStrictEqual([ParseAppointmentCodePipe]);
  });

  it('DSV-01 chủ thể CHỈ lấy từ người dùng đã xác thực; query không có đường nào đổi nó (khoá lạ gán thêm cũng không lọt vào service)', async () => {
    const { controller, list } = setup();
    const query = Object.assign(queryOf({ q: 'abc' }), { benhNhanId: '999' });
    await controller.list(USER, query);
    expect(list).toHaveBeenCalledTimes(1);
    expect(list.mock.calls[0]?.[0]).toBe('77');
    expect(JSON.stringify(list.mock.calls[0]?.[1])).not.toContain('999');
  });

  it('DSV-04 chuyển TƯỜNG MINH mười một giá trị, kể cả `offset` (getter của DTO) và `chiNhanhId` (để service quyết bỏ qua); kết quả trả nguyên', async () => {
    const { controller, list } = setup();
    const query = queryOf({
      trangThai: ['DaDoiLich'],
      chiNhanhId: '4',
      chuyenKhoaId: '2',
      bacSiId: '1',
      dichVuKhamId: '6',
      tuNgay: '2026-11-01',
      denNgay: '2026-11-30',
      q: 'dang',
      page: 3,
      pageSize: 25,
    });
    const result = await controller.list(USER, query);
    expect(list.mock.calls[0]?.[1]).toStrictEqual({
      trangThai: ['DaDoiLich'],
      chiNhanhId: '4',
      chuyenKhoaId: '2',
      bacSiId: '1',
      dichVuKhamId: '6',
      tuNgay: '2026-11-01',
      denNgay: '2026-11-30',
      q: 'dang',
      page: 3,
      pageSize: 25,
      offset: 50,
    });
    expect(result).toBe(EMPTY_PAGE);
  });

  it('DSV-09 chi tiết: mã lịch đi nguyên vào service cùng tài khoản; kết quả trả nguyên', async () => {
    const { controller, detail } = setup();
    const result = await controller.detail(USER, 'CLX-20261110-7K3QD');
    expect(detail.mock.calls[0]).toStrictEqual(['77', 'CLX-20261110-7K3QD']);
    expect(result).toBe(DETAIL_RESULT);
  });

  it('QB-04 lỗi của service (403 phạm vi, 404) lan ra nguyên vẹn, controller không bắt và không đổi', async () => {
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
