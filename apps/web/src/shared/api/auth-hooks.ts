import type { ApiError } from './errors';

// Điểm cắm cho F1 (hợp đồng đầy đủ: TRACKING auth mục 5 điểm 21). P6 KHÔNG có logic xác thực: danh sách đường loại trừ khỏi làm mới
// (/auth/login, /auth/refresh), Web Locks và cách xử theo `maLoi` đều nằm trong phần F1 cài vào đây.
export interface ApiAuthHooks {
  // Gọi trước MỖI lần gửi, kể cả lần thử lại, nên lần thử lại dùng được token vừa làm mới. null = không gắn Authorization.
  getAccessToken(): string | null;
  // Chỉ được gọi với 401 JSON chuẩn. true = thử lại MỘT lần; false hoặc ném lỗi = nơi gọi nhận ApiError 401 gốc.
  // Không bị tính vào timeout của từng lần gửi, để còn chờ được Web Locks (DN-32).
  recoverFromUnauthorized(context: {
    path: string;
    error: ApiError;
  }): Promise<boolean>;
}

let hooks: ApiAuthHooks | null = null;

// F1 gọi ở mức module, không gọi trong effect (StrictMode chạy effect hai lần). null = gỡ hook, dùng trong test.
export function setApiAuthHooks(next: ApiAuthHooks | null): void {
  hooks = next;
}

export function getApiAuthHooks(): ApiAuthHooks | null {
  return hooks;
}
