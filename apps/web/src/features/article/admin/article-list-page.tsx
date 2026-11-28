import { Link } from 'react-router';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import { AdminConfirmationDialog } from '../../admin';
import { ARTICLE_ADMIN_NEW_PATH } from '../common/article-paths';
import { ArticleFilterBar } from './article-list-filters';
import { ArticleListTable } from './article-list-table';
import {
  BUTTON_PRIMARY_CLASS,
  ERROR_NOTICE_CLASS,
  SUCCESS_NOTICE_CLASS,
} from './article-styles';
import { ARCHIVE_DIALOG, LIST_TEXT } from './article-text';
import { useArticleList } from './use-article-list';
import { useArticleStatusChange } from './use-article-status-change';

// Trang danh sách quản trị bài viết `/admin/bai-viet` (PLAN article 5.11, 2.4.55 b1): chip trạng thái, tìm theo tiêu đề, lọc thẻ, bảng, phân trang, đổi trạng thái ở từng dòng.
// Chỉ Quản trị viên Toàn hệ thống (route bọc `AdminScopeGuard`; máy chủ vẫn kiểm lại). Bộ lọc và trang nằm ở URL.
export function ArticleListPage() {
  const list = useArticleList();
  const change = useArticleStatusChange(list.retry);
  const { state } = list;

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-900">
          {LIST_TEXT.title}
        </h1>
        <Link to={ARTICLE_ADMIN_NEW_PATH} className={BUTTON_PRIMARY_CLASS}>
          {LIST_TEXT.newButton}
        </Link>
      </header>

      <ArticleFilterBar
        filters={list.filters}
        counts={list.counts}
        search={list.search}
        onStatus={(trangThai) => list.update({ trangThai })}
        onTag={(the) => list.update({ the })}
      />

      {change.notice !== null &&
        (change.notice.kind === 'success' ? (
          <p role="status" className={SUCCESS_NOTICE_CLASS}>
            {change.notice.text}
          </p>
        ) : (
          <p role="alert" className={ERROR_NOTICE_CLASS}>
            {change.notice.text}
          </p>
        ))}

      {state.status === 'loading' && (
        <LoadingState message={LIST_TEXT.loading} />
      )}
      {state.status === 'error' && (
        <ErrorState error={state.error} onRetry={list.retry} />
      )}
      {state.status === 'ready' && (
        <ArticleListTable
          data={state.data}
          page={list.filters.trang}
          filtered={list.hasFilters}
          pendingId={change.pendingId}
          onPageChange={(trang) => list.update({ trang })}
          onChangeStatus={change.request}
        />
      )}

      <AdminConfirmationDialog
        open={change.archiveTarget !== null}
        title={ARCHIVE_DIALOG.title}
        message={ARCHIVE_DIALOG.message}
        confirmLabel={ARCHIVE_DIALOG.confirm}
        cancelLabel={ARCHIVE_DIALOG.cancel}
        tone="warning"
        pending={change.pendingId !== null}
        onConfirm={() => void change.confirmArchive()}
        onCancel={change.cancelArchive}
      />
    </section>
  );
}
