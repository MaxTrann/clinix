import { useSyncExternalStore } from 'react';
import { getUnreadSnapshot, subscribeUnread } from '../unread/unread-store';

// Trang Thông báo của notification F1: chỗ đứng cho đích của chuông và mục menu (WTB-05). CHỈ có tiêu đề và số chưa đọc lấy từ kho chung;
// danh sách, tab, chi tiết và đánh dấu đã đọc do notification F2 làm ở chính file này `[đề xuất]`.
export function NotificationCenterPage() {
  const { unread } = useSyncExternalStore(subscribeUnread, getUnreadSnapshot);
  return (
    <section className="flex flex-col gap-2">
      <h1 className="text-[24px] leading-[36px] font-extrabold tracking-[-0.3px] text-gray-900">
        Thông báo
      </h1>
      {unread !== null && (
        <p className="text-sm text-gray-600">
          {unread === 0
            ? 'Bạn không có thông báo chưa đọc.'
            : `Bạn có ${unread} thông báo chưa đọc.`}
        </p>
      )}
    </section>
  );
}
