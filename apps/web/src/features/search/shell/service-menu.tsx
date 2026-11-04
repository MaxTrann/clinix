import { ChevronDown } from 'lucide-react';
import { Link } from 'react-router';
import type { PublicNavItem } from './public-nav-types';
import { useDismissible } from './use-dismissible';

export interface ServiceGroupLink {
  id: string;
  label: string;
  to: string;
}

export interface ServiceMenuProps {
  item: PublicNavItem;
  // Nhóm dịch vụ do nơi dùng truyền vào (B3/F5 nối API thật). Rỗng ⇒ menu báo chưa có dữ liệu, F1 không tự gọi API chưa tồn tại.
  groups?: ServiceGroupLink[];
  itemClassName: string;
}

// Nút "Dịch vụ khám" kèm mũi tên và menu thả xuống (Figma `257:25`). Menu dạng "disclosure": nút có aria-expanded, nội dung là danh sách liên kết.
export function ServiceMenu({
  item,
  groups = [],
  itemClassName,
}: ServiceMenuProps) {
  const { open, setOpen, containerRef, triggerRef } = useDismissible();

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls="public-service-menu"
        onClick={() => setOpen((value) => !value)}
        className={`${itemClassName} flex items-center gap-1 text-gray-600 hover:bg-gray-50`}
      >
        {item.label}
        <ChevronDown className="size-3.5" aria-hidden="true" />
      </button>
      {open && (
        <div
          id="public-service-menu"
          className="absolute left-0 top-full z-20 mt-1 min-w-56 rounded-xl border border-gray-100 bg-white p-2 shadow-lg"
        >
          {item.to && (
            <Link
              to={item.to}
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2 text-sm font-medium text-brand-strong hover:bg-gray-50"
            >
              Xem tất cả dịch vụ
            </Link>
          )}
          {groups.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-600">
              Chưa có nhóm dịch vụ nào.
            </p>
          ) : (
            <ul>
              {groups.map((group) => (
                <li key={group.id}>
                  <Link
                    to={group.to}
                    onClick={() => setOpen(false)}
                    className="block rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    {group.label}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
