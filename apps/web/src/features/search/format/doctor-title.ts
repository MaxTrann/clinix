import type { DoctorTitle } from '../api/search-types';

const LABELS: Record<DoctorTitle, string> = {
  BS: 'BS',
  BS_CKI: 'BS.CKI',
  BS_CKII: 'BS.CKII',
  ThS_BS: 'ThS.BS',
  TS_BS: 'TS.BS',
  PGS_TS_BS: 'PGS.TS.BS',
  GS_TS_BS: 'GS.TS.BS',
};

// BS_CKII ⇒ "BS.CKII"; mã lạ (API thêm chức danh mới) hiện nguyên mã thay vì vỡ trang.
export function doctorTitleLabel(title: string): string {
  return (LABELS as Record<string, string>)[title] ?? title;
}

// Tên hiển thị theo Figma 260:170, 259:176 (search F14, B3): "ThS.BS. Nguyễn Minh Anh" (chấm sau chữ BS) nhưng "BS.CKII Trần Quốc Huy"
// (KHÔNG chấm sau số La Mã CKI, CKII). Mã lạ hiện nguyên mã rồi chấm như trước. `doctorTitleLabel` giữ nguyên (global-search dùng).
// `features/booking/api/booking-labels.ts` còn nối có chấm ở mọi chức danh: ngoài phạm vi F14, ghi ở TECH_DEBT.
export function doctorDisplayName(title: string, fullName: string): string {
  const label = doctorTitleLabel(title);
  return /CKI{1,2}$/.test(label)
    ? `${label} ${fullName}`
    : `${label}. ${fullName}`;
}

// Ảnh chữ viết tắt (Q14): chữ cái đầu của hai từ cuối của họ tên, ví dụ "Nguyễn Minh Anh" ⇒ "MA".
export function doctorInitials(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  return words
    .slice(-2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}
