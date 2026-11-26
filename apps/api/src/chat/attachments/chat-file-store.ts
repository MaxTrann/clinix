import type { Readable } from 'node:stream';
import type { ChatFileKind } from './chat-file-key.js';

// Cổng kho tệp đính kèm của chat (chat P3; PLAN chat 5.8). B4 (gửi, tải xuống, dọn mồ côi) chỉ dùng giao diện này,
// không tự đọc ghi đĩa: nhờ vậy đổi sang kho khác (ví dụ S3) chỉ cần một lớp mới, và chỉ `chat/attachments/` chạm `node:fs` (HCH-05).

export const CHAT_FILE_STORE = Symbol('CHAT_FILE_STORE');

export interface StoredChatFile {
  /** Khoá do kho sinh (ghi vào `tin_nhan.tep_dinh_kem`). */
  key: string;
  /** Số byte đã lưu (ghi vào `tin_nhan.tep_dung_luong`). */
  size: number;
}

export interface ChatFileContent {
  stream: Readable;
  size: number;
}

export interface ChatFileEntry {
  key: string;
  /** Lần sửa cuối trên đĩa; job dọn mồ côi (B4) chỉ xoá tệp cũ hơn 24 giờ. */
  modifiedAt: Date;
}

export interface ChatFileStore {
  /** Ghi tệp mới; kho tự sinh khoá (người gọi không đặt được khoá). Ghi xong trọn vẹn mới thấy được tệp. */
  write(kind: ChatFileKind, data: Buffer): Promise<StoredChatFile>;
  /** Mở luồng đọc. Tệp không có ⇒ `null`. Khoá sai mẫu ⇒ ném `InvalidChatFileKeyError`. */
  openRead(key: string): Promise<ChatFileContent | null>;
  /** Xoá tệp; tệp đã không còn thì bỏ qua. Khoá sai mẫu ⇒ ném `InvalidChatFileKeyError`. */
  remove(key: string): Promise<void>;
  /** Liệt kê mọi tệp đúng mẫu khoá (bỏ qua tệp tạm và tệp lạ). */
  list(): AsyncIterable<ChatFileEntry>;
}

/** Khoá không đúng mẫu `yyyy/mm/<uuid>.<đuôi>`. Thông điệp không lặp lại khoá (có thể là chuỗi người dùng gửi). */
export class InvalidChatFileKeyError extends Error {
  constructor() {
    super('Khoá tệp đính kèm không hợp lệ');
    this.name = 'InvalidChatFileKeyError';
  }
}
