import { isAbsolute, resolve } from 'node:path';

// Thư mục gốc của kho tệp chat (chat P3; PLAN chat 5.8, TEP-14), đọc từ `CHAT_FILES_DIR`. Gọi khi dựng kho lúc API khởi động:
// sai thì ném lỗi và API dừng ngay. Thông điệp chỉ nêu tên biến và lý do.

/** Thư mục mặc định khi development/test bỏ trống `CHAT_FILES_DIR` (tính từ thư mục chạy API; đã có trong .gitignore). `[đề xuất]` */
export const DEV_CHAT_FILES_DIR = '.chat-files';

export function resolveChatFilesDir(
  nodeEnv: string,
  dir: string | undefined,
): string {
  if (dir === undefined || dir === '') {
    // Staging/production không có mặc định: thiếu biến thì dừng, không lặng lẽ ghi tệp của bệnh nhân vào thư mục không được sao lưu
    if (nodeEnv === 'staging' || nodeEnv === 'production')
      throw new Error(
        `CHAT_FILES_DIR: bắt buộc khi NODE_ENV=${nodeEnv} (thư mục tệp đính kèm của chat)`,
      );
    return resolve(DEV_CHAT_FILES_DIR);
  }
  // Đường dẫn tương đối đổi nghĩa theo thư mục chạy tiến trình nên không nhận
  if (!isAbsolute(dir))
    throw new Error('CHAT_FILES_DIR: phải là đường dẫn tuyệt đối');
  return dir;
}
