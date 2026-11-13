import 'reflect-metadata';
import {
  GUARDS_METADATA,
  HEADERS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants.js';
import { Reflector } from '@nestjs/core';
import { vi } from 'vitest';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator.js';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator.js';
import { ADMIN_SCOPE_KEY, type AdminScope } from '../../rbac/admin-scope.js';
import { AdminScopeGuard } from '../../rbac/guards/admin-scope.guard.js';
import { auditAdminControllers } from '../../rbac/testing/admin-route-audit.js';
import { ParseAppointmentCodePipe } from '../appointment-code.pipe.js';
import type { AdminAppointmentDetail } from './admin-appointments.dto.js';
import { AdminAppointmentsController } from './admin-appointments.controller.js';
import type { AdminAppointmentsService } from './admin-appointments.service.js';
import {
  OperationsAppointmentsQueryDto,
  type OperationsAppointmentsPage,
} from './operations-appointments.dto.js';

// Task B4 — AdminAppointmentsController: chỉ nhận/trả (không DB). Mã ADL-nn là PLAN 7.39 `[đề xuất]`, QB-nn, DSV-nn là PLAN 7.9, 7.7. Chuẩn hoá `maLichHen` và thân 404: pipe (appointment-code.pipe.spec.ts)
// và e2e; guard chạy thật ở e2e (booking-admin-appointments.e2e-spec.ts).
const SCOPE: AdminScope = { kind: 'ChiNhanh', chiNhanhId: '5' };
const EMPTY_PAGE: OperationsAppointmentsPage = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
};
// Chỉ cần một đối tượng để kiểm "trả nguyên": controller không đọc nội dung
const DETAIL_RESULT = {
  maLichHen: 'CLX-20261110-7K3QD',
} as AdminAppointmentDetail;

function setup() {
  const list = vi.fn((..._args: unknown[]) => Promise.resolve(EMPTY_PAGE));
  const detail = vi.fn((..._args: unknown[]) => Promise.resolve(DETAIL_RESULT));
  const controller = new AdminAppointmentsController({
    list,
    detail,
  } as unknown as AdminAppointmentsService);
  return { controller, list, detail };
}

const queryOf = (values: Partial<OperationsAppointmentsQueryDto> = {}) =>
  Object.assign(new OperationsAppointmentsQueryDto(), values);
const handlerOf = (name: 'list' | 'detail') =>
  Reflect.get(AdminAppointmentsController.prototype, name) as (
    ...args: unknown[]
  ) => unknown;

describe.each([
  ['list', ''],
  ['detail', ':maLichHen'],
] as const)(
  'AdminAppointmentsController.%s: metadata của route',
  (name, path) => {
    const handler = handlerOf(name);

    it('ADL-06, QB-07 route GET admin/appointments; @Roles("QuanTriVien") DUY NHẤT, @RequireAdminScope("Any") và AdminScopeGuard ngay trên route, không @Public (AR-02)', () => {
      const reflector = new Reflector();
      expect(
        Reflect.getMetadata(PATH_METADATA, AdminAppointmentsController),
      ).toBe('admin/appointments');
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
        path === '' ? '/' : path,
      );
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBeDefined();
      expect(reflector.get<string[]>(ROLES_KEY, handler)).toStrictEqual([
        'QuanTriVien',
      ]);
      expect(reflector.get<string>(ADMIN_SCOPE_KEY, handler)).toBe('Any');
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toStrictEqual([
        AdminScopeGuard,
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

    it('phạm vi lấy bằng @AdminScopeCtx (tham số thứ nhất của route), không đọc từ query hay đường dẫn', () => {
      const args = Reflect.getMetadata(
        ROUTE_ARGS_METADATA,
        AdminAppointmentsController,
        name,
      ) as Record<string, { index: number; data?: unknown }>;
      const indexes = Object.values(args).map((arg) => arg.index);
      expect(indexes).toContain(0);
      expect(Object.keys(args)).toHaveLength(2);
    });
  },
);

describe('AdminAppointmentsController', () => {
  it('ADL-06 bộ quét route admin của rbac (`auditAdminControllers`) không thấy route nào thiếu bảo vệ Admin', () => {
    expect(auditAdminControllers([AdminAppointmentsController])).toStrictEqual(
      [],
    );
  });

  it('QB-09 tham số :maLichHen đi qua ParseAppointmentCodePipe (không dùng giá trị thô)', () => {
    const args = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      AdminAppointmentsController,
      'detail',
    ) as Record<string, { data?: string; pipes?: unknown[]; index: number }>;
    const param = Object.values(args).find((arg) => arg.data === 'maLichHen');
    expect(param?.pipes).toStrictEqual([ParseAppointmentCodePipe]);
  });

  it('DSV-02, DSV-03 phạm vi từ guard đi nguyên vào service cùng DTO của query (chính đối tượng đó, `offset` là getter nên không trải); kết quả trả nguyên', async () => {
    const { controller, list } = setup();
    const query = queryOf({ chiNhanhId: '4', page: 3, pageSize: 25 });
    const result = await controller.list(SCOPE, query);
    expect(list).toHaveBeenCalledTimes(1);
    const [passedScope, passedQuery] = list.mock.calls[0] ?? [];
    expect(passedScope).toBe(SCOPE);
    expect(passedQuery).toBe(query);
    expect(query.offset).toBe(50);
    expect(result).toBe(EMPTY_PAGE);
  });

  it('DSV-09 chi tiết: mã lịch đi nguyên vào service cùng phạm vi; kết quả trả nguyên', async () => {
    const { controller, detail } = setup();
    const result = await controller.detail(SCOPE, 'CLX-20261110-7K3QD');
    expect(detail.mock.calls[0]).toStrictEqual([SCOPE, 'CLX-20261110-7K3QD']);
    expect(result).toBe(DETAIL_RESULT);
  });

  it('QB-05 lỗi của service (403 phạm vi, 404) lan ra nguyên vẹn, controller không bắt và không đổi', async () => {
    const { controller, list, detail } = setup();
    const error = new Error('lỗi giả');
    list.mockRejectedValueOnce(error);
    detail.mockRejectedValueOnce(error);
    await expect(controller.list(SCOPE, queryOf())).rejects.toBe(error);
    await expect(controller.detail(SCOPE, 'CLX-20261110-7K3QD')).rejects.toBe(
      error,
    );
  });
});
