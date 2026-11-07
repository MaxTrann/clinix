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

// Ảnh chữ viết tắt (Q14): chữ cái đầu của hai từ cuối của họ tên, ví dụ "Nguyễn Minh Anh" ⇒ "MA".
export function doctorInitials(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  return words
    .slice(-2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}
