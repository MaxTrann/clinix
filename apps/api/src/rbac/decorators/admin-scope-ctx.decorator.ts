import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import type { AdminScope, AdminScopeRequest } from '../admin-scope.js';

export function adminScopeOf(request: AdminScopeRequest): AdminScope {
  if (!request.adminScope) throw new AppException(403, 'KHONG_DU_QUYEN');
  return request.adminScope;
}

export const AdminScopeCtx = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AdminScope =>
    adminScopeOf(context.switchToHttp().getRequest<AdminScopeRequest>()),
);
