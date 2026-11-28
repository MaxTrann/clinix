import { request } from '../../../shared/api/client';
import {
  ARTICLE_LIST_PAGE_SIZE,
  TAG_SUGGESTION_LIMIT,
  type ArticleDetail,
  type ArticleInput,
  type ArticleListPage,
  type ArticleListQuery,
  type ArticlePatch,
  type PublicArticleDetail,
  type PublicArticleListQuery,
  type PublicArticlePage,
  type PublicArticleTag,
  PUBLIC_LIST_PAGE_SIZE,
} from './article-types';
import {
  parseArticleDetail,
  parseArticleListPage,
  parsePublicArticleDetail,
  parsePublicArticlePage,
  parsePublicTags,
  parseTagSuggestions,
} from './parse-article';

// Cổng gọi máy chủ của module bài viết (PLAN article 5.7): MỘT chỗ để thay lớp thật bằng lớp giả. Bản chạy thật là `httpArticleApi`;
// bản giả chỉ nằm ở `testing/`. Nhóm quản trị (`admin/…`) là của Quản trị viên Toàn hệ thống nên KHÔNG dùng `skipAuthToken`;
// nhóm công khai (`public/…`, article F2) là route của khách nên LUÔN dùng `skipAuthToken` (không gắn Authorization, không kích hoạt làm mới phiên).
// Lỗi ném ra: `ApiError` (theo `maLoi` và `loi[].ma`), `NetworkError`, `TimeoutError`, `RequestAbortedError`, `UnexpectedResponseError`.
export interface ArticleApi {
  list(query: ArticleListQuery, signal: AbortSignal): Promise<ArticleListPage>;
  get(id: string, signal: AbortSignal): Promise<ArticleDetail>;
  create(input: ArticleInput): Promise<ArticleDetail>;
  update(id: string, patch: ArticlePatch): Promise<ArticleDetail>;
  // Gợi ý thẻ đã có theo tiền tố (đã chuẩn hoá); chỉ thẻ đang bật
  suggestTags(prefix: string, signal: AbortSignal): Promise<string[]>;
  // ----- Công khai (article F2): chỉ bài đã xuất bản; không bao giờ gửi `chiNhanhId` -----
  listPublic(
    query: PublicArticleListQuery,
    signal: AbortSignal,
  ): Promise<PublicArticlePage>;
  // Mọi lý do không xem được (sai dạng, không có, nháp, lưu trữ) cùng là 404 `KHONG_TIM_THAY`
  getPublic(id: string, signal: AbortSignal): Promise<PublicArticleDetail>;
  // Thẻ phổ biến (tối đa 20) cho chip lọc
  listPublicTags(signal: AbortSignal): Promise<PublicArticleTag[]>;
}

const articlePath = (id: string) => `admin/articles/${encodeURIComponent(id)}`;
const publicArticlePath = (id: string) =>
  `public/articles/${encodeURIComponent(id)}`;

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

  async listPublic(query, signal) {
    // Khoá `undefined` bị lớp client bỏ khỏi query: `the` vắng thì KHÔNG có `the=` (máy chủ từ chối `the` rỗng)
    const raw = await request<unknown>('public/articles', {
      skipAuthToken: true,
      query: {
        q: query.q,
        the: query.the,
        page: query.page,
        pageSize: query.pageSize ?? PUBLIC_LIST_PAGE_SIZE,
      },
      signal,
    });
    return parsePublicArticlePage(raw);
  },

  async getPublic(id, signal) {
    return parsePublicArticleDetail(
      await request<unknown>(publicArticlePath(id), {
        skipAuthToken: true,
        signal,
      }),
    );
  },

  async listPublicTags(signal) {
    return parsePublicTags(
      await request<unknown>('public/article-tags', {
        skipAuthToken: true,
        signal,
      }),
    );
  },
};
