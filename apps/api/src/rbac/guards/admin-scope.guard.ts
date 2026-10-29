import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { currentUserOf } from '../../auth/decorators/current-user.decorator.js';
import { AppException } from '../../common/errors/app.exception.js';
import { AdminScopeService } from '../admin-scope.service.js';
import {
  ADMIN_SCOPE_KEY,
  type AdminScopeRequest,
  type AdminScopeRequirement,
} from '../admin-scope.js';

@Injectable()
export class AdminScopeGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AdminScopeService) private readonly scopes: AdminScopeService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminScopeRequest>();
    const user = currentUserOf(request);
    const required = this.reflector.getAllAndOverride<AdminScopeRequirement>(
      ADMIN_SCOPE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (
      user.role !== 'QuanTriVien' ||
      (required !== 'Any' && required !== 'ToanHeThong')
    )
      throw new AppException(403, 'KHONG_DU_QUYEN');
    // Decorator ở class + method có thể gắn guard hai lần; chỉ resolve một lần/request.
    const scope =
      request.adminScope ?? (await this.scopes.resolve(user.accountId));
    if (required === 'ToanHeThong' && scope.kind !== 'ToanHeThong')
      throw new AppException(403, 'KHONG_DU_QUYEN');
    request.adminScope = scope;
    return true;
  }
}
