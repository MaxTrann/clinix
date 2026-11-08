import {
  BRANCH_ROW_LABEL,
  SCOPE_ROW_LABEL,
  adminExtraRows,
  adminSubtitle,
  scopeLabel,
} from '../profile/admin-scope';
import { ReadOnlyField } from '../profile/profile-field';
import { NOT_UPDATED_LABEL } from '../profile/profile-rows-card';
import type { Profile } from '../profile/profile-types';
import { StackedProfilePage } from '../profile/stacked-profile-page';

// Hai câu chỉ đọc là `[đề xuất]` (Figma Quản trị viên chưa có frame sửa; theo `BRANCH_NOTE` của trang Lễ tân, TRACKING F5-F, F5-M)
const SCOPE_NOTE =
  'Phạm vi quản trị do quản trị viên khác phân công, không thể tự thay đổi.';
const BRANCH_NOTE =
  'Chi nhánh do quản trị viên khác phân công, không thể tự thay đổi.';

// Khối chữ (không phải ô nhập) đặt sau email trong form sửa: Quản trị viên không tự đổi phạm vi hay chi nhánh (PLAN H14).
// Ô chi nhánh chỉ có ở phạm vi Chi nhánh; chi nhánh thiếu (hợp đồng lệch) ⇒ "Chưa cập nhật", không vỡ trang.
const extraReadOnlyOf = (profile: Profile) => (
  <>
    <ReadOnlyField
      label={SCOPE_ROW_LABEL}
      value={scopeLabel(profile.phamViQuanTri) ?? NOT_UPDATED_LABEL}
      note={SCOPE_NOTE}
    />
    {profile.phamViQuanTri === 'ChiNhanh' && (
      <ReadOnlyField
        label={BRANCH_ROW_LABEL}
        value={profile.chiNhanh?.ten ?? NOT_UPDATED_LABEL}
        note={BRANCH_NOTE}
      />
    )}
  </>
);

// Trang "Thông tin cá nhân" của Quản trị viên (patient F5; Q6, Figma `510:2`, `620:2`): bố cục xem rồi sửa tại chỗ như trang Lễ tân (Figma
// chỉ vẽ phần xem), rộng tối đa 630 px (`max-w-2xl`) và dòng phụ, phụ đề theo Figma Quản trị viên; thêm hàng "Phạm vi quản trị" (và
// "Chi nhánh quản trị") chỉ đọc; không nhãn trạng thái (Figma không vẽ). Dựng bằng `StackedProfilePage`, dùng chung với Lễ tân.
export function AdminProfilePage() {
  return (
    <StackedProfilePage
      widthClass="max-w-2xl"
      intro="Thông tin tài khoản quản trị viên."
      subtitleOf={adminSubtitle}
      extraRowsOf={adminExtraRows}
      extraReadOnlyOf={extraReadOnlyOf}
    />
  );
}
