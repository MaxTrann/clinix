import { Controller, Get, Inject, Query } from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { AdminScopeCtx } from '../../rbac/decorators/admin-scope-ctx.decorator.js';
import { RequireAdminScope } from '../../rbac/decorators/require-admin-scope.decorator.js';
import { HashtagSuggestQueryDto } from './article-admin.dto.js';
import { HashtagAdminService } from './hashtag-admin.service.js';

// Gợi ý thẻ khi gõ (article B1; 2.4.55 b2). Chỉ Quản trị viên Toàn hệ thống; `no-store` đặt ở `ArticleModule.configure`.
@Controller('admin/hashtags')
@Roles('QuanTriVien')
@RequireAdminScope('ToanHeThong')
export class HashtagAdminController {
  constructor(
    @Inject(HashtagAdminService) private readonly service: HashtagAdminService,
  ) {}

  @Get()
  suggest(
    @AdminScopeCtx() scope: AdminScope,
    @Query() query: HashtagSuggestQueryDto,
  ) {
    return this.service.suggest(scope, query);
  }
}
