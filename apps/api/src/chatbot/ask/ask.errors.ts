import { AppException } from '../../common/errors/app.exception.js';
import {
  BUSY_CODE,
  BUSY_MESSAGE,
  RATE_LIMITED_CODE,
  RATE_LIMITED_MESSAGE,
} from './ask.constants.js';

// Ba lỗi riêng của API hỏi đáp (chatbot B3; PLAN chatbot 5.12, 5.16). Kết quả "AI hỏng" KHÔNG nằm đây: đó là 200 `DuPhong`.

/** 429: chạm trần theo IP. `retryAfterSeconds` là số giây nguyên >= 1; controller đặt header `Retry-After`, thân mang `chiTiet.soGiayCho` (nếp otp-errors). */
export class AskRateLimitedError extends AppException {
  constructor(readonly retryAfterSeconds: number) {
    super(429, RATE_LIMITED_CODE, {
      thongBao: RATE_LIMITED_MESSAGE,
      chiTiet: { soGiayCho: retryAfterSeconds },
    });
  }
}

/** 503: hết suất đồng thời (không xếp hàng). */
export class AskBusyError extends AppException {
  constructor() {
    super(503, BUSY_CODE, { thongBao: BUSY_MESSAGE });
  }
}

/**
 * Lỗi bất ngờ ở bước 8 đến 14, đã bọc để bộ lọc toàn cục (ghi `stack` vào log ERROR) không bao giờ thấy nội dung câu hỏi, ngữ cảnh hay câu trả lời mà một thư viện
 * (MySQL, TypeORM) có thể đã chép vào `message`. Thông điệp CỐ ĐỊNH: số bước và tên lớp lỗi gốc; KHÔNG gắn `cause`. Ra ngoài thành 500 `LOI_HE_THONG`.
 */
export class AskInternalError extends Error {
  constructor(
    readonly step: number,
    original: unknown,
  ) {
    // Chỉ giữ tên lớp lỗi khi đúng mẫu chữ-số-gạch dưới; không bao giờ chép chữ tự do
    const rawName = original instanceof Error ? original.name : '';
    const name = /^[A-Za-z0-9_]{1,60}$/.test(rawName) ? rawName : 'Error';
    super(`Lỗi điều phối Trợ lý AI ở bước ${String(step)} (${name})`);
    this.name = 'AskInternalError';
  }
}
