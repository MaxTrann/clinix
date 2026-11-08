import { ROLE_LABELS } from '../../auth';
import { ReadOnlyField } from '../profile/profile-field';
import { NOT_UPDATED_LABEL } from '../profile/profile-rows-card';
import { StackedProfilePage } from '../profile/stacked-profile-page';
import type { Profile } from '../profile/profile-types';

const BRANCH_NOTE =
  'Chi nhánh do quản trị viên phân công, không thể tự thay đổi.';
// `GET /profile` không trả trạng thái tài khoản; người gọi được API thì tài khoản đang hoạt động (guard kiểm, khoá giữa chừng ⇒ 401,
// PLAN H9), nên chữ này luôn đúng khi người dùng nhìn thấy trang (TRACKING F4-E)
const ACTIVE_LABEL = 'Đang hoạt động';

// Chi nhánh thiếu (API luôn trả cho Lễ tân; thiếu là hợp đồng lệch) không làm vỡ trang: chỉ còn "Lễ tân", ô chi nhánh "Chưa cập nhật"
function subtitleOf(profile: Profile): string {
  const role = ROLE_LABELS.LeTan;
  const branchName = profile.chiNhanh?.ten;
  return branchName ? `${role} · ${branchName}` : role;
}

const extraRowsOf = (profile: Profile) => [
  { label: 'Chi nhánh công tác', value: profile.chiNhanh?.ten },
];

const extraReadOnlyOf = (profile: Profile) => (
  <ReadOnlyField
    label="Chi nhánh công tác"
    value={profile.chiNhanh?.ten ?? NOT_UPDATED_LABEL}
    note={BRANCH_NOTE}
  />
);

// Trang "Thông tin cá nhân" của Lễ tân (patient F4; frame `503:2` xem, `504:2` sửa): thẻ đầu, thẻ thông tin xem dạng hàng rồi sửa tại chỗ
// bằng `ProfileForm` của F3 (email và chi nhánh chỉ đọc), và khối "Đổi mật khẩu" của auth. Phần dựng trang nằm ở `StackedProfilePage`
// (dùng chung với Quản trị viên, F5); đây chỉ truyền cấu hình của Lễ tân. Rộng tối đa 860 px như Figma.
export function ReceptionProfilePage() {
  return (
    <StackedProfilePage
      widthClass="max-w-[57.3333rem]"
      intro="Quản lý thông tin tài khoản của bạn"
      subtitleOf={subtitleOf}
      statusLabel={ACTIVE_LABEL}
      extraRowsOf={extraRowsOf}
      extraReadOnlyOf={extraReadOnlyOf}
    />
  );
}
