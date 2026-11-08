import type { ReactNode } from 'react';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import { ChangePasswordForm } from '../../auth';
import { EditButton } from './profile-card';
import type { InfoCell } from './profile-card';
import { isSessionEnded } from './profile-errors';
import { ProfileForm } from './profile-form';
import { genderLabel, toDisplayDate } from './profile-format';
import { InfoRows, ProfileRowsCard } from './profile-rows-card';
import { SavedNotice } from './profile-saved-notice';
import { ProfileSummaryCard } from './profile-summary-card';
import type { Profile } from './profile-types';
import { useProfile } from './use-profile';
import { useProfileEditing } from './use-profile-editing';

// Câu chữ của frame `503:2`, `504:2` (khác `432:2` của trang Bệnh nhân ở câu email: "chỉnh sửa", không phải "thay đổi")
const EMAIL_NOTE = 'Email dùng để đăng nhập, không thể chỉnh sửa.';

export interface StackedProfilePageProps {
  // Lớp Tailwind bề rộng tối đa của `section`, viết NGUYÊN VĂN ở nơi gọi để bộ quét của Tailwind thấy (Lễ tân 860 px, Quản trị viên 630 px)
  widthClass: string;
  // Phụ đề dưới h1
  intro: string;
  // Dòng phụ của thẻ đầu
  subtitleOf: (profile: Profile) => string;
  // Nhãn trạng thái dưới dòng phụ; không truyền thì không có nhãn (Figma Quản trị viên không vẽ)
  statusLabel?: string;
  // Hàng chỉ đọc thêm ở cuối chế độ xem (chi nhánh công tác của Lễ tân; phạm vi và chi nhánh quản trị của Quản trị viên)
  extraRowsOf: (profile: Profile) => readonly InfoCell[];
  // Khối chỉ đọc đặt NGAY SAU ô email trong form sửa; phải là khối chữ, không phải ô nhập (web không cho sửa chúng)
  extraReadOnlyOf: (profile: Profile) => ReactNode;
}

type ReadyProps = Pick<
  StackedProfilePageProps,
  'subtitleOf' | 'statusLabel' | 'extraRowsOf' | 'extraReadOnlyOf'
> & { profile: Profile };

// Phần có dữ liệu: thẻ đầu, thẻ thông tin (xem hoặc sửa tại chỗ). Trạng thái xem, sửa, lưu, focus nằm ở `useProfileEditing`.
function ReadyContent({
  profile,
  subtitleOf,
  statusLabel,
  extraRowsOf,
  extraReadOnlyOf,
  editing,
  saved,
  editButton,
  startEditing,
  handleSaved,
  handleCancel,
}: ReadyProps & ReturnType<typeof useProfileEditing>) {
  return (
    <>
      <ProfileSummaryCard
        name={profile.hoTen}
        subtitle={subtitleOf(profile)}
        statusLabel={statusLabel}
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
              extraReadOnly={extraReadOnlyOf(profile)}
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
                ...extraRowsOf(profile),
              ]}
            />
          </ProfileRowsCard>
        )}
      </div>
    </>
  );
}

// Trang "Thông tin cá nhân" dạng thẻ đầu + thẻ hàng xem rồi sửa tại chỗ bằng `ProfileForm` (một cột) + khối "Đổi mật khẩu" của auth, dùng
// chung cho Lễ tân (patient F4; frame `503:2`, `504:2`) và Quản trị viên (patient F5; Q6, frame `510:2`, `620:2`). Rút nguyên văn từ trang
// Lễ tân (TRACKING F5-C): hai trang chỉ khác bề rộng, phụ đề, dòng phụ, nhãn trạng thái và các hàng chỉ đọc. h1 luôn hiện, kể cả khi đang
// tải hay lỗi; khối đổi mật khẩu độc lập với hồ sơ.
export function StackedProfilePage({
  widthClass,
  intro,
  ...readyProps
}: StackedProfilePageProps) {
  const { state, retry, replace } = useProfile();
  const editing = useProfileEditing(replace);

  return (
    <section className={widthClass}>
      <h1 className="text-xl font-bold text-gray-900">Thông tin cá nhân</h1>
      <p className="pt-[0.125rem] text-sm text-gray-500">{intro}</p>

      <div className="mt-5">
        {state.status === 'loading' && <LoadingState />}
        {state.status === 'error' && !isSessionEnded(state.error) && (
          <ErrorState error={state.error} onRetry={retry} />
        )}
        {state.status === 'ready' && (
          <ReadyContent profile={state.profile} {...readyProps} {...editing} />
        )}
      </div>

      <div className="mt-6">
        <ChangePasswordForm />
      </div>
    </section>
  );
}
