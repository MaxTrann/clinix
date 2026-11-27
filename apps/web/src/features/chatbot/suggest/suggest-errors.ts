import { ApiError, RequestAbortedError } from '../../../shared/api/errors';
import { CHATBOT_TEXT } from '../widget/chatbot-text';

export interface SuggestError {
  text: string;
  // false khi gọi lại y nguyên cũng sai (400, 404, 409): người dùng đổi chuyên khoa hay sang trang tra cứu
  canRetry: boolean;
}

// Chữ lỗi của thẻ gợi ý chọn theo `maLoi` (PLAN 5.16), không theo `thongBao` hay mã HTTP. Mất mạng, quá giờ, 5xx, 502 của nginx, phản hồi
// sai hình dạng đều cùng chữ chung của F1 và cho thử lại (lựa chọn của người dùng được giữ). `null` = nơi gọi tự huỷ: không báo lỗi.
export function suggestErrorOf(error: unknown): SuggestError | null {
  if (error instanceof RequestAbortedError) return null;
  if (error instanceof ApiError) {
    switch (error.maLoi) {
      // `DU_LIEU_KHONG_HOP_LE` (trường lạ, tham số lặp) web không bao giờ gửi, nhưng nếu gặp thì cùng chữ
      case 'BO_LOC_KHONG_HOP_LE':
      case 'DU_LIEU_KHONG_HOP_LE':
        return { text: CHATBOT_TEXT.suggest.errorFilter, canRetry: false };
      case 'KHONG_TIM_THAY':
        return { text: CHATBOT_TEXT.suggest.errorNotFound, canRetry: false };
      case 'HE_THONG_CHUA_CAU_HINH':
        return {
          text: CHATBOT_TEXT.suggest.errorNotConfigured,
          canRetry: false,
        };
    }
  }
  return { text: CHATBOT_TEXT.errorUnavailable, canRetry: true };
}
