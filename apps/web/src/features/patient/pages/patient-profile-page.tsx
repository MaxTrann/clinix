import { CircleCheck } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import { ChangePasswordForm } from '../../auth';
import { ProfileCard } from '../profile/profile-card';
import { isSessionEnded, SAVED_MESSAGE } from '../profile/profile-errors';
import { ProfileForm } from '../profile/profile-form';
import { ProfileView } from '../profile/profile-view';
import type { Profile } from '../profile/profile-types';
import { useProfile } from '../profile/use-profile';

// Chữ success trên success-soft đạt 4,72:1 (ADR 0004)
const SUCCESS_BOX =
  'mb-3 flex items-start gap-2 rounded-xl border border-success-line bg-success-soft p-3 text-sm text-success';
const SECTION_HEADING = 'text-base font-semibold text-gray-600';

// Trang "Hồ sơ người khám" (patient F3; frame `416:2`, `432:2`): khối Bản thân (xem, rồi sửa tại chỗ) và khối "Bảo mật tài khoản".
// Khối "Người thân" đến ở F6. h1 giữ đúng chữ vì nhiều test tìm tiêu đề này; luôn hiện, kể cả khi đang tải hay lỗi.
export function PatientProfilePage() {
  const { state, retry, replace } = useProfile();
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  // Sau khi lưu hoặc "Hủy" nút "Chỉnh sửa" được dựng lại, rồi mới focus được
  const refocusEdit = useRef(false);
  const selfId = useId();
  const securityId = useId();

  useEffect(() => {
    if (!editing && refocusEdit.current) {
      refocusEdit.current = false;
      editButton.current?.focus();
    }
  }, [editing]);

  function startEditing() {
    setSaved(false);
    setEditing(true);
  }

  function handleSaved(profile: Profile) {
    replace(profile);
    refocusEdit.current = true;
    setSaved(true);
    setEditing(false);
  }

  function handleCancel() {
    refocusEdit.current = true;
    setEditing(false);
  }

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
              {/* Vùng thông báo có sẵn trong DOM để người đọc màn hình nghe được câu thành công; ở lại tới khi sửa lại hoặc rời trang */}
              <div role="status">
                {saved && (
                  <p className={SUCCESS_BOX}>
                    <CircleCheck
                      className="mt-0.5 size-4 shrink-0"
                      aria-hidden="true"
                    />
                    <span>{SAVED_MESSAGE}</span>
                  </p>
                )}
              </div>
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
