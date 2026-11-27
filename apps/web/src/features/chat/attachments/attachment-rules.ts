import {
  FILE_TOO_LARGE_MESSAGE,
  FILE_TYPE_MESSAGE,
} from '../workspace/chat-format';

// Luật tệp đính kèm ở web (chat F6; PLAN chat 5.8, Q6): một tệp mỗi tin, JPEG, PNG, WebP hay PDF, tối đa 10 MB. Đây chỉ là CHẶN SỚM cho đỡ tải lên vô ích:
// trình duyệt đoán loại theo đuôi tên, nên máy chủ mới là nơi kiểm thật (theo nội dung, B4) và web luôn hiện câu theo `maLoi` máy chủ trả.
// Cách hiện một tệp đã gửi (ảnh hay PDF) lấy từ `tep.loai` do MÁY CHỦ trả, không từ tệp ở máy người dùng.

export const CHAT_FILE_MAX_BYTES = 10 * 1024 * 1024;
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const PDF_TYPE = 'application/pdf';
/** Giá trị `accept` của ô chọn tệp (gợi ý cho hộp chọn của hệ điều hành). */
export const CHAT_FILE_ACCEPT = [...IMAGE_TYPES, PDF_TYPE].join(',');

const ALLOWED: ReadonlySet<string> = new Set([...IMAGE_TYPES, PDF_TYPE]);

export function isImageType(loai: string): boolean {
  return (IMAGE_TYPES as readonly string[]).includes(loai);
}

/** Câu lỗi khi chọn tệp, hoặc `null` nếu được gửi. Tệp rỗng coi như sai loại (máy chủ cũng từ chối). */
export function attachmentError(file: {
  type: string;
  size: number;
}): string | null {
  if (!ALLOWED.has(file.type) || file.size === 0) return FILE_TYPE_MESSAGE;
  if (file.size > CHAT_FILE_MAX_BYTES) return FILE_TOO_LARGE_MESSAGE;
  return null;
}

/** Dung lượng dễ đọc: "512 B", "350 KB", "1,2 MB" (dấu phẩy thập phân kiểu Việt Nam). */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}
