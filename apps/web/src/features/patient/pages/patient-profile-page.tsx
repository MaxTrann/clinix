import { useId } from 'react';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import { ChangePasswordForm } from '../../auth';
import { ProfileCard } from '../profile/profile-card';
import { isSessionEnded } from '../profile/profile-errors';
import { ProfileForm } from '../profile/profile-form';
import { SavedNotice } from '../profile/profile-saved-notice';
import { ProfileView } from '../profile/profile-view';
import { useProfile } from '../profile/use-profile';
import { useProfileEditing } from '../profile/use-profile-editing';
import { RelativesSection } from '../relatives/relatives-section';

const SECTION_HEADING = 'text-base font-semibold text-gray-600';

// Trang "Hồ sơ người khám" (patient F3, F6; frame `416:2`, `432:2`): khối Bản thân (xem, rồi sửa tại chỗ), khối "Người thân" (F6, tải
// độc lập) và khối "Bảo mật tài khoản". h1 giữ đúng chữ vì nhiều test tìm tiêu đề này; luôn hiện, kể cả khi đang tải hay lỗi.
export function PatientProfilePage() {
  const { state, retry, replace } = useProfile();
  // Máy trạng thái xem, sửa, lưu, focus dùng chung với trang Lễ tân (patient F4)
  const {
    editing,
    saved,
    editButton,
    startEditing,
    handleSaved,
    handleCancel,
  } = useProfileEditing(replace);
  const selfId = useId();
  const securityId = useId();

  return (
    <section>
      <h1 className="text-[1.3333rem] leading-normal font-bold text-gray-900">
        Hồ sơ người khám
      </h1>
      <p className="pt-[0.2667rem] text-[0.8667rem] leading-normal text-gray-500">
        Quản lý thông tin cá nhân và hồ sơ người thân.
      </p>

      <section aria-labelledby={selfId}>
        <h2 id={selfId} className={`pt-[1.3333rem] ${SECTION_HEADING}`}>
          Bản thân
        </h2>
        <div className="mt-[0.8rem]">
          {state.status === 'loading' && <LoadingState />}
          {state.status === 'error' && !isSessionEnded(state.error) && (
            <ErrorState error={state.error} onRetry={retry} />
          )}
          {state.status === 'ready' && (
            <>
              <SavedNotice saved={saved} />
              {editing ? (
                <ProfileCard name={state.profile.hoTen} badge="Bản thân">
                  <ProfileForm
                    profile={state.profile}
                    onSaved={handleSaved}
                    onCancel={handleCancel}
                  />
                </ProfileCard>
              ) : (
                <ProfileView
                  profile={state.profile}
                  onEdit={startEditing}
                  editButtonRef={editButton}
                />
              )}
            </>
          )}
        </div>
      </section>

      <RelativesSection />

      <section aria-labelledby={securityId} className="mt-[2.1333rem]">
        <h2 id={securityId} className={SECTION_HEADING}>
          Bảo mật tài khoản
        </h2>
        <div className="mt-3">
          <ChangePasswordForm />
        </div>
      </section>
    </section>
  );
}
