import { Link, Navigate, useParams } from 'react-router';
import { useRemote } from '../../../shared/hooks/use-remote';
import { NotFoundCard } from '../../../shared/ui/error-page-card';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import { useArticleApi } from '../api/article-api-context';
import { ARTICLE_ERROR, collectErrorCodes } from '../common/article-errors';
import { ARTICLE_LIST_PATH } from '../common/article-paths';
import { ArticleContent } from '../common/article-content';
import {
  ARTICLE_DATE_NONE,
  formatArticleDate,
} from '../common/format-article-date';
import { ArticleBreadcrumb } from './article-breadcrumb';
import { articleIdSlug, parseIdSlug } from './article-public-paths';
import { articleListPath } from './article-public-query';
import { PUBLIC_CONTAINER } from './article-public-styles';
import {
  PUBLIC_TEXT,
  pageTitle,
  publishedOn,
  tagLabel,
} from './article-public-text';
import { ArticleUnavailable } from './article-unavailable';
import { useArticleMeta } from './use-article-meta';

// Trang chi tiết `/cam-nang/:idSlug` (PLAN article 5.12, Q3, T3, use case 2.4.6 b5, b6, A2). Mã sai dạng ⇒ trang 404 chung và KHÔNG gọi API (ABG-06).
export function ArticleDetailPage() {
  const { idSlug = '' } = useParams();
  const parsed = parseIdSlug(idSlug);
  if (parsed === null) return <NotFoundCard />;
  return <ArticleDetailContent id={parsed.id} idSlug={idSlug} />;
}

// Tách ra để hook tải chỉ chạy khi mã hợp lệ (hook không được gọi có điều kiện)
function ArticleDetailContent({ id, idSlug }: { id: string; idSlug: string }) {
  const api = useArticleApi();
  const { state, retry } = useRemote(
    (signal) => api.getPublic(id, signal),
    [id],
  );
  const article = state.status === 'ready' ? state.data : null;
  // Đường chuẩn `id-slug`: sai slug (hay thiếu slug) ⇒ chuyển hướng THAY mục lịch sử. Mã không đổi nên `useRemote` không tải lại.
  const canonical = article === null ? null : articleIdSlug(id, article.tieuDe);
  const redirecting = canonical !== null && canonical !== idSlug;
  // Tiêu đề tab và mô tả chỉ đặt khi đã có bài và không đang chuyển hướng (C7, C8: thiếu `moTaNgan` thì dùng phụ đề)
  useArticleMeta(
    article === null || redirecting
      ? null
      : {
          title: pageTitle(article.tieuDe),
          description: article.moTaNgan ?? PUBLIC_TEXT.subtitle,
        },
  );

  if (redirecting) {
    return <Navigate to={`${ARTICLE_LIST_PATH}/${canonical}`} replace />;
  }

  // Theo MÃ lỗi (không theo mã HTTP hay chữ của máy chủ): 404 `KHONG_TIM_THAY` ⇒ A2; mọi lỗi khác (mạng, hết giờ, 5xx, thân sai dạng) là lỗi có "Thử lại"
  const unavailable =
    state.status === 'error' &&
    collectErrorCodes(state.error).includes(ARTICLE_ERROR.notFound);
  const date =
    article === null ? null : formatArticleDate(article.thoiDiemXuatBan);

  return (
    <main className={`${PUBLIC_CONTAINER} py-8`}>
      <ArticleBreadcrumb
        items={[
          { label: PUBLIC_TEXT.breadcrumbHome, to: '/' },
          { label: PUBLIC_TEXT.menu, to: ARTICLE_LIST_PATH },
          ...(article === null ? [] : [{ label: article.tieuDe }]),
        ]}
      />
      <div className="mt-5">
        {state.status === 'loading' && (
          <LoadingState message={PUBLIC_TEXT.loading} />
        )}
        {unavailable && <ArticleUnavailable />}
        {state.status === 'error' && !unavailable && (
          <ErrorState error={state.error} onRetry={retry} />
        )}
        {article !== null && (
          <article className="max-w-3xl">
            <h1 className="text-3xl leading-tight font-bold text-gray-900">
              {article.tieuDe}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-500">
              {date !== null && date !== ARTICLE_DATE_NONE && (
                <time dateTime={article.thoiDiemXuatBan ?? undefined}>
                  {publishedOn(date)}
                </time>
              )}
              {article.hashtag.length > 0 && (
                <ul
                  aria-label={PUBLIC_TEXT.articleTagsLabel}
                  className="flex flex-wrap gap-2"
                >
                  {article.hashtag.map((tag) => (
                    <li key={tag}>
                      <Link
                        to={articleListPath({ the: tag })}
                        className="inline-flex min-h-[44px] items-center rounded-full bg-brand-soft px-3 text-sm text-brand-strong hover:underline"
                      >
                        {tagLabel(tag)}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="mt-6 text-base">
              <ArticleContent text={article.noiDung} />
            </div>
          </article>
        )}
      </div>
    </main>
  );
}
