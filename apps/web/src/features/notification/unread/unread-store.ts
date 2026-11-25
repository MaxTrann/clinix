// Số chưa đọc dùng chung trong một phiên trang (notification F1, PLAN 5.5): MỘT nơi giữ số để chuông, mục menu và (F2) trang Thông báo cùng thấy một giá trị.
// Chỉ hook thăm dò và (F2) các thao tác ghi cập nhật kho này. Kho ở mức module vì chỉ có một khung vai trò trên trang cùng lúc; khung gỡ (đăng xuất, đổi vai) thì
// hook `reset()` để tài khoản sau không thấy số của tài khoản trước.

export interface UnreadSnapshot {
  /** `null` = chưa có lần đọc nào thành công (chuông ẩn số). */
  unread: number | null;
  /** Lần cập nhật gần nhất làm số TĂNG so với số đã biết: đọc "Bạn có thông báo mới" (WTB-03). Lần đọc đầu tiên không tính là tăng. */
  announce: boolean;
  /** Đếm số lần số tăng: F2 theo dõi giá trị này để tải lại trang 1 của danh sách đang mở (PLAN 5.5 b). */
  increases: number;
}

const INITIAL: UnreadSnapshot = { unread: null, announce: false, increases: 0 };

let snapshot: UnreadSnapshot = INITIAL;
const listeners = new Set<() => void>();

function emit(next: UnreadSnapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

export function getUnreadSnapshot(): UnreadSnapshot {
  return snapshot;
}

export function subscribeUnread(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Ghi số mới (từ thăm dò, hay từ `soChuaDoc` trả về sau một thao tác ghi). Số giảm hay giữ nguyên chỉ cập nhật số, không đọc thông báo mới. */
export function setUnreadCount(unread: number): void {
  const rose = snapshot.unread !== null && unread > snapshot.unread;
  if (unread === snapshot.unread && !snapshot.announce) return;
  emit({
    unread,
    announce: rose,
    increases: snapshot.increases + (rose ? 1 : 0),
  });
}

export function resetUnreadStore(): void {
  emit(INITIAL);
}
