import { Newspaper } from 'lucide-react';
import { Link } from 'react-router';
import type { PublicArticleItem } from '../api/article-types';
import {
  ARTICLE_DATE_NONE,
  formatArticleDate,
} from '../common/format-article-date';
import { articleDetailPath } from './article-public-paths';
import { tagLabel } from './article-public-text';

// Số thẻ tối đa ở thẻ bài (PLAN article 5.12)
export const CARD_MAX_TAGS = 3;

// Thẻ bài ở danh sách và ở khối trang chủ (PLAN article 5.12, ABG-02): khung dự phòng, tiêu đề, mô tả ngắn, ngày `dd/MM/yyyy`, tối đa 3 thẻ.
// Ảnh đại diện là việc của F4 (`anhDaiDien` hiện luôn null) nên F2 chỉ vẽ khung dự phòng, không có mã ảnh. Cả thẻ là MỘT liên kết (liên kết "kéo giãn" phủ cả thẻ, vùng bấm
// lớn hơn 44 px); thẻ (hashtag) ở đây chỉ là chữ, không phải liên kết, để không lồng liên kết trong liên kết. Bài thiếu ngày (dữ liệu lệch) không vẽ dòng ngày.
export function ArticleCard({
  item,
  titleAs: Title = 'h2',
}: {
  item: PublicArticleItem;
  // Cấp tiêu đề của thẻ: h2 dưới `h1` của trang danh sách, h3 dưới `h2` của khối trang chủ
  titleAs?: 'h2' | 'h3';
}) {
  const date = formatArticleDate(item.thoiDiemXuatBan);
  const tags = item.hashtag.slice(0, CARD_MAX_TAGS);
  return (
    <li className="relative flex flex-col overflow-hidden rounded-[15px] border border-gray-200 bg-white">
      <div
        aria-hidden="true"
        className="flex aspect-video items-center justify-center bg-brand-soft text-brand-strong"
      >
        <Newspaper className="size-10" />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-5">
        <Title className="text-lg leading-snug font-semibold text-gray-900">
          <Link
            to={articleDetailPath(item.baiVietId, item.tieuDe)}
            className="line-clamp-2 after:absolute after:inset-0 hover:underline"
          >
            {item.tieuDe}
          </Link>
        </Title>
        {item.moTaNgan !== null && item.moTaNgan !== '' && (
          <p className="line-clamp-2 text-sm text-gray-600">{item.moTaNgan}</p>
        )}
        <div className="mt-auto flex flex-col gap-2 pt-1">
          {date !== ARTICLE_DATE_NONE && (
            <time
              dateTime={item.thoiDiemXuatBan ?? undefined}
              className="text-sm text-gray-500"
            >
              {date}
            </time>
          )}
          {tags.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <li
                  key={tag}
                  className="rounded-full bg-brand-soft px-2.5 py-0.5 text-xs text-brand-strong"
                >
                  {tagLabel(tag)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </li>
  );
}
