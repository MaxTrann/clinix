import { randomUUID } from 'node:crypto';
import { nowVN, todayVN } from '../../common/time/time.js';

// Khoá lưu tệp đính kèm của chat (chat P3; PLAN chat 5.8, Q5). Dạng `yyyy/mm/<uuid>.<đuôi>`:
// - `yyyy/mm` là tháng theo giờ Việt Nam lúc ghi, để mỗi thư mục không quá đông tệp;
// - `<uuid>` do máy chủ sinh, KHÔNG BAO GIỜ lấy từ tên tệp của người dùng (tên gốc chỉ là dữ liệu hiển thị, cột `tep_ten_goc`);
// - `<đuôi>` theo loại tệp máy chủ đã nhận ra từ nội dung (B4), không theo đuôi client gửi.

/** Bốn loại tệp được nhận (Q6); giá trị cũng chính là đuôi tệp trên đĩa. */
export const CHAT_FILE_KINDS = ['jpg', 'png', 'webp', 'pdf'] as const;
export type ChatFileKind = (typeof CHAT_FILE_KINDS)[number];

// UUID phiên bản 4 chữ thường (đúng dạng `randomUUID()` sinh ra). Tháng 01 đến 12.
const KEY_PATTERN =
  /^\d{4}\/(?:0[1-9]|1[0-2])\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp|pdf)$/;

/** Sinh khoá mới cho một tệp. Chỉ nhận loại tệp và thời điểm: không có tham số nào chứa dữ liệu người dùng (HCH-05). */
export function newChatFileKey(
  kind: ChatFileKind,
  now: Date = nowVN(),
): string {
  const [year, month] = todayVN(now).split('-');
  return `${year}/${month}/${randomUUID()}.${kind}`;
}

/** Khoá có đúng mẫu không. Mọi thao tác đọc, xoá đều kiểm trước, nên khoá kiểu `../../etc/passwd` không bao giờ tới được ổ đĩa. */
export function isChatFileKey(key: unknown): key is string {
  return typeof key === 'string' && KEY_PATTERN.test(key);
}
