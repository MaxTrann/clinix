// Chữ của chuông và số đếm trên mục "Thông báo" (notification F1, PLAN 5.10; WTB-01). Tách khỏi `role-shell.tsx` vì luật fast refresh: file component chỉ export component.

/** Số hiện trên chuông và mục menu: ẩn khi 0, `99+` khi quá 99. */
export function unreadBadgeText(unread: number): string | null {
  if (unread <= 0) return null;
  return unread > 99 ? '99+' : String(unread);
}

/** Tên truy cập của mục "Tin nhắn" có số (chat F1, PLAN chat 5.13): đếm theo hội thoại, không theo tin. */
export function messagesUnreadLabel(unread: number): string {
  return `Tin nhắn, ${Math.max(unread, 0)} hội thoại chưa đọc`;
}

/** Tên truy cập của chuông và của mục menu có số. */
export function unreadLabel(unread: number): string {
  return `Thông báo, ${Math.max(unread, 0)} chưa đọc`;
}
