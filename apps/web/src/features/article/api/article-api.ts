import { request } from '../../../shared/api/client';
import {
  ARTICLE_LIST_PAGE_SIZE,
  TAG_SUGGESTION_LIMIT,
  type ArticleDetail,
  type ArticleInput,
  type ArticleListPage,
  type ArticleListQuery,
  type ArticlePatch,
} from './article-types';
import {
  parseArticleDetail,
  parseArticleListPage,
  parseTagSuggestions,
} from './parse-article';

// Cổng gọi máy chủ của trang quản trị bài viết (PLAN article 5.7): MỘT chỗ để thay lớp thật bằng lớp giả. Bản chạy thật là `httpArticleApi`;
// bản giả chỉ nằm ở `testing/`. Tất cả route là của Quản trị viên Toàn hệ thống nên KHÔNG dùng `skipAuthToken`.
// Lỗi ném ra: `ApiError` (theo `maLoi` và `loi[].ma`), `NetworkError`, `TimeoutError`, `RequestAbortedError`, `UnexpectedResponseError`.
export interface ArticleApi {
  list(query: ArticleListQuery, signal: AbortSignal): Promise<ArticleListPage>;
  get(id: string, signal: AbortSignal): Promise<ArticleDetail>;
  create(input: ArticleInput): Promise<ArticleDetail>;
  update(id: string, patch: ArticlePatch): Promise<ArticleDetail>;
  // Gợi ý thẻ đã có theo tiền tố (đã chuẩn hoá); chỉ thẻ đang bật
  suggestTags(prefix: string, signal: AbortSignal): Promise<string[]>;
}

const articlePath = (id: string) => `admin/articles/${encodeURIComponent(id)}`;

export const httpArticleApi: ArticleApi = {
  async list(query, signal) {
    // Khoá `undefined` bị lớp client bỏ khỏi query
    const raw = await request<unknown>('admin/articles', {
      query: {
        q: query.q,
        trangThai: query.trangThai,
        the: query.the,
        page: query.page,
        pageSize: ARTICLE_LIST_PAGE_SIZE,
      },
      signal,
    });
    return parseArticleListPage(raw);
  },

  async get(id, signal) {
    return parseArticleDetail(
      await request<unknown>(articlePath(id), { signal }),
    );
  },

  async create(input) {
    return parseArticleDetail(
      await request<unknown>('admin/articles', { method: 'POST', json: input }),
    );
  },

  async update(id, patch) {
    return parseArticleDetail(
      await request<unknown>(articlePath(id), {
        method: 'PATCH',
        json: patch,
      }),
    );
  },

  async suggestTags(prefix, signal) {
    return parseTagSuggestions(
      await request<unknown>('admin/hashtags', {
        query: { q: prefix, limit: TAG_SUGGESTION_LIMIT },
        signal,
      }),
    );
  },
};
