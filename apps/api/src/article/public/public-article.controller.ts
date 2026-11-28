import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { Public } from '../../auth/decorators/public.decorator.js';
import { ARTICLE_PUBLIC } from '../article.constants.js';
import {
  PublicArticleListQueryDto,
  type PublicArticleDetail,
  type PublicArticlePage,
} from './public-article.dto.js';
import { PublicArticleService } from './public-article.service.js';

// Route công khai của bài viết (article B2; PLAN article 5.4, 5.7): không đọc token, không `@Roles`, chỉ GET. Controller chỉ nhận và trả.
// `Cache-Control: no-cache` đặt ở `ArticleModule.configure` (middleware, cả 200, 400 và 404). Id lấy chuỗi thô: sai dạng cũng là 404 (cùng thân với không có), do service quyết định.
@Controller(`${ARTICLE_PUBLIC.routePrefix}/articles`)
@Public()
export class PublicArticleController {
  constructor(
    @Inject(PublicArticleService)
    private readonly service: PublicArticleService,
  ) {}

  @Get()
  list(@Query() query: PublicArticleListQueryDto): Promise<PublicArticlePage> {
    return this.service.list(query);
  }

  @Get(':id')
  detail(@Param('id') id: string): Promise<PublicArticleDetail> {
    return this.service.detail(id);
  }
}
