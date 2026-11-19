import type { RemoteState } from '../../../shared/hooks/use-remote';
import { LoadingState } from '../../../shared/ui/loading-state';
import { AccountLoadError } from '../account-common/account-load-error';
import { accountActions, visibleFields } from '../account-common/account-rules';
import type {
  AdminScopeKind,
  PatientAccount,
} from '../account-common/account-types';
import type { ActionNotice } from '../account-common/use-account-action';

// Nội dung panel chi tiết Bệnh nhân (admin F9). Thành phần KHÔNG giữ trạng thái: dữ liệu, thông báo kết quả và các hộp xác nhận nằm ở trang,
// vì panel tạm ẩn khi hộp xác nhận mở (hai hộp cùng mở sẽ tranh focus và phím Esc: TRACKING 9A.12 mục 1.5), ẩn rồi hiện lại không được tải lại.
// Các dòng chi tiết do `visibleFields` quyết định theo phạm vi (Chi nhánh đúng sáu dòng, Q26); nút do `accountActions` quyết định (Chi nhánh không có nút nào).
// Họ tên, email, địa chỉ là chữ tự do: chỉ in như văn bản thường, KHÔNG `dangerouslySetInnerHTML`.

interface PatientDetailBodyProps {
  scope: AdminScopeKind;
  state: RemoteState<PatientAccount | null>;
  notice: ActionNotice | null;
  pending: boolean;
  onRetry: () => void;
  onLock: () => void;
  onUnlock: () => void;
  onUnlockNoShow: () => void;
}

const BUTTON =
  'rounded-[9.375px] border bg-white px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60';

export function PatientDetailBody({
  scope,
  state,
  notice,
  pending,
  onRetry,
  onLock,
  onUnlock,
  onUnlockNoShow,
}: PatientDetailBodyProps) {
  return (
    <div className="flex flex-col gap-4 text-sm text-gray-700">
      {notice !== null && (
        <p
          role={notice.kind === 'error' ? 'alert' : 'status'}
          className={
            notice.kind === 'error'
              ? 'rounded-xl border border-danger-line bg-danger-soft px-3 py-2 text-danger-strong'
              : 'rounded-xl border border-success-line bg-success-soft px-3 py-2 text-success'
          }
        >
          {notice.text}
        </p>
      )}
      {state.status === 'loading' && (
        <LoadingState message="Đang tải chi tiết tài khoản…" />
      )}
      {state.status === 'error' && (
        <AccountLoadError error={state.error} onRetry={onRetry} />
      )}
      {state.status === 'ready' && state.data !== null && (
        <PatientDetailFields
          scope={scope}
          account={state.data}
          pending={pending}
          onLock={onLock}
          onUnlock={onUnlock}
          onUnlockNoShow={onUnlockNoShow}
        />
      )}
    </div>
  );
}

function PatientDetailFields({
  scope,
  account,
  pending,
  onLock,
  onUnlock,
  onUnlockNoShow,
}: {
  scope: AdminScopeKind;
  account: PatientAccount;
  pending: boolean;
  onLock: () => void;
  onUnlock: () => void;
  onUnlockNoShow: () => void;
}) {
  const actions = accountActions(scope, account);
  const hasAction =
    actions.canLock || actions.canUnlock || actions.canUnlockNoShow;
  return (
    <>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        {visibleFields(scope, account).map((row) => (
          <div key={row.id} className="contents">
            <dt className="text-gray-500">{row.label}</dt>
            <dd className="break-words">{row.value}</dd>
          </div>
        ))}
      </dl>
      {hasAction && (
        <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-4">
          {actions.canLock && (
            <button
              type="button"
              className={`${BUTTON} border-danger-line text-danger-strong`}
              disabled={pending}
              onClick={onLock}
            >
              Khoá tài khoản
            </button>
          )}
          {actions.canUnlock && (
            <button
              type="button"
              className={`${BUTTON} border-success-line text-success`}
              disabled={pending}
              onClick={onUnlock}
            >
              Mở khoá tài khoản
            </button>
          )}
          {actions.canUnlockNoShow && (
            <button
              type="button"
              className={`${BUTTON} border-warning-line text-warning`}
              disabled={pending}
              onClick={onUnlockNoShow}
            >
              Mở khoá no-show
            </button>
          )}
        </div>
      )}
      {scope !== 'ToanHeThong' && (
        <p
          role="note"
          className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600"
        >
          Bạn chỉ có quyền xem. Chỉ Admin toàn hệ thống mới khoá hoặc mở khoá
          được tài khoản bệnh nhân.
        </p>
      )}
    </>
  );
}
