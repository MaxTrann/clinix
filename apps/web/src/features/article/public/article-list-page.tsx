import { Search } from 'lucide-react';
import { useId } from 'react';
import { useRemote } from '../../../shared/hooks/use-remote';
import { EmptyState } from '../../../shared/ui/empty-state';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import { useArticleApi } from '../api/article-api-context';
import { ArticleBreadcrumb } from './article-breadcrumb';
import { ArticleCard } from './article-card';
import { ArticlePagination } from './article-pagination';
import {
  ARTICLE_GRID,
  BUTTON_SECONDARY_CLASS,
  PUBLIC_CONTAINER,
} from './article-public-styles';
import { PUBLIC_TEXT, pageTitle } from './article-public-text';
import { TagChips } from './tag-chips';
import { useArticleMeta } from './use-article-meta';
import { usePublicArticleList } from './use-public-article-list';

// Trang danh sách công khai `/cam-nang` (PLAN article 5.12, use case 2.4.6 b1 đến b4, A1): ô tìm tiêu đề, chip thẻ, lưới thẻ bài, phân trang. Bộ lọc `?q=&the=&trang=` ở URL.
// Không phụ thuộc chi nhánh đang chọn (bài viết không có cột chi nhánh; ABG-12). Bố cục và chữ do Đại duyệt 28/11/2026.
export function ArticleListPage() {
  const api = useArticleApi();
  const list = usePublicArticleList();
  // Thẻ phổ biến tải MỘT lần, độc lập với bộ lọc (đổi bộ lọc không tải lại, chip không nhấp nháy); lỗi hay sai dạng ⇒ không có chip, danh sách vẫn dùng được
  const tags = useRemote((signal) => api.listPublicTags(signal), []);
  const searchId = useId();
  useArticleMeta({
    title: pageTitle(PUBLIC_TEXT.title),
    description: PUBLIC_TEXT.subtitle,
  });
  const { state, filters } = list;

  return (
    <main className={`${PUBLIC_CONTAINER} py-8`}>
      <ArticleBreadcrumb
        items={[
          { label: PUBLIC_TEXT.breadcrumbHome, to: '/' },
          { label: PUBLIC_TEXT.menu },
        ]}
      />
      <h1 className="mt-5 text-3xl font-bold text-gray-900">
        {PUBLIC_TEXT.title}
      </h1>
      <p className="mt-1.5 text-gray-600">{PUBLIC_TEXT.subtitle}</p>

      <div className="mt-6 flex flex-col gap-4">
        <div className="relative">
          <label htmlFor={searchId} className="sr-only">
            {PUBLIC_TEXT.searchLabel}
          </label>
          <Search
            className="pointer-events-none absolute top-3.5 left-3.5 size-5 text-gray-400"
            aria-hidden="true"
          />
          <input
            id={searchId}
            type="search"
            value={list.search.value}
            placeholder={PUBLIC_TEXT.searchPlaceholder}
            className="h-12 w-full rounded-[13.375px] border border-gray-200 bg-white pr-[15px] pl-[41.25px] text-base"
            onChange={(event) =>
              list.search.onChange(event.currentTarget.value)
            }
          />
        </div>
        <TagChips
          tags={tags.state.status === 'ready' ? tags.state.data : []}
          active={filters.the}
          onSelect={(the) => list.update({ the })}
        />
      </div>

      <div className="mt-6">
        {state.status === 'loading' && (
          <LoadingState message={PUBLIC_TEXT.loading} />
        )}
        {state.status === 'error' && (
          <ErrorState error={state.error} onRetry={list.retry} />
        )}
        {state.status === 'ready' &&
          (state.data.items.length > 0 ? (
            <>
              <ul className={ARTICLE_GRID}>
                {state.data.items.map((item) => (
                  <ArticleCard key={item.baiVietId} item={item} />
                ))}
              </ul>
              <ArticlePagination
                page={filters.trang}
                total={state.data.total}
                pageSize={state.data.pageSize}
                onPageChange={(trang) => list.update({ trang })}
              />
            </>
          ) : (
            <div className="flex flex-col items-start gap-3">
              <EmptyState message={PUBLIC_TEXT.empty} />
              {list.hasFilters && (
                <button
                  type="button"
                  className={BUTTON_SECONDARY_CLASS}
                  onClick={list.clear}
                >
                  {PUBLIC_TEXT.clearFilters}
                </button>
              )}
            </div>
          ))}
      </div>
    </main>
  );
}
