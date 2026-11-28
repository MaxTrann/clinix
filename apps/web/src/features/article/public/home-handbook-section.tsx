import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import { useRemote } from '../../../shared/hooks/use-remote';
import { useArticleApi } from '../api/article-api-context';
import { HOME_HANDBOOK_SIZE } from '../api/article-types';
import { ARTICLE_LIST_PATH } from '../common/article-paths';
import { ArticleCard } from './article-card';
import {
  HOME_GRID,
  PUBLIC_CONTAINER,
  TEXT_LINK_CLASS,
} from './article-public-styles';
import { PUBLIC_TEXT } from './article-public-text';

// Khối "Cẩm nang sức khỏe" ở trang chủ (PLAN article 5.12, T13, ABG-10): tối đa 4 bài mới nhất, liên kết "Xem tất cả" ⇒ `/cam-nang`.
// KHÔNG VẼ GÌ khi đang tải, lỗi, rỗng hay thân sai dạng (không nhấp nháy khối rỗng, không báo lỗi giữa trang chủ). `router/routes.tsx` truyền khối này vào khe
// `handbookSlot` của `HomePage`; không truyền khe thì trang chủ không có tiêu đề "Cẩm nang" (`TCH-02` giữ nguyên). Không phụ thuộc chi nhánh đang chọn (ABG-12).
export function HomeHandbookSection() {
  const api = useArticleApi();
  const { state } = useRemote(
    (signal) =>
      api.listPublic({ page: 1, pageSize: HOME_HANDBOOK_SIZE }, signal),
    [],
  );
  if (state.status !== 'ready' || state.data.items.length === 0) return null;

  return (
    <section aria-labelledby="home-handbook" className="bg-gray-50 py-14">
      <div className={PUBLIC_CONTAINER}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="home-handbook" className="text-3xl font-bold text-gray-900">
              {PUBLIC_TEXT.title}
            </h2>
            <p className="mt-1.5 text-gray-600">{PUBLIC_TEXT.subtitle}</p>
          </div>
          <Link to={ARTICLE_LIST_PATH} className={`gap-1 ${TEXT_LINK_CLASS}`}>
            {PUBLIC_TEXT.viewAll}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
        <ul className={`mt-8 ${HOME_GRID}`}>
          {state.data.items.slice(0, HOME_HANDBOOK_SIZE).map((item) => (
            <ArticleCard key={item.baiVietId} item={item} titleAs="h3" />
          ))}
        </ul>
      </div>
    </section>
  );
}
