import { Link } from 'react-router';
import { ARTICLE_ADMIN_PATH } from '../common/article-paths';
import { BUTTON_SECONDARY_CLASS } from './article-styles';
import { FORM_TEXT } from './article-text';

// Mã bài sai dạng (không gọi API) hay máy chủ báo 404 khi tải bài để sửa
export function ArticleNotFound() {
  return (
    <section className="flex min-w-0 flex-col items-start gap-3">
      <h1 className="text-xl font-semibold text-gray-900">
        {FORM_TEXT.notFoundTitle}
      </h1>
      <p className="text-gray-700">{FORM_TEXT.notFoundBody}</p>
      <Link to={ARTICLE_ADMIN_PATH} className={BUTTON_SECONDARY_CLASS}>
        {FORM_TEXT.back}
      </Link>
    </section>
  );
}
