import {
  AppException,
  type FieldError,
} from '../common/errors/app.exception.js';
import {
  COMMON_ERROR_CODES,
  defaultsForStatus,
} from '../common/errors/error-codes.js';

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

/** Mã lỗi riêng của chat (PLAN 5.14). Ba mã `CHAT_TEP_…`, `CHAT_TAI_TEP_…` của tệp đính kèm (chat B4). */
export const CHAT_ERROR_CODES = {
  RECIPIENT_INACTIVE: 'CHAT_NGUOI_NHAN_KHONG_HOAT_DONG',
  SEND_ID_USED: 'CHAT_MA_GUI_DA_DUNG',
  TOO_FAST: 'CHAT_GUI_QUA_NHANH',
  FILE_INVALID: 'CHAT_TEP_KHONG_HOP_LE',
  FILE_TOO_LARGE: 'CHAT_TEP_QUA_LON',
  UPLOAD_BUSY: 'CHAT_TAI_TEP_DANG_BAN',
} as const;

/** Tệp đính kèm (chat B4; PLAN 5.8, Q6): một tệp mỗi tin, tối đa 10 MB đầu vào (bằng CHECK `tep_dung_luong` của schema). */
export const CHAT_FILE_MAX_BYTES = 10 * 1024 * 1024;
/** Tối đa 4 lượt tải lên đồng thời trên một tiến trình API; quá thì 503 `CHAT_TAI_TEP_DANG_BAN`. */
export const CHAT_UPLOAD_CONCURRENT = 4;
/** Hạn giờ xử lý một lượt tải lên, tính từ lúc nhận xong `multipart`. */
export const CHAT_UPLOAD_DEADLINE_MS = 45_000;
/** Job dọn chỉ xoá tệp không dòng nào tham chiếu VÀ cũ hơn 24 giờ (tệp đang chờ giao dịch gửi chắc chắn mới hơn nhiều). */
export const CHAT_ORPHAN_MIN_AGE_MS = 24 * 60 * 60 * 1000;
/** Số khoá mỗi câu tra tham chiếu của job dọn. `[đề xuất]` */
export const CHAT_ORPHAN_BATCH = 500;

/** Lỗi tệp: thân lỗi KHÔNG lặp lại tên tệp (PLAN 5.11). */
export function chatFileInvalid(): AppException {
  return new AppException(400, CHAT_ERROR_CODES.FILE_INVALID, {
    thongBao: 'Chỉ gửi được ảnh JPEG, PNG, WebP hoặc tệp PDF.',
  });
}

export function chatFileTooLarge(): AppException {
  return new AppException(413, CHAT_ERROR_CODES.FILE_TOO_LARGE, {
    thongBao: 'Tệp tối đa 10 MB.',
  });
}

export function chatUploadBusy(): AppException {
  return new AppException(503, CHAT_ERROR_CODES.UPLOAD_BUSY, {
    thongBao: 'Hệ thống đang bận nhận tệp. Thử lại sau ít phút.',
  });
}

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
  // Câu MẶC ĐỊNH của 404 (như pipe id sai dạng và route lạ): mọi 404 của chat cùng một thân, không lộ "id sai dạng" khác "của người khác" (T3; chat B2 QCH-07)
  NotFound: {
    status: 404,
    ...defaultsForStatus(404),
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
