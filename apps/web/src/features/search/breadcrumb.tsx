import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';

export interface BreadcrumbItem {
  label: string;
  // Không có `to` (hoặc là mục cuối) ⇒ chữ thường; mục cuối là trang hiện tại
  to?: string;
}

// Đường dẫn của các trang tra cứu (Figma 217:52, 259:52; search F14, UIS-09): chữ 13,125 px, khe 5,625 px,
// ngăn bằng biểu tượng chevron 15 px (trước là chữ " / "). Mục cuối là trang hiện tại, chữ đậm màu hơn.
export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Đường dẫn">
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-gray-600">
        {items.map((item, index) => {
          // Trang hiện tại = mục cuối KHÔNG có đường dẫn; chi tiết đang tải thì mục cuối còn là liên kết (chưa có tên)
          const current = index === items.length - 1 && !item.to;
          return (
            <li
              key={`${index}-${item.label}`}
              className="flex items-center gap-1.5"
            >
              {index > 0 && (
                <ChevronRight
                  className="size-4 text-gray-400"
                  aria-hidden="true"
                />
              )}
              {current ? (
                <span aria-current="page" className="text-gray-900">
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
