import { Controller, Get, Inject } from '@nestjs/common';
import { Public } from '../../auth/decorators/public.decorator.js';
import { ARTICLE_PUBLIC } from '../article.constants.js';
import type { PublicTagItem } from './public-article.dto.js';
import { PublicArticleService } from './public-article.service.js';

// Thẻ phổ biến cho chip lọc ở trang công khai (article B2; PLAN article 5.6, 5.7): tối đa 20 thẻ có bài đã xuất bản. Công khai, chỉ GET, `no-cache` ở `ArticleModule.configure`.
@Controller(`${ARTICLE_PUBLIC.routePrefix}/article-tags`)
@Public()
export class PublicArticleTagController {
  constructor(
    @Inject(PublicArticleService)
    private readonly service: PublicArticleService,
  ) {}

  @Get()
  popular(): Promise<{ items: PublicTagItem[] }> {
    return this.service.popularTags();
  }
}
