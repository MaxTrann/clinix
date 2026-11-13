// Luật của ô `Lý do hủy *` (booking F9; Q27, TRACKING 3.30 F9-H). Hàm thuần.
//
// Backend (`ReceptionStatusDto`) cắt bằng `String.prototype.trim()` rồi đòi `length` từ 1 đến 255, mà `length` đếm ĐƠN VỊ UTF-16 (một biểu tượng chiếm 2 đơn vị). Client phải kiểm
// ĐÚNG như vậy để chặn trước khi gửi: không đếm điểm mã (cho qua chuỗi mà máy chủ từ chối 400), không chuẩn hoá NFC, không dùng regex khoảng trắng tự viết (`trim()` của JS
// cắt cả khoảng không ngắt U+00A0 và U+FEFF mà `\s` của vài ngôn ngữ khác thì không). Không có `maxLength` ở ô nhập: cắt thầm lúc dán là nói dối người dùng.
export const REASON_MAX_LENGTH = 255;

export type ReasonCheck =
  { ok: true; value: string } | { ok: false; error: 'required' | 'tooLong' };

export function checkCancelReason(input: string): ReasonCheck {
  const value = input.trim();
  if (value.length === 0) return { ok: false, error: 'required' };
  if (value.length > REASON_MAX_LENGTH) return { ok: false, error: 'tooLong' };
  return { ok: true, value };
}
