import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import { ChangePasswordForm, ROLE_LABELS } from '../../auth';
import { EditButton } from '../profile/profile-card';
import { isSessionEnded } from '../profile/profile-errors';
import { ReadOnlyField } from '../profile/profile-field';
import { ProfileForm } from '../profile/profile-form';
import { genderLabel, toDisplayDate } from '../profile/profile-format';
import {
  InfoRows,
  NOT_UPDATED_LABEL,
  ProfileRowsCard,
} from '../profile/profile-rows-card';
import { SavedNotice } from '../profile/profile-saved-notice';
import { ProfileSummaryCard } from '../profile/profile-summary-card';
import type { Profile } from '../profile/profile-types';
import { useProfile } from '../profile/use-profile';
import { useProfileEditing } from '../profile/use-profile-editing';

// Câu chữ của frame `503:2`, `504:2` (khác `432:2` của trang Bệnh nhân ở câu email: "chỉnh sửa", không phải "thay đổi")
const EMAIL_NOTE = 'Email dùng để đăng nhập, không thể chỉnh sửa.';
const BRANCH_NOTE =
  'Chi nhánh do quản trị viên phân công, không thể tự thay đổi.';
// `GET /profile` không trả trạng thái tài khoản; người gọi được API thì tài khoản đang hoạt động (guard kiểm, khoá giữa chừng ⇒ 401,
// PLAN H9), nên chữ này luôn đúng khi người dùng nhìn thấy trang (TRACKING F4-E)
const ACTIVE_LABEL = 'Đang hoạt động';

interface ReadyProps {
  profile: Profile;
}

// Phần có dữ liệu: thẻ đầu, thẻ thông tin (xem hoặc sửa tại chỗ). Trạng thái xem, sửa, lưu, focus nằm ở `useProfileEditing`.
function ReadyContent({
  profile,
  editing,
  saved,
  editButton,
  startEditing,
  handleSaved,
  handleCancel,
}: ReadyProps & ReturnType<typeof useProfileEditing>) {
  // Chi nhánh thiếu (API luôn trả cho Lễ tân; thiếu là hợp đồng lệch) không làm vỡ trang: chỉ còn "Lễ tân", ô chi nhánh "Chưa cập nhật"
  const branchName = profile.chiNhanh?.ten;
  const role = ROLE_LABELS.LeTan;
  return (
    <>
      <ProfileSummaryCard
        name={profile.hoTen}
        subtitle={branchName ? `${role} · ${branchName}` : role}
        statusLabel={ACTIVE_LABEL}
      />
      <div className="mt-5">
        <SavedNotice saved={saved} />
        {editing ? (
          <ProfileRowsCard title="Thông tin cá nhân">
            <ProfileForm
              profile={profile}
              onSaved={handleSaved}
              onCancel={handleCancel}
              layout="stack"
              emailNote={EMAIL_NOTE}
              extraReadOnly={
                <ReadOnlyField
                  label="Chi nhánh công tác"
                  value={branchName ?? NOT_UPDATED_LABEL}
                  note={BRANCH_NOTE}
                />
              }
            />
          </ProfileRowsCard>
        ) : (
          <ProfileRowsCard
            title="Thông tin cá nhân"
            action={
              <EditButton onClick={startEditing} buttonRef={editButton} />
            }
          >
            <InfoRows
              rows={[
                { label: 'Họ và tên', value: profile.hoTen },
                { label: 'Email', value: profile.email },
                { label: 'Số điện thoại', value: profile.soDienThoai },
                { label: 'Giới tính', value: genderLabel(profile.gioiTinh) },
                { label: 'Ngày sinh', value: toDisplayDate(profile.ngaySinh) },
                { label: 'Địa chỉ', value: profile.diaChi },
                { label: 'Chi nhánh công tác', value: branchName },
              ]}
            />
          </ProfileRowsCard>
        )}
      </div>
    </>
  );
}

// Trang "Thông tin cá nhân" của Lễ tân (patient F4; frame `503:2` xem, `504:2` sửa): thẻ đầu, thẻ thông tin xem dạng hàng rồi sửa tại chỗ bằng
// `ProfileForm` của F3 (email và chi nhánh chỉ đọc), và khối "Đổi mật khẩu" của auth. h1 luôn hiện, kể cả khi đang tải hay lỗi;
// khối đổi mật khẩu độc lập với hồ sơ. Rộng tối đa 860 px như Figma.
export function ReceptionProfilePage() {
  const { state, retry, replace } = useProfile();
  const editing = useProfileEditing(replace);

  return (
    <section className="max-w-[57.3333rem]">
      <h1 className="text-xl font-bold text-gray-900">Thông tin cá nhân</h1>
      <p className="pt-[0.125rem] text-sm text-gray-500">
        Quản lý thông tin tài khoản của bạn
      </p>

      <div className="mt-5">
        {state.status === 'loading' && <LoadingState />}
        {state.status === 'error' && !isSessionEnded(state.error) && (
          <ErrorState error={state.error} onRetry={retry} />
        )}
        {state.status === 'ready' && (
          <ReadyContent profile={state.profile} {...editing} />
        )}
      </div>

      <div className="mt-6">
        <ChangePasswordForm />
      </div>
    </section>
  );
}
