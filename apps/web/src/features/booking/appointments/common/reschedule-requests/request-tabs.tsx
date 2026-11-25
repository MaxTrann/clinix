import { REQUEST_TEXT } from './request-text';
import { REQUEST_TABS, type RequestTab } from './request-types';

// Hai tab Chờ duyệt (mặc định) và Đã xử lý (chỉ đọc; Q11). Là nhóm nút `aria-pressed` chứ không phải `tablist` (nếp `common/status-tabs.tsx`): không có `tabpanel` nào đổi theo tab, chỉ có bảng dưới được tải lại.
// Tab nằm trên URL (`request-query-state.ts`). Chữ chọn dùng `brand-strong` 5,28:1 (ADR 0004).
export function RequestTabs(props: {
  selected: RequestTab;
  onSelect: (tab: RequestTab) => void;
}) {
  return (
    <div
      role="group"
      aria-label={REQUEST_TEXT.tabsLabel}
      className="flex items-end gap-1"
    >
      {REQUEST_TABS.map((tab) => {
        const pressed = tab === props.selected;
        const tone = pressed
          ? 'border-brand-strong text-brand-strong'
          : 'border-transparent text-gray-700 hover:text-gray-900';
        return (
          <button
            key={tab}
            type="button"
            aria-pressed={pressed}
            onClick={() => props.onSelect(tab)}
            className={`-mb-px inline-flex min-h-[2.4rem] items-center border-b-2 px-3 text-sm font-medium whitespace-nowrap ${tone}`}
          >
            {REQUEST_TEXT.tabs[tab]}
          </button>
        );
      })}
    </div>
  );
}
