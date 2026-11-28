import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { AdminScopeCtx } from '../../rbac/decorators/admin-scope-ctx.decorator.js';
import { RequireAdminScope } from '../../rbac/decorators/require-admin-scope.decorator.js';
import {
  ArticleIdDto,
  ArticleListQueryDto,
  CreateArticleDto,
  UpdateArticleDto,
} from './article-admin.dto.js';
import { ArticleAdminService } from './article-admin.service.js';

// API quản trị bài viết (article B1; PLAN article 5.4, 5.7). CHỈ Quản trị viên Toàn hệ thống (Q4): Chi nhánh, Lễ tân, Bác sĩ, Bệnh nhân, khách đều bị chặn.
// `@Roles` và `@RequireAdminScope('ToanHeThong')` khai ở cấp lớp nên hiệu lực trên MỌI route (kể cả route thêm sau); service gọi lại `assertToanHeThong`.
// `Cache-Control: no-store` đặt ở `ArticleModule.configure` (cả lỗi 401, 403, 404). KHÔNG có route xoá bài (chỉ lưu trữ bằng `trangThai: 'LuuTruAn'`).
@Controller('admin/articles')
@Roles('QuanTriVien')
@RequireAdminScope('ToanHeThong')
export class ArticleAdminController {
  constructor(
    @Inject(ArticleAdminService) private readonly service: ArticleAdminService,
  ) {}

  @Get()
  list(
    @AdminScopeCtx() scope: AdminScope,
    @Query() query: ArticleListQueryDto,
  ) {
    return this.service.list(scope, query);
  }

  @Get(':id')
  get(@AdminScopeCtx() scope: AdminScope, @Param() params: ArticleIdDto) {
    return this.service.get(scope, params.id);
  }

  @Post()
  create(
    @AdminScopeCtx() scope: AdminScope,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: CreateArticleDto,
  ) {
    return this.service.create(scope, user.accountId, input);
  }

  @Patch(':id')
  update(
    @AdminScopeCtx() scope: AdminScope,
    @Param() params: ArticleIdDto,
    @Body() input: UpdateArticleDto,
  ) {
    return this.service.update(scope, params.id, input);
  }
}
