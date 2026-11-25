import type { Ref } from 'react';
import type { NotificationItem } from '../api/notification-types';
import { GROUP_ICONS } from './notification-icons';
import { CENTER_TEXT } from './notification-text';
import { formatAbsolute, formatRelative } from './notification-time';

// Một hàng của danh sách (notification F2, PLAN 5.10; WTB-06, WTB-13): là NÚT chọn hàng (Tab, Enter, Space). Hàng chưa đọc có chấm, chữ đậm và chữ ẩn "Chưa đọc"
// cho trình đọc màn hình. Nội dung là chữ thường (React tự thoát ký tự), không `dangerouslySetInnerHTML` (WTB-12).

export function NotificationTime({ iso, now }: { iso: string; now: number }) {
  const absolute = formatAbsolute(iso);
  const relative = formatRelative(iso, now);
  return (
    <time dateTime={iso} className="text-xs text-gray-500">
      {relative ? `${relative} · ${absolute}` : absolute}
    </time>
  );
}

export function NotificationRow({
  item,
  read,
  selected,
  now,
  onSelect,
  buttonRef,
}: {
  item: NotificationItem;
  read: boolean;
  selected: boolean;
  now: number;
  onSelect: () => void;
  buttonRef: Ref<HTMLButtonElement>;
}) {
  const Icon = GROUP_ICONS[item.nhom ?? 'Khac'];
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
      className={`flex w-full min-w-0 items-start gap-3 rounded-xl border px-3 py-3 text-left ${
        selected
          ? 'border-brand bg-brand-soft'
          : 'border-gray-100 bg-white hover:bg-gray-50'
      }`}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={`text-sm break-words text-gray-900 ${read ? 'font-medium' : 'font-bold'}`}
        >
          {!read && <span className="sr-only">{CENTER_TEXT.unreadMark}. </span>}
          {item.tieuDe}
        </span>
        <span className="line-clamp-2 text-sm break-words text-gray-600">
          {item.noiDung}
        </span>
        <NotificationTime iso={item.thoiDiemTao} now={now} />
      </span>
      {!read && (
        // Chấm chưa đọc: brand-strong trên nền trắng 5,36:1
        <span
          aria-hidden="true"
          data-testid="unread-dot"
          className="mt-1 size-2.5 shrink-0 rounded-full bg-brand-strong"
        />
      )}
    </button>
  );
}
