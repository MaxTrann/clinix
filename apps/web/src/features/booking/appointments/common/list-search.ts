// `search` của danh sách lúc bấm `Chi tiết` (`location.state.listSearch`; chỉ bộ lọc không cá nhân, KHÔNG có `q`): trang chi tiết dùng để `← Lịch hẹn` khôi phục bộ lọc. Booking F10 viết trong
// `admin/detail/admin-detail-page.tsx`, chuyển lên `common/` ở F11 (Quản trị viên và Bác sĩ cùng dùng). Giá trị từ lịch sử trình duyệt nên kiểm lại: chỉ nhận chuỗi rỗng hay bắt đầu bằng `?`; vào thẳng
// chi tiết (không có state) thì về danh sách trơn.
export function readListSearch(state: unknown): string {
  const value =
    typeof state === 'object' && state !== null
      ? (state as { listSearch?: unknown }).listSearch
      : undefined;
  return typeof value === 'string' && (value === '' || value.startsWith('?'))
    ? value
    : '';
}
