import 'reflect-metadata';
import {
  GUARDS_METADATA,
  HEADERS_METADATA,
  HTTP_CODE_METADATA,
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
import type { RescheduleRequestApproveService } from './reschedule-request-approve.service.js';
import {
  ApproveRescheduleRequestDto,
  RejectRescheduleRequestDto,
} from './reschedule-request-handle.dto.js';
import type { RescheduleRequestListService } from './reschedule-request-list.service.js';
import type { RescheduleRequestRejectService } from './reschedule-request-reject.service.js';

// reschedule B9 — QDL-14 (metadata của BỐN route ghi mới: POST, `@HttpCode(200)`, `@Roles` đúng một vai TRÊN route, `@RequireAdminScope('Any')` và guard cho Quản trị viên, `no-store`, không `@Public`, AR-02), XDL-13 phần
// metadata và phần chuyển giá trị (tường minh từng trường, khoá lạ trên DTO không đi tiếp, phạm vi và người xử lý đúng nguồn). Không DB. Guard chạy thật ở e2e `booking-reschedule-request-handle-roles.e2e-spec.ts`.
const SCOPE: AdminScope = { kind: 'ChiNhanh', chiNhanhId: '5' };
const USER = { accountId: '77' } as AuthenticatedUser;
const APPROVED = { yeuCau: { trangThai: 'DaDuyet' } };
const REJECTED = { yeuCau: { trangThai: 'TuChoi' } };

function setup() {
  const approveAsReception = vi.fn((..._args: unknown[]) =>
    Promise.resolve(APPROVED),
  );
  const approveAsAdmin = vi.fn((..._args: unknown[]) =>
    Promise.resolve(APPROVED),
  );
  const rejectAsReception = vi.fn((..._args: unknown[]) =>
    Promise.resolve(REJECTED),
  );
  const rejectAsAdmin = vi.fn((..._args: unknown[]) =>
    Promise.resolve(REJECTED),
  );
  const approve = {
    approveAsReception,
    approveAsAdmin,
  } as unknown as RescheduleRequestApproveService;
  const reject = {
    rejectAsReception,
    rejectAsAdmin,
  } as unknown as RescheduleRequestRejectService;
  const list = {} as unknown as RescheduleRequestListService;
  return {
    reception: new ReceptionRescheduleRequestsController(list, approve, reject),
    admin: new AdminRescheduleRequestsController(list, approve, reject),
    approveAsReception,
    approveAsAdmin,
    rejectAsReception,
    rejectAsAdmin,
  };
}

const handlerOf = (controller: Function, name: 'approve' | 'reject') =>
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
  '%s: metadata của hai route ghi (B9)',
  (_name, controller, path, role) => {
    it.each([
      ['approve', ':yeuCauId/approve', ApproveRescheduleRequestDto],
      ['reject', ':yeuCauId/reject', RejectRescheduleRequestDto],
    ] as const)(
      'QDL-14 route %s: POST %s, HTTP 200, @Roles đúng MỘT vai ghi TRÊN route, không @Public, no-store, thân là DTO của B9',
      (name, leaf, dto) => {
        const handler = handlerOf(controller, name);
        const reflector = new Reflector();
        expect(Reflect.getMetadata(PATH_METADATA, controller)).toBe(path);
        expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(leaf);
        expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(1); // RequestMethod.POST
        // `@Post` mặc định 201, hợp đồng là 200
        expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(200);
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
        const paramTypes = Reflect.getMetadata(
          'design:paramtypes',
          controller.prototype,
          name,
        ) as unknown[];
        expect(paramTypes).toContain(dto);
      },
    );

    it('QDL-14, AR-02 bộ quét route của booking (`findRouteRoleViolations`) không thấy route nào thiếu @Roles (cả bốn route của lớp)', () => {
      expect(findRouteRoleViolations([controller])).toStrictEqual([]);
    });

    it.each(['approve', 'reject'] as const)(
      ':yeuCauId của %s là chuỗi THÔ: không pipe nào trên tham số (phạm vi giải TRƯỚC khi phân tích id, QDL-02)',
      (name) => {
        const args = Reflect.getMetadata(
          ROUTE_ARGS_METADATA,
          controller,
          name,
        ) as Record<string, { data?: string; pipes?: unknown[] }>;
        const param = Object.values(args).find(
          (arg) => arg.data === 'yeuCauId',
        );
        expect(param).toBeDefined();
        expect(param?.pipes ?? []).toStrictEqual([]);
      },
    );
  },
);

describe('XDL-13 route ghi của Quản trị viên: @RequireAdminScope("Any") và AdminScopeGuard NGAY TRÊN route', () => {
  it.each(['approve', 'reject'] as const)('route %s', (name) => {
    const handler = handlerOf(AdminRescheduleRequestsController, name);
    const reflector = new Reflector();
    expect(reflector.get<string>(ADMIN_SCOPE_KEY, handler)).toBe('Any');
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toStrictEqual([
      AdminScopeGuard,
    ]);
  });

  it('bộ quét route admin của rbac (`auditAdminControllers`) không thấy route nào thiếu bảo vệ Admin (cả bốn route của lớp)', () => {
    expect(
      auditAdminControllers([AdminRescheduleRequestsController]),
    ).toStrictEqual([]);
  });

  it('phạm vi lấy bằng @AdminScopeCtx (tham số 0), người xử lý bằng @CurrentUser (tham số 1), id và thân ở tham số 2 và 3; không đọc phạm vi từ thân hay đường dẫn', () => {
    for (const name of ['approve', 'reject']) {
      const args = Reflect.getMetadata(
        ROUTE_ARGS_METADATA,
        AdminRescheduleRequestsController,
        name,
      ) as Record<string, { index: number }>;
      expect(
        Object.values(args)
          .map((arg) => arg.index)
          .sort((x, y) => x - y),
      ).toEqual([0, 1, 2, 3]);
    }
  });
});

describe('XDL-13 route ghi của Lễ tân: không RequireAdminScope, chi nhánh không có đường nào từ client', () => {
  it.each(['approve', 'reject'] as const)(
    'route %s chỉ có @Roles("LeTan")',
    (name) => {
      const handler = handlerOf(ReceptionRescheduleRequestsController, name);
      const reflector = new Reflector();
      expect(reflector.get<string>(ADMIN_SCOPE_KEY, handler)).toBeUndefined();
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toBeUndefined();
    },
  );
});

describe('chuyển giá trị sang dịch vụ: tường minh từng trường', () => {
  const approveBody = (extra: Record<string, unknown> = {}) =>
    Object.assign(new ApproveRescheduleRequestDto(), {
      ghiChu: 'Đã xếp sang chiều',
      khungGioId: '9007199254740993',
      ...extra,
    });
  const rejectBody = (extra: Record<string, unknown> = {}) =>
    Object.assign(new RejectRescheduleRequestDto(), {
      ghiChu: 'Hết khung giờ',
      ...extra,
    });

  it('Lễ tân duyệt: accountId từ token, id THÔ nguyên (không ép số), CHỈ ghiChu và khungGioId đi tiếp (khoá lạ trên đối tượng thân bị bỏ)', async () => {
    const { reception, approveAsReception } = setup();
    const result = await reception.approve(
      USER,
      '9007199254740993',
      approveBody({ chiNhanhId: '999', yeuCauId: '1' }),
    );
    expect(result).toBe(APPROVED);
    expect(approveAsReception.mock.calls[0]).toStrictEqual([
      '77',
      '9007199254740993',
      { ghiChu: 'Đã xếp sang chiều', khungGioId: '9007199254740993' },
    ]);
  });

  it('Lễ tân duyệt không khungGioId: khungGioId là undefined (dịch vụ dùng khung giờ mong muốn)', async () => {
    const { reception, approveAsReception } = setup();
    await reception.approve(USER, '12', approveBody({ khungGioId: undefined }));
    const input = approveAsReception.mock.calls[0]?.[2] as {
      khungGioId?: string;
    };
    expect(input.khungGioId).toBeUndefined();
  });

  it('Lễ tân từ chối: CHỈ ghiChu đi tiếp', async () => {
    const { reception, rejectAsReception } = setup();
    expect(
      await reception.reject(USER, 'abc', rejectBody({ khungGioId: '5' })),
    ).toBe(REJECTED);
    expect(rejectAsReception.mock.calls[0]).toStrictEqual([
      '77',
      'abc',
      { ghiChu: 'Hết khung giờ' },
    ]);
  });

  it('Quản trị viên: phạm vi từ guard đi NGUYÊN (cùng đối tượng) và người xử lý từ token; duyệt và từ chối', async () => {
    const { admin, approveAsAdmin, rejectAsAdmin } = setup();
    expect(await admin.approve(SCOPE, USER, '12', approveBody())).toBe(
      APPROVED,
    );
    const [scope, accountId, id, input] = approveAsAdmin.mock.calls[0] ?? [];
    expect(scope).toBe(SCOPE);
    expect(accountId).toBe('77');
    expect(id).toBe('12');
    expect(input).toStrictEqual({
      ghiChu: 'Đã xếp sang chiều',
      khungGioId: '9007199254740993',
    });
    expect(await admin.reject(SCOPE, USER, '12', rejectBody())).toBe(REJECTED);
    expect(rejectAsAdmin.mock.calls[0]).toStrictEqual([
      SCOPE,
      '77',
      '12',
      { ghiChu: 'Hết khung giờ' },
    ]);
  });

  it('lỗi của dịch vụ (403 phạm vi, 404, 409) lan ra nguyên vẹn, controller không bắt và không đổi', async () => {
    const { reception, admin, approveAsReception, rejectAsAdmin } = setup();
    const error = new Error('lỗi giả');
    approveAsReception.mockRejectedValueOnce(error);
    rejectAsAdmin.mockRejectedValueOnce(error);
    await expect(reception.approve(USER, '1', approveBody())).rejects.toBe(
      error,
    );
    await expect(admin.reject(SCOPE, USER, '1', rejectBody())).rejects.toBe(
      error,
    );
  });
});
