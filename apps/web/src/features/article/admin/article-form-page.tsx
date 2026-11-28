import { useParams } from 'react-router';
import { useRemote } from '../../../shared/hooks/use-remote';
import { ApiError } from '../../../shared/api/errors';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import { useArticleApi } from '../api/article-api-context';
import { ARTICLE_ERROR, collectErrorCodes } from '../common/article-errors';
import { isArticleId } from '../common/article-paths';
import { ArticleFormView } from './article-form-view';
import { ArticleNotFound } from './article-not-found';
import { FORM_TEXT } from './article-text';

const isNotFound = (error: unknown) =>
  collectErrorCodes(error).includes(ARTICLE_ERROR.notFound) ||
  (error instanceof ApiError && error.status === 404);

// Trang `/admin/bai-viet/moi`
export function ArticleCreatePage() {
  return <ArticleFormView article={null} />;
}

// Tải bài để sửa. Mã sai dạng thì KHÔNG gọi API; 404 hay mã không có bài ⇒ "Không tìm thấy bài viết"; lỗi khác ⇒ ErrorState kèm "Thử lại".
function ArticleEditLoader({ id }: { id: string }) {
  const api = useArticleApi();
  const { state, retry } = useRemote((signal) => api.get(id, signal), [id]);

  if (state.status === 'loading') {
    return <LoadingState message={FORM_TEXT.loading} />;
  }
  if (state.status === 'error') {
    return isNotFound(state.error) ? (
      <ArticleNotFound />
    ) : (
      <ErrorState error={state.error} onRetry={retry} />
    );
  }
  return <ArticleFormView key={state.data.baiVietId} article={state.data} />;
}

// Trang `/admin/bai-viet/:id`
export function ArticleEditPage() {
  const { id } = useParams();
  if (id === undefined || !isArticleId(id)) return <ArticleNotFound />;
  return <ArticleEditLoader key={id} id={id} />;
}
