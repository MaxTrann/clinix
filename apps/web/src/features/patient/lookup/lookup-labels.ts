// Nhãn và định dạng của trang tra cứu (patient F8; TRACKING F8-G). Hàm thuần.
// Nhãn giới tính, quan hệ và ngày sinh dùng lại `genderLabel`, `relationshipLabel`, `toDisplayDate` của F3, F6, không viết lại ở đây.

export const SUSPENDED_ACCOUNT_LABEL = 'Ngừng hoạt động';
export const SUSPENDED_RELATIVE_LABEL = 'Ngừng sử dụng';

// `trangThai` của tài khoản là MÃ (PLAN 5.7). Chỉ `NgungHoatDong` có nhãn; `DangHoatDong` và mã lạ không nhãn, không làm vỡ trang.
export function accountStatusLabel(code: string): string | null {
  return code === 'NgungHoatDong' ? SUSPENDED_ACCOUNT_LABEL : null;
}

const VIETNAM_DATE = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// ISO 8601 UTC (`2026-11-07T17:30:00.000Z`) ⇒ `dd/mm/yyyy` theo NGÀY giờ Việt Nam, KHÔNG theo múi giờ của máy và KHÔNG cắt 10 ký tự đầu:
// 17:30 UTC là 00:30 ngày hôm sau ở Việt Nam. Chuỗi không phải ngày hợp lệ thì `Intl` ném RangeError: nơi gọi đã kiểm bằng `isIsoDateTime`
// ở `parsePatientDetail`.
export function formatVietnamDate(iso: string): string {
  const parts: Record<string, string> = {};
  for (const part of VIETNAM_DATE.formatToParts(new Date(iso))) {
    parts[part.type] = part.value;
  }
  return `${parts.day}/${parts.month}/${parts.year}`;
}

export function absencesLabel(count: number): string {
  return `${count} lần`;
}
