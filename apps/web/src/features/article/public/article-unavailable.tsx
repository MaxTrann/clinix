import { Link } from 'react-router';
import { ARTICLE_LIST_PATH } from '../common/article-paths';
import { TEXT_LINK_CLASS } from './article-public-styles';
import { PUBLIC_TEXT } from './article-public-text';

// A2 của use case 2.4.6 (5b): máy chủ báo 404 `KHONG_TIM_THAY` (bài đã gỡ, về bản nháp, hay không có). Cùng một câu cho mọi lý do (không lộ bài có tồn tại hay không).
// Mã sai dạng không đi qua đây mà ra `NotFoundCard` chung, không gọi API.
export function ArticleUnavailable() {
  return (
    <div role="alert" className="rounded-xl border border-gray-200 p-4">
      <p>{PUBLIC_TEXT.unavailable}</p>
      <Link to={ARTICLE_LIST_PATH} className={`mt-2 ${TEXT_LINK_CLASS}`}>
        {PUBLIC_TEXT.backToList}
      </Link>
    </div>
  );
}
