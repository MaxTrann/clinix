import {
  AppException,
  type FieldError,
} from '../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../common/errors/error-codes.js';

// Hằng của scope "Nhắn tin" (chat B1; PLAN chat 5.5, 5.14, Q17, T6). Mã lỗi là hợp đồng với web (web chọn câu theo `maLoi`), không đổi khi đã dùng.

/** Nội dung tin: 1 đến 2000 ĐIỂM MÃ (emoji ngoài BMP tính một), Q17. */
export const CHAT_CONTENT_MAX_CODE_POINTS = 2000;

/** Giới hạn tốc độ (Q17, T6): tối đa 20 tin của MỘT người gửi trong 60 giây gần nhất; đếm dòng `tin_nhan`, không bảng riêng. */
export const CHAT_RATE_LIMIT_MESSAGES = 20;
export const CHAT_RATE_LIMIT_WINDOW_SECONDS = 60;

/** Mã của trường trong `loi[{truong, ma}]` (PLAN 5.14). `MA_GUI_KHONG_HOP_LE` là `[đề xuất]` (PLAN chỉ ghi trường `maGui`). */
export const CHAT_FIELD_ERRORS = {
  CONTENT_EMPTY: 'NOI_DUNG_TRONG',
  CONTENT_TOO_LONG: 'NOI_DUNG_QUA_DAI',
  CONTENT_BAD_CHARACTER: 'NOI_DUNG_KY_TU_KHONG_HOP_LE',
  SEND_ID_INVALID: 'MA_GUI_KHONG_HOP_LE',
} as const;

/** Mã lỗi riêng của chat (PLAN 5.14). */
export const CHAT_ERROR_CODES = {
  RECIPIENT_INACTIVE: 'CHAT_NGUOI_NHAN_KHONG_HOAT_DONG',
  SEND_ID_USED: 'CHAT_MA_GUI_DA_DUNG',
  TOO_FAST: 'CHAT_GUI_QUA_NHANH',
} as const;

/** Lỗi CÓ KIỂU của lõi gửi: lõi không ném `AppException` trong giao dịch (nếp booking A8); nơi gọi (REST B3, socket B5) đổi sang lỗi API bằng `chatFailureException`. */
export type ChatSendFailure =
  | { kind: 'Invalid'; loi: FieldError[] }
  /** Không có, của người khác, id sai dạng: cùng một kết quả (T3, không lộ sự tồn tại). */
  | { kind: 'NotFound' }
  /** Vai trò không được làm việc này (ví dụ Bác sĩ, Lễ tân mở hội thoại mới). */
  | { kind: 'Forbidden' }
  | { kind: 'RecipientInactive' }
  | { kind: 'SendIdUsed' }
  | { kind: 'RateLimited' };

const FAILURE_HTTP: Record<
  Exclude<ChatSendFailure['kind'], 'Invalid'>,
  { status: number; maLoi: string; thongBao: string }
> = {
  NotFound: {
    status: 404,
    maLoi: COMMON_ERROR_CODES.NOT_FOUND,
    thongBao: 'Không tìm thấy.',
  },
  Forbidden: {
    status: 403,
    maLoi: COMMON_ERROR_CODES.FORBIDDEN,
    thongBao: 'Bạn không có quyền thực hiện thao tác này.',
  },
  RecipientInactive: {
    status: 409,
    maLoi: CHAT_ERROR_CODES.RECIPIENT_INACTIVE,
    thongBao:
      'Tài khoản người nhận đang ngưng hoạt động nên chưa gửi được. Bạn có thể nhắn lễ tân.',
  },
  SendIdUsed: {
    status: 409,
    maLoi: CHAT_ERROR_CODES.SEND_ID_USED,
    thongBao: 'Chưa gửi được. Vui lòng gửi lại.',
  },
  RateLimited: {
    status: 429,
    maLoi: CHAT_ERROR_CODES.TOO_FAST,
    thongBao: 'Bạn gửi quá nhanh. Đợi một chút rồi gửi lại.',
  },
};

/** Đổi lỗi có kiểu sang `AppException` (một nơi duy nhất giữ cặp mã và HTTP). Thân lỗi KHÔNG lặp lại nội dung tin (BCH-06). */
export function chatFailureException(failure: ChatSendFailure): AppException {
  if (failure.kind === 'Invalid')
    return new AppException(400, COMMON_ERROR_CODES.INVALID_DATA, {
      loi: failure.loi,
    });
  const { status, maLoi, thongBao } = FAILURE_HTTP[failure.kind];
  return new AppException(status, maLoi, { thongBao });
}
