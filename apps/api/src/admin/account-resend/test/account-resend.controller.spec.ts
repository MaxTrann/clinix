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
import { AccountResendController } from '../account-resend.controller.js';

const reflector = new Reflector();
const prototype = AccountResendController.prototype as unknown as Record<
  string,
  (...args: unknown[]) => unknown
>;
// RouteParamtypes của Nest: 3 = BODY (khoá có dạng `<kiểu>:<chỉ số>`).
const BODY_PARAM_TYPE = 3;

describe('TKB20-07 (PQ-11) — controller: đúng một route POST, đủ bảo vệ, không nhận thân', () => {
  const handlerNames = Object.getOwnPropertyNames(prototype).filter(
    (name) => name !== 'constructor',
  );

  it('chỉ có MỘT route, là POST :id/resend-activation dưới admin/accounts', () => {
    expect(handlerNames).toEqual(['resendActivation']);
    const handler = prototype.resendActivation!;
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
      ':id/resend-activation',
    );
    expect(Reflect.getMetadata(PATH_METADATA, AccountResendController)).toBe(
      'admin/accounts',
    );
  });

  it('chỉ Quản trị viên, phạm vi Any (quyền theo ma trận kiểm ở service), có AdminScopeGuard', () => {
    const targets = [prototype.resendActivation!, AccountResendController];
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

  it('trả 200 (không phải 201 mặc định của POST): hành động không tạo tài nguyên, và gửi thư lỗi cũng là 200', () => {
    expect(
      Reflect.getMetadata(HTTP_CODE_METADATA, prototype.resendActivation!),
    ).toBe(200);
  });

  it('KHÔNG có tham số @Body (mọi thân gửi kèm bị bỏ qua); có đúng hai tham số: phạm vi và :id', () => {
    const args = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      AccountResendController,
      'resendActivation',
    ) as Record<string, unknown> | undefined;
    expect(args).toBeDefined();
    const keys = Object.keys(args ?? {});
    expect(keys).toHaveLength(2);
    for (const key of keys)
      expect(Number(key.split(':')[0])).not.toBe(BODY_PARAM_TYPE);
  });

  it('bộ quét controller admin của C1 không báo thiếu bảo vệ', () => {
    expect(auditAdminControllers([AccountResendController])).toEqual([]);
  });
});
