import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { ADMIN_SCOPE_KEY, type AdminScopeRequirement } from '../admin-scope.js';
import { AdminScopeGuard } from '../guards/admin-scope.guard.js';

export const RequireAdminScope = (required: AdminScopeRequirement) =>
  applyDecorators(
    SetMetadata(ADMIN_SCOPE_KEY, required),
    UseGuards(AdminScopeGuard),
  );
