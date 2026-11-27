import { ApiError, RequestAbortedError } from '../../../shared/api/errors';
import { CHATBOT_TEXT } from '../widget/chatbot-text';

export interface ChatError {
  text: string;
  canRetry: boolean;
}

// Chữ lỗi chọn theo LOẠI LỖI và `maLoi` (PLAN 5.16), không theo `thongBao` hay mã HTTP. Mất mạng, quá giờ, 500 `LOI_HE_THONG`,
// 502 của nginx, phản hồi sai hình dạng đều cùng một chữ. `null` = nơi gọi tự huỷ (xoá hội thoại, đăng xuất): không báo lỗi.
export function chatErrorOf(error: unknown): ChatError | null {
  if (error instanceof RequestAbortedError) return null;
  if (error instanceof ApiError) {
    switch (error.maLoi) {
      case 'DU_LIEU_KHONG_HOP_LE':
        // Gửi lại y nguyên cũng sai: không có nút "Gửi lại"
        return { text: CHATBOT_TEXT.errorInvalid, canRetry: false };
      case 'TRO_LY_HOI_QUA_NHANH':
        return { text: CHATBOT_TEXT.errorTooFast, canRetry: true };
      case 'TRO_LY_DANG_BAN':
        return { text: CHATBOT_TEXT.errorBusy, canRetry: true };
    }
  }
  return { text: CHATBOT_TEXT.errorUnavailable, canRetry: true };
}
