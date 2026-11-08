import { ROLE_LABELS } from '../../auth';
import type { InfoCell } from './profile-card';
import type { AdminScope, Profile } from './profile-types';

// Hàm thuần của trang "Thông tin cá nhân" của Quản trị viên (patient F5; TRACKING F5-D, F5-E): nhãn phạm vi, dòng phụ thẻ đầu,
// các hàng chỉ đọc. Không có DOM, không đọc `GET /admin/me` (không import nội bộ của `features/admin`): chỉ dùng hồ sơ của `GET /profile`.

export const SCOPE_ROW_LABEL = 'Phạm vi quản trị';
export const BRANCH_ROW_LABEL = 'Chi nhánh quản trị';

const SCOPE_LABELS: Record<AdminScope, string> = {
  ToanHeThong: 'Toàn hệ thống',
  ChiNhanh: 'Chi nhánh',
};

// Phạm vi thiếu (kể cả mã lạ, đã bị `parseProfile` bỏ) ⇒ null: giao diện hiện "Chưa cập nhật"
export function scopeLabel(scope: AdminScope | undefined): string | null {
  return scope === undefined ? null : SCOPE_LABELS[scope];
}

// Dòng phụ của thẻ đầu theo ĐÚNG Figma `510:2`, `620:2`: không kèm tên chi nhánh (tên chỉ nằm ở hàng "Chi nhánh quản trị").
// Phạm vi thiếu hay lạ ⇒ chỉ "Quản trị viên".
export function adminSubtitle(profile: Profile): string {
  const role = ROLE_LABELS.QuanTriVien;
  switch (profile.phamViQuanTri) {
    case 'ToanHeThong':
      return `${role} toàn hệ thống`;
    case 'ChiNhanh':
      return `${role} chi nhánh`;
    default:
      return role;
  }
}

// Hàng chỉ đọc thêm ở cuối chế độ xem. Hàng chi nhánh CHỈ có khi phạm vi là Chi nhánh: API thừa `chiNhanh` ở phạm vi Toàn hệ thống hay
// phạm vi thiếu cũng không làm hàng này hiện. Phạm vi Chi nhánh mà `chiNhanh` thiếu ⇒ hàng "Chưa cập nhật", không vỡ trang.
export function adminExtraRows(profile: Profile): InfoCell[] {
  const rows: InfoCell[] = [
    { label: SCOPE_ROW_LABEL, value: scopeLabel(profile.phamViQuanTri) },
  ];
  if (profile.phamViQuanTri === 'ChiNhanh') {
    rows.push({ label: BRANCH_ROW_LABEL, value: profile.chiNhanh?.ten });
  }
  return rows;
}
