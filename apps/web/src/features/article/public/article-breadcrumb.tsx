import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { PUBLIC_TEXT } from './article-public-text';

export interface ArticleBreadcrumbItem {
  label: string;
  // Không có `to` (hoặc là mục cuối) ⇒ chữ thường; mục cuối không có `to` là trang hiện tại
  to?: string;
}

// Đường dẫn phân cấp của trang công khai bài viết (PLAN article 5.12, T17). Khai lại trong module vì `features/search/index.ts` không xuất `Breadcrumb`
// và web cấm import chéo `features/` (ghi nợ lặp nhỏ). Cùng dáng với `search/breadcrumb.tsx`: chữ nhỏ, ngăn bằng chevron.
export function ArticleBreadcrumb({
  items,
}: {
  items: ArticleBreadcrumbItem[];
}) {
  return (
    <nav aria-label={PUBLIC_TEXT.breadcrumbLabel}>
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-gray-600">
        {items.map((item, index) => {
          const current = index === items.length - 1 && !item.to;
          return (
            <li
              key={`${index}-${item.label}`}
              className="flex min-w-0 items-center gap-1.5"
            >
              {index > 0 && (
                <ChevronRight
                  className="size-4 shrink-0 text-gray-400"
                  aria-hidden="true"
                />
              )}
              {current ? (
                <span aria-current="page" className="min-w-0 text-gray-900">
                  {item.label}
                </span>
              ) : item.to ? (
                <Link to={item.to} className="hover:underline">
                  {item.label}
                </Link>
              ) : (
                <span>{item.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
