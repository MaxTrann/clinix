import { ApiError } from '../../../shared/api/errors';
import {
  UNKNOWN_RESULT_HINT,
  describeActionFailure,
} from '../account-common/account-errors';
import {
  INVALID_LABEL,
  MISSING_LABEL,
  formatCreatedAt,
} from '../account-common/account-format';
import { formatWait } from './staff-rules';
import type { ResendOutcome, StaffNotice } from './staff-types';

// Chữ của lỗi và kết quả "Gửi lại email kích hoạt" (admin F8). Chọn câu theo MÃ (`maLoi`), không theo `thongBao` hay mã HTTP.
// Chữ lấy NGUYÊN VĂN từ PLAN 5.9 khi có; còn lại là `[đề xuất]` đã được Đại duyệt ngày 23/11/2026 (TRACKING admin 9A.20). Khoá và mở khoá dùng
// thẳng `describeActionFailure` của `account-common`.

export const NOT_PENDING_MESSAGE =
  'Tài khoản không còn chờ kích hoạt. Nếu cần đặt lại mật khẩu, dùng "Quên mật khẩu".';
export const TOO_SOON_MESSAGE = 'Vui lòng thử lại sau.';
export const RESEND_MAIL_FAILED_MESSAGE =
  'Gửi email kích hoạt thất bại. Liên kết cũ (nếu còn hạn) vẫn dùng được. Hãy thử gửi lại.';

const SENT_MESSAGE = 'Đã gửi lại email kích hoạt.';

/** `chiTiet.soGiayCho` của 429 (số giây đã làm tròn lên ở server); mọi dạng khác là `undefined`. */
function waitSeconds(detail: unknown): unknown {
  return typeof detail === 'object' && detail !== null
    ? (detail as { soGiayCho?: unknown }).soGiayCho
    : undefined;
}

/** Lỗi của `POST …/resend-activation` sang chữ. Luôn trả một câu (không bao giờ rỗng). */
export function describeResendFailure(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.maLoi === 'GUI_LAI_QUA_SOM') {
      const wait = formatWait(waitSeconds(error.chiTiet));
      return wait === null ? TOO_SOON_MESSAGE : `Vui lòng thử lại sau ${wait}.`;
    }
    if (error.maLoi === 'TAI_KHOAN_KHONG_CHO_KICH_HOAT')
      return NOT_PENDING_MESSAGE;
  }
  return describeActionFailure(error);
}

/**
 * Kết quả của lần gọi gửi lại ĐÃ THÀNH CÔNG về mặt HTTP (200). Gửi thư lỗi cũng là 200: chỉ `sent` mới được nói "Đã gửi" (NS-19, TK-41).
 * Phản hồi sai hình dạng (`unknown`) là lỗi "chưa rõ", không bao giờ là đã gửi.
 */
export function describeResendOutcome(outcome: ResendOutcome): StaffNotice {
  if (outcome.kind === 'mailFailed')
    return { kind: 'warning', text: RESEND_MAIL_FAILED_MESSAGE };
  if (outcome.kind === 'unknown')
    return { kind: 'error', text: UNKNOWN_RESULT_HINT };
  const when = formatCreatedAt(outcome.hanLienKet);
  const known = when !== INVALID_LABEL && when !== MISSING_LABEL;
  return {
    kind: 'success',
    text: known
      ? `${SENT_MESSAGE} Liên kết mới có hiệu lực đến ${when}.`
      : SENT_MESSAGE,
  };
}
