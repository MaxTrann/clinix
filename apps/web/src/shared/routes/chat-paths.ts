// Trang Tin nhắn của ba khung vai trò (chat F1, PLAN chat 5.13; khớp manifest Figma Make). Đặt ở `shared/` để `router/` (menu, route) và
// `features/notification` (liên kết thông báo `HoiThoai`) dùng chung mà không import `features/chat`. Quản trị viên không có trang Tin nhắn (WCH-02).
// File này không import gì nên viết thẳng gốc từng khu; ca CP-01 khoá chúng khớp `ROLE_HOME_PATHS` (nếp `notification-paths.ts`).
export const CHAT_SEGMENT = 'tin-nhan';

export const PATIENT_CHAT_PATH = `/benh-nhan/${CHAT_SEGMENT}`;
export const RECEPTION_CHAT_PATH = `/le-tan/${CHAT_SEGMENT}`;
export const DOCTOR_CHAT_PATH = `/bac-si-portal/${CHAT_SEGMENT}`;

/** Tham số mở một hội thoại (`?hoiThoai=`), và hai tham số bắt đầu trò chuyện của Bệnh nhân (`?bacSi=`, `?chiNhanh=`; chat F4). */
export const CHAT_QUERY = {
  conversation: 'hoiThoai',
  doctor: 'bacSi',
  branch: 'chiNhanh',
} as const;

/** Trang Tin nhắn `base` mở sẵn hội thoại `hoiThoaiId`. */
export function chatConversationPath(base: string, hoiThoaiId: string): string {
  const query = new URLSearchParams({ [CHAT_QUERY.conversation]: hoiThoaiId });
  return `${base}?${query.toString()}`;
}
