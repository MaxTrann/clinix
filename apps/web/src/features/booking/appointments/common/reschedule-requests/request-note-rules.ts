import { checkStatusReason } from '../status-reason';

// Luật ô ghi chú xử lý của hộp Duyệt và hộp Từ chối (reschedule F4 Pha B1; PLAN reschedule 5.7; kế hoạch B9 `1.13` mục 2.5). Máy chủ (`@RequiredReason({ rejectSecrets: true })` cộng bộ kiểm cục bộ) cắt bằng
// `String.prototype.trim()` rồi đòi 1 đến 255 ĐƠN VỊ UTF-16 (một biểu tượng chiếm 2) và không có ký tự điều khiển trừ xuống dòng (`\n`, `\r`). Web kiểm ĐÚNG như vậy để chặn trước khi gửi: tái dùng `checkStatusReason`
// (cùng luật `lyDo` của hộp Huỷ, đã có test 127 và 128 biểu tượng) rồi thêm kiểm ký tự điều khiển. KHÔNG chuẩn hoá NFC và KHÔNG đếm điểm mã (luật ô lý do của F2 lệch máy chủ ở bốn chỗ). Chữ mà bộ che bí mật của
// máy chủ chặn (`password=…`, Bearer…) web không đoán được: máy chủ trả 400 ở trường `ghiChu`, hộp báo cạnh ô và giữ chữ. Hàm thuần.
const FORBIDDEN_CONTROL = /[^\P{Cc}\n\r]/u;

export type NoteCheck =
  | { ok: true; value: string }
  | { ok: false; error: 'required' | 'tooLong' | 'control' };

export function checkRequestNote(input: string): NoteCheck {
  const checked = checkStatusReason(input);
  if (!checked.ok) return { ok: false, error: checked.error };
  if (FORBIDDEN_CONTROL.test(checked.value)) {
    return { ok: false, error: 'control' };
  }
  return checked;
}
