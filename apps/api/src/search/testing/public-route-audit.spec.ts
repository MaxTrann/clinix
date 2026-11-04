import 'reflect-metadata';
import { Controller, Get, Post } from '@nestjs/common';
import { Public } from '../../auth/decorators/public.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { SearchModule } from '../search.module.js';
import { auditPublicControllers } from './public-route-audit.js';

@Controller('public/branches')
@Public()
class Valid {
  @Get() list() {}
  @Get(':id') one() {}
}
@Controller('branches')
@Public()
class WrongPrefix {
  @Get() list() {}
}
@Controller('public/x')
class NotPublic {
  @Get() list() {}
}
@Controller('public/x')
@Public()
class WithRoles {
  @Get() @Roles('QuanTriVien') list() {}
}
@Controller('public/x')
@Public()
class WritesData {
  @Post() create() {}
}
@Controller('public/x')
@Public()
class UsesCurrentUser {
  @Get() list(@CurrentUser() _user: unknown) {}
}

describe('P1 CC-04 — kiểm route công khai', () => {
  it('controller đúng quy ước: không vi phạm', () =>
    expect(auditPublicControllers([Valid])).toEqual([]));

  it.each([
    [WrongPrefix, 'public/'],
    [NotPublic, '@Public'],
    [WithRoles, '@Roles'],
    [WritesData, 'GET'],
    [UsesCurrentUser, 'CurrentUser'],
  ])('phát hiện %s', (controller, keyword) => {
    const failures = auditPublicControllers([controller]);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain(keyword);
  });

  it('mọi controller thật của SearchModule đều đạt', () => {
    const controllers = (Reflect.getMetadata('controllers', SearchModule) ??
      []) as Function[];
    expect(auditPublicControllers(controllers)).toEqual([]);
  });
});
