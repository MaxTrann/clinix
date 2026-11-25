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
import type { AuthenticatedUser } from '../../auth/decorators/current-user.decorator.js';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator.js';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator.js';
import { ADMIN_SCOPE_KEY, type AdminScope } from '../../rbac/admin-scope.js';
import { AdminScopeGuard } from '../../rbac/guards/admin-scope.guard.js';
import { auditAdminControllers } from '../../rbac/testing/admin-route-audit.js';
import { findRouteRoleViolations } from '../testing/architecture-rules.js';
import { AdminRescheduleRequestsController } from './admin-reschedule-requests.controller.js';
import { ReceptionRescheduleRequestsController } from './reception-reschedule-requests.controller.js';
import {
  AdminRescheduleRequestsQueryDto,
  ReceptionRescheduleRequestsQueryDto,
  type RescheduleRequestPage,
} from './reschedule-request-list.dto.js';
import type { RescheduleRequestListService } from './reschedule-request-list.service.js';
import type { RescheduleRequestDetail } from './reschedule-request-list.types.js';

// reschedule B8 — hai controller chỉ nhận/trả (không DB): QDL-12 (`@Roles` trên TỪNG route, `@RequireAdminScope('Any')`, `Cache-Control: no-store`, không `@Public`, AR-02 qua `findRouteRoleViolations`),
// XDL-13 phần metadata, QDL-02 (`:yeuCauId` là chuỗi THÔ, không pipe: phạm vi giải trước ở service). Guard chạy thật ở e2e `booking-reschedule-requests.e2e-spec.ts`.
const SCOPE: AdminScope = { kind: 'ChiNhanh', chiNhanhId: '5' };
const USER = { accountId: '77' } as AuthenticatedUser;
const EMPTY_PAGE: RescheduleRequestPage = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
};
const DETAIL = { yeuCauId: '11' } as RescheduleRequestDetail;

function setup() {
  const listForReception = vi.fn((..._args: unknown[]) =>
    Promise.resolve(EMPTY_PAGE),
  );
  const detailForReception = vi.fn((..._args: unknown[]) =>
    Promise.resolve(DETAIL),
  );
  const list = vi.fn((..._args: unknown[]) => Promise.resolve(EMPTY_PAGE));
  const detail = vi.fn((..._args: unknown[]) => Promise.resolve(DETAIL));
  const service = {
    listForReception,
    detailForReception,
    list,
    detail,
  } as unknown as RescheduleRequestListService;
  return {
    reception: new ReceptionRescheduleRequestsController(service),
    admin: new AdminRescheduleRequestsController(service),
    listForReception,
    detailForReception,
    list,
    detail,
  };
}

const handlerOf = (controller: Function, name: 'list' | 'detail') =>
  Reflect.get(controller.prototype as object, name) as (
    ...args: unknown[]
  ) => unknown;

describe.each([
  [
    'reception',
    ReceptionRescheduleRequestsController,
    'reception/reschedule-requests',
    'LeTan',
  ],
  [
    'admin',
    AdminRescheduleRequestsController,
    'admin/reschedule-requests',
    'QuanTriVien',
  ],
] as const)(
  '%s: metadata của hai route đọc',
  (_name, controller, path, role) => {
    it.each([
      ['list', '/'],
      ['detail', ':yeuCauId'],
    ] as const)(
      'QDL-12 route %s: GET %s, @Roles đúng MỘT vai ghi TRÊN route, không @Public, no-store',
      (name, leaf) => {
        const handler = handlerOf(controller, name);
        const reflector = new Reflector();
        expect(Reflect.getMetadata(PATH_METADATA, controller)).toBe(path);
        expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(leaf);
        expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(0); // RequestMethod.GET
        // `get` (không `getAllAndOverride`): vai phải nằm trên chính route, không nhờ lớp
        expect(reflector.get<string[]>(ROLES_KEY, handler)).toStrictEqual([
          role,
        ]);
        expect(reflector.get<boolean | undefined>(IS_PUBLIC_KEY, handler)).toBe(
          undefined,
        );
        expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toStrictEqual([
          { name: 'Cache-Control', value: 'no-store' },
        ]);
      },
    );

    it('chỉ có HAI route (đọc): không route ghi nào lọt vào trước B9', () => {
      const routes = Object.getOwnPropertyNames(controller.prototype).filter(
        (key) =>
          key !== 'constructor' &&
          Reflect.getMetadata(
            METHOD_METADATA,
            Reflect.get(controller.prototype as object, key) as object,
          ) !== undefined,
      );
      expect(routes.sort()).toStrictEqual(['detail', 'list']);
    });

    it('QDL-12, AR-02 bộ quét route của booking (`findRouteRoleViolations`) không thấy route nào thiếu @Roles', () => {
      expect(findRouteRoleViolations([controller])).toStrictEqual([]);
    });

    it(':yeuCauId là chuỗi THÔ: không pipe nào trên tham số (phạm vi giải TRƯỚC khi phân tích id, QDL-02)', () => {
      const args = Reflect.getMetadata(
        ROUTE_ARGS_METADATA,
        controller,
        'detail',
      ) as Record<string, { data?: string; pipes?: unknown[] }>;
      const param = Object.values(args).find((arg) => arg.data === 'yeuCauId');
      expect(param).toBeDefined();
      expect(param?.pipes ?? []).toStrictEqual([]);
    });
  },
);

describe('XDL-13 route Quản trị viên: @RequireAdminScope("Any") và AdminScopeGuard NGAY TRÊN route', () => {
  it.each(['list', 'detail'] as const)('route %s', (name) => {
    const handler = handlerOf(AdminRescheduleRequestsController, name);
    const reflector = new Reflector();
    expect(reflector.get<string>(ADMIN_SCOPE_KEY, handler)).toBe('Any');
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toStrictEqual([
      AdminScopeGuard,
    ]);
  });

  it('bộ quét route admin của rbac (`auditAdminControllers`) không thấy route nào thiếu bảo vệ Admin', () => {
    expect(
      auditAdminControllers([AdminRescheduleRequestsController]),
    ).toStrictEqual([]);
  });

  it('phạm vi lấy bằng @AdminScopeCtx (tham số thứ nhất), không đọc từ query hay đường dẫn', () => {
    for (const name of ['list', 'detail']) {
      const args = Reflect.getMetadata(
        ROUTE_ARGS_METADATA,
        AdminRescheduleRequestsController,
        name,
      ) as Record<string, { index: number }>;
      expect(Object.values(args).map((arg) => arg.index)).toContain(0);
      expect(Object.keys(args)).toHaveLength(2);
    }
  });
});

describe('route Lễ tân: không RequireAdminScope, chi nhánh không có đường nào từ client', () => {
  it.each(['list', 'detail'] as const)(
    'route %s chỉ có @Roles("LeTan")',
    (name) => {
      const handler = handlerOf(ReceptionRescheduleRequestsController, name);
      const reflector = new Reflector();
      expect(reflector.get<string>(ADMIN_SCOPE_KEY, handler)).toBeUndefined();
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toBeUndefined();
    },
  );
});

describe('chuyển giá trị sang service', () => {
  it('Lễ tân: chuyển TƯỜNG MINH từng giá trị cùng accountId từ token (offset là getter của DTO); không có chiNhanhId', async () => {
    const { reception, listForReception } = setup();
    const query = Object.assign(new ReceptionRescheduleRequestsQueryDto(), {
      trangThai: ['DaDuyet', 'TuChoi'] as const,
      bacSiId: '31',
      q: 'CLX-20261110-ABCDE',
      page: 3,
      pageSize: 25,
    });
    const result = await reception.list(USER, query);
    expect(listForReception.mock.calls[0]).toStrictEqual([
      '77',
      {
        trangThai: ['DaDuyet', 'TuChoi'],
        bacSiId: '31',
        q: 'CLX-20261110-ABCDE',
        page: 3,
        pageSize: 25,
        offset: 50,
      },
    ]);
    expect(result).toBe(EMPTY_PAGE);
  });

  it('Quản trị viên: phạm vi từ guard đi nguyên vào service cùng chiNhanhId của query', async () => {
    const { admin, list } = setup();
    const query = Object.assign(new AdminRescheduleRequestsQueryDto(), {
      chiNhanhId: '4',
      page: 2,
    });
    const result = await admin.list(SCOPE, query);
    const [scope, passed] = list.mock.calls[0] ?? [];
    expect(scope).toBe(SCOPE);
    expect(passed).toMatchObject({ chiNhanhId: '4', page: 2, offset: 20 });
    expect(result).toBe(EMPTY_PAGE);
  });

  it('chi tiết: id THÔ đi nguyên (không chuẩn hoá, không ép số) vào service cùng phạm vi; kết quả trả nguyên', async () => {
    const { reception, admin, detailForReception, detail } = setup();
    expect(await reception.detail(USER, '9007199254740993')).toBe(DETAIL);
    expect(detailForReception.mock.calls[0]).toStrictEqual([
      '77',
      '9007199254740993',
    ]);
    expect(await admin.detail(SCOPE, 'abc')).toBe(DETAIL);
    expect(detail.mock.calls[0]).toStrictEqual([SCOPE, 'abc']);
  });

  it('lỗi của service (403 phạm vi, 404) lan ra nguyên vẹn, controller không bắt và không đổi', async () => {
    const { reception, admin, detailForReception, list } = setup();
    const error = new Error('lỗi giả');
    detailForReception.mockRejectedValueOnce(error);
    list.mockRejectedValueOnce(error);
    await expect(reception.detail(USER, '1')).rejects.toBe(error);
    await expect(
      admin.list(SCOPE, new AdminRescheduleRequestsQueryDto()),
    ).rejects.toBe(error);
  });
});
