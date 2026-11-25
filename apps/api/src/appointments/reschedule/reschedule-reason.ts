import { trimAsciiWhitespace } from '../../auth/validation/ascii-text.js';

// Luật `lyDoYeuCau` của yêu cầu đổi lịch ngoài chính sách (reschedule B5; PLAN reschedule 5.7, DLH-11). Hàm THUẦN: dịch vụ tạo yêu cầu (lớp bảo vệ thứ hai) và DTO của B6 dùng chung. Cùng nếp
// `visit-reason.rules.ts` của đặt lịch: chuẩn hoá NFC rồi cắt khoảng trắng ASCII hai đầu (cố ý KHÔNG `String.trim()`, nó cắt cả U+00A0), độ dài tính bằng ĐIỂM MÃ (một emoji là một điểm mã),
// không ký tự điều khiển trừ xuống dòng (`\n`, `\r`). Khác lý do khám: BẮT BUỘC và dài 5 đến 500 (cột `ly_do_yeu_cau` là `NOT NULL`; PLAN: "5 đến 500 ký tự, văn bản thuần").

export const REQUEST_REASON_MIN_LENGTH = 5;
export const REQUEST_REASON_MAX_LENGTH = 500;

/** Lỗi của trường `lyDoYeuCau` trong `loi[{truong, ma}]` của 400 `DU_LIEU_KHONG_HOP_LE`; DTO của B6 dùng đúng mã này để đường DTO và đường dịch vụ cùng một chữ. */
export const REQUEST_REASON_FIELD_ERROR = {
  truong: 'lyDoYeuCau',
  ma: 'LY_DO_YEU_CAU_KHONG_HOP_LE',
} as const;

// Ký tự điều khiển (Unicode Cc) TRỪ xuống dòng. Tab cũng bị chặn. `\p{Cf}` (như ZWJ trong emoji ghép) cố ý KHÔNG bị chặn.
const FORBIDDEN_CONTROL = /[^\P{Cc}\n\r]/u;

/** NFC rồi cắt khoảng trắng ASCII hai đầu. Chưa kiểm gì: dùng `isValidRequestReason` trên kết quả. */
export function normalizeRequestReason(value: string): string {
  return trimAsciiWhitespace(value.normalize('NFC'));
}

/** `value` phải là kết quả của `normalizeRequestReason` (dạng chưa chuẩn hoá bị từ chối, như `isValidVisitReason`). */
export function isValidRequestReason(value: string): boolean {
  if (normalizeRequestReason(value) !== value) return false;
  if (FORBIDDEN_CONTROL.test(value)) return false;
  const length = Array.from(value).length;
  return (
    length >= REQUEST_REASON_MIN_LENGTH && length <= REQUEST_REASON_MAX_LENGTH
  );
}
