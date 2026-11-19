// Cột "Lý do nghỉ" của trang Duyệt yêu cầu (doctor UX2, G15; T5): API danh sách trả lý do ĐỦ (tối đa 500 điểm mã), web tự cắt khi hiển thị.
/** Số điểm mã tối đa hiện trong bảng; dài hơn thì cắt rồi thêm "…" (đủ chữ nằm ở `title` và ở ngăn kéo chi tiết). */
export const LEAVE_REASON_PREVIEW_MAX = 80;

export interface LeaveReasonPreview {
  text: string;
  truncated: boolean;
}

/**
 * Đếm và cắt theo ĐIỂM MÃ (`Array.from`), cùng cách server đếm lý do (Q25) và hộp Từ chối: một emoji là một điểm mã nên không bao giờ bị cắt đôi một cặp thay thế.
 * Giới hạn đã biết: chuỗi ghép (emoji nối bằng ZWJ, ký tự ghép dấu) có thể bị cắt giữa cụm; chấp nhận vì chữ đủ vẫn có ở `title` và chi tiết.
 * `trimEnd()` để biên rơi vào dấu cách không ra "chữ …". Hàm thuần, không đổi đầu vào.
 */
export function previewLeaveReason(reason: string): LeaveReasonPreview {
  const points = Array.from(reason);
  if (points.length <= LEAVE_REASON_PREVIEW_MAX)
    return { text: reason, truncated: false };
  const head = points.slice(0, LEAVE_REASON_PREVIEW_MAX).join('').trimEnd();
  return { text: `${head}…`, truncated: true };
}
