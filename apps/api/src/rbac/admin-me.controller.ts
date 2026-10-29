import { Controller, Get, Inject } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { AdminScopeService } from './admin-scope.service.js';
import type { AdminScope } from './admin-scope.js';
import { AdminScopeCtx } from './decorators/admin-scope-ctx.decorator.js';
import { RequireAdminScope } from './decorators/require-admin-scope.decorator.js';

@Controller('admin')
@Roles('QuanTriVien')
@RequireAdminScope('Any')
export class AdminMeController {
  constructor(
    @Inject(AdminScopeService) private readonly scopes: AdminScopeService,
  ) {}

  @Get('me')
  me(@AdminScopeCtx() scope: AdminScope) {
    return this.scopes.describe(scope);
  }
}
