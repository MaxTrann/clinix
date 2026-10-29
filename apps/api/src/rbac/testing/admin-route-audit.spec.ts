import 'reflect-metadata';
import { Controller, Get, SetMetadata } from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { Public } from '../../auth/decorators/public.decorator.js';
import { RequireAdminScope } from '../decorators/require-admin-scope.decorator.js';
import { ADMIN_SCOPE_KEY } from '../admin-scope.js';
import { auditAdminControllers } from './admin-route-audit.js';

@Controller('admin')
@Roles('QuanTriVien')
@RequireAdminScope('Any')
class Valid {
  @Get() root() {}
  @Get('nested') @RequireAdminScope('ToanHeThong') nested() {}
}
@Controller('admin/broken')
class MissingRole {
  @Get() @RequireAdminScope('Any') get() {}
}
@Controller('admin/broken')
@Roles('QuanTriVien')
class MissingScope {
  @Get() get() {}
}
@Controller('admin/broken')
@Roles('QuanTriVien')
class MissingGuard {
  @Get() @SetMetadata(ADMIN_SCOPE_KEY, 'Any') get() {}
}
@Controller('admin/broken')
@Roles('QuanTriVien')
@RequireAdminScope('Any')
class PublicAdmin {
  @Get() @Public() get() {}
}
@Controller('admin/broken')
@Roles('QuanTriVien')
@RequireAdminScope('Any')
class LooseRole {
  @Get() @Roles('QuanTriVien', 'BenhNhan') get() {}
}
describe('C1 PQ-11 — route audit', () => {
  it('class/method metadata, root /admin hợp lệ', () =>
    expect(auditAdminControllers([Valid])).toEqual([]));
  it.each([MissingRole, MissingScope, MissingGuard, PublicAdmin, LooseRole])(
    'phát hiện %s',
    (controller) => {
      expect(auditAdminControllers([controller])).toHaveLength(1);
    },
  );
});
