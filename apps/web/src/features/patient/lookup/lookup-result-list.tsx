import { ChevronRight } from 'lucide-react';
import { initialsOf } from '../profile/profile-format';
import { accountStatusLabel } from './lookup-labels';
import type { PatientSummary } from './lookup-types';

export interface LookupResultListProps {
  items: readonly PatientSummary[];
  // `taiKhoanId` của mục đang chọn, hoặc null
  selectedId: string | null;
  onSelect: (taiKhoanId: string) => void;
}

// Hàng kết quả (Figma `484:2`, gốc 15 px): nút cả hàng đệm 15 và 13,125, avatar 33,75, cách 11,25, mũi tên 15; mép trái dày 2,4 px trong
// suốt (chỗ đánh dấu hàng đang chọn). Figma không vẽ trạng thái chọn nên đây là `[đề xuất]`: mép trái brand-strong và nền brand-soft,
// cùng `aria-current="true"` (không dùng `aria-pressed`: không có thao tác bỏ chọn).
// Màu: SĐT và email `#6a7282` và `#99a1af` của Figma ⇒ gray-600 và gray-500 (gray-500 đạt 4,65:1 trên brand-soft; `#99a1af` chỉ 2,50:1);
// avatar brand-strong trên cyan-100 (4,71:1; Figma `#0092b8` chỉ 3,23:1).
const ROW =
  'flex w-full items-center gap-[0.75rem] border-l-[0.16rem] border-transparent px-[1rem] py-[0.875rem] text-left hover:bg-gray-50 focus-visible:outline-offset-[-2px] aria-[current=true]:border-brand-strong aria-[current=true]:bg-brand-soft';

export function LookupResultList({
  items,
  selectedId,
  onSelect,
}: LookupResultListProps) {
  return (
    <ul className="py-[0.25rem]">
      {items.map((item) => {
        const status = accountStatusLabel(item.trangThai);
        return (
          <li key={item.taiKhoanId}>
            <button
              type="button"
              aria-current={item.taiKhoanId === selectedId ? 'true' : undefined}
              onClick={() => onSelect(item.taiKhoanId)}
              className={ROW}
            >
              <span
                aria-hidden="true"
                className="flex size-[2.25rem] shrink-0 items-center justify-center rounded-full bg-cyan-100 text-sm font-bold text-brand-strong"
              >
                {initialsOf(item.hoTen)}
              </span>
              {/* `min-w-0` và `break-words`: họ tên, email dài xuống dòng thay vì đẩy mũi tên ra khỏi cột */}
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-[0.5rem] gap-y-[0.125rem]">
                  <span className="text-sm font-semibold break-words text-gray-900">
                    {item.hoTen}
                  </span>
                  {status && (
                    <span className="rounded-full border border-danger-line bg-danger-soft px-2 py-0.5 text-xs font-medium text-danger-strong">
                      {status}
                    </span>
                  )}
                </span>
                <span className="block pt-[0.125rem] text-xs font-medium break-words text-gray-600">
                  {item.soDienThoai}
                </span>
                <span className="block text-xs font-medium break-words text-gray-500">
                  {item.email}
                </span>
              </span>
              <ChevronRight
                aria-hidden="true"
                className="size-[1rem] shrink-0 text-gray-500"
              />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
