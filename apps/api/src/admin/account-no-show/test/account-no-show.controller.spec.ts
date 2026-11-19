import 'reflect-metadata';
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants.js';
import { RequestMethod } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../../../auth/decorators/roles.decorator.js';
import { ADMIN_SCOPE_KEY } from '../../../rbac/admin-scope.js';
import { AdminScopeGuard } from '../../../rbac/guards/admin-scope.guard.js';
import { auditAdminControllers } from '../../../rbac/testing/admin-route-audit.js';
import { AccountNoShowController } from '../account-no-show.controller.js';

const reflector = new Reflector();
const prototype = AccountNoShowController.prototype as unknown as Record<
  string,
  (...args: unknown[]) => unknown
>;
// RouteParamtypes của Nest: 3 = BODY, 5 = PARAM (khoá có dạng `<kiểu>:<chỉ số>`).
const BODY_PARAM_TYPE = 3;

describe('TKB19-04 (PQ-11) — controller: đúng một route POST, đủ bảo vệ, không nhận thân', () => {
  const handlerNames = Object.getOwnPropertyNames(prototype).filter(
    (name) => name !== 'constructor',
  );

  it('chỉ có MỘT route, là POST :id/unlock-no-show dưới admin/accounts', () => {
    expect(handlerNames).toEqual(['unlock']);
    const handler = prototype.unlock!;
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
      ':id/unlock-no-show',
    );
    expect(Reflect.getMetadata(PATH_METADATA, AccountNoShowController)).toBe(
      'admin/accounts',
    );
  });

  it('chỉ Quản trị viên, phạm vi Any (quyền Toàn hệ thống kiểm ở service), có AdminScopeGuard', () => {
    const targets = [prototype.unlock!, AccountNoShowController];
    expect(reflector.getAllAndOverride<string[]>(ROLES_KEY, targets)).toEqual([
      'QuanTriVien',
    ]);
    expect(reflector.getAllAndOverride<string>(ADMIN_SCOPE_KEY, targets)).toBe(
      'Any',
    );
    expect(
      reflector.getAllAndMerge<unknown[]>(GUARDS_METADATA, targets),
    ).toContain(AdminScopeGuard);
  });

  it('trả 200 (không phải 201 mặc định của POST)', () => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, prototype.unlock!)).toBe(
      200,
    );
  });

  it('KHÔNG có tham số @Body: mọi thân gửi kèm bị bỏ qua, nên không ép được giá trị cờ hay số lần no-show', () => {
    const args = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      AccountNoShowController,
      'unlock',
    ) as Record<string, unknown> | undefined;
    expect(args).toBeDefined();
    const keys = Object.keys(args ?? {});
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys)
      expect(Number(key.split(':')[0])).not.toBe(BODY_PARAM_TYPE);
  });

  it('bộ quét controller admin của C1 không báo thiếu bảo vệ', () => {
    expect(auditAdminControllers([AccountNoShowController])).toEqual([]);
  });
});
