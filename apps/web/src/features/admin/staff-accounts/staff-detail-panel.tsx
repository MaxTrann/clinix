import type { ReactNode } from 'react';
import type { RemoteState } from '../../../shared/hooks/use-remote';
import { LoadingState } from '../../../shared/ui/loading-state';
import { formatBirthDate } from '../account-common/account-format';
import { AccountLoadError } from '../account-common/account-load-error';
import type { AdminScopeKind } from '../account-common/account-types';
import { StaffNoticeBox } from './staff-notice-box';
import {
  describeActivationLink,
  formatAppointmentStatus,
  formatShift,
  formatSlotTime,
  hiddenCount,
  staffActions,
  staffFields,
} from './staff-rules';
import type {
  DependentList,
  DoctorDependents,
  StaffAccount,
  StaffNotice,
} from './staff-types';

// Nội dung panel chi tiết Nhân sự (admin F8). Thành phần KHÔNG giữ trạng thái: dữ liệu, thông báo kết quả và hộp xác nhận nằm ở trang, vì panel tạm ẩn
// khi hộp xác nhận mở (hai hộp cùng mở sẽ tranh focus và phím Esc: TRACKING admin 9A.12 mục 1.5), ẩn rồi hiện lại không được tải lại.
// Các dòng do `staffFields` quyết định (danh sách cho phép), nút do `staffActions` quyết định theo phạm vi, vai trò, trạng thái.
// Họ tên, email, SĐT là chữ tự do: chỉ in như văn bản thường, KHÔNG `dangerouslySetInnerHTML`.

interface StaffDetailBodyProps {
  scope: AdminScopeKind;
  state: RemoteState<StaffAccount | null>;
  notice: StaffNotice | null;
  /** Việc cần bố trí lại sau khi khoá Bác sĩ (Q28); `null` khi chưa khoá hay không phải Bác sĩ. */
  dependents: DoctorDependents | null;
  pending: boolean;
  onRetry: () => void;
  onLock: () => void;
  onUnlock: () => void;
  onResend: () => void;
}

const BUTTON =
  'rounded-[9.375px] border bg-white px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60';

export function StaffDetailBody({
  scope,
  state,
  notice,
  dependents,
  pending,
  onRetry,
  onLock,
  onUnlock,
  onResend,
}: StaffDetailBodyProps) {
  return (
    <div className="flex flex-col gap-4 text-sm text-gray-700">
      {notice !== null && <StaffNoticeBox notice={notice} />}
      {state.status === 'loading' && (
        <LoadingState message="Đang tải chi tiết tài khoản…" />
      )}
      {state.status === 'error' && (
        <AccountLoadError error={state.error} onRetry={onRetry} />
      )}
      {state.status === 'ready' && state.data !== null && (
        <StaffDetailFields
          scope={scope}
          account={state.data}
          dependents={dependents}
          pending={pending}
          onLock={onLock}
          onUnlock={onUnlock}
          onResend={onResend}
        />
      )}
    </div>
  );
}

function StaffDetailFields({
  scope,
  account,
  dependents,
  pending,
  onLock,
  onUnlock,
  onResend,
}: {
  scope: AdminScopeKind;
  account: StaffAccount;
  dependents: DoctorDependents | null;
  pending: boolean;
  onLock: () => void;
  onUnlock: () => void;
  onResend: () => void;
}) {
  const actions = staffActions(scope, account);
  const awaiting = account.trangThai === 'ChoKichHoat';
  const link = describeActivationLink(account.lienKetKichHoat);
  return (
    <>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        {staffFields(account).map((row) => (
          <div key={row.id} className="contents">
            <dt className="text-gray-500">{row.label}</dt>
            <dd className="break-words">{row.value}</dd>
          </div>
        ))}
      </dl>
      {awaiting && (
        <section
          aria-label="Liên kết kích hoạt"
          className="flex flex-col items-start gap-2 rounded-xl border border-warning-line bg-warning-soft px-3 py-2 text-warning"
        >
          <p>{link.text}</p>
          {actions.canResend && (
            <button
              type="button"
              className={`${BUTTON} border-warning-line text-warning`}
              disabled={pending}
              onClick={onResend}
            >
              Gửi lại email kích hoạt
            </button>
          )}
        </section>
      )}
      {(actions.canLock || actions.canUnlock) && (
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
        </div>
      )}
      {dependents !== null && <DependentsBlock dependents={dependents} />}
    </>
  );
}

// Danh sách chỉ ĐỂ ĐỌC: hệ thống không tự huỷ hay đổi lịch (Q28). Tối đa 50 mục mỗi danh sách (API cắt), phần còn lại báo bằng "và N mục khác".
function DependentsBlock({ dependents }: { dependents: DoctorDependents }) {
  const { lichHen, caLamViec } = dependents;
  const empty = lichHen.tong === 0 && caLamViec.tong === 0;
  return (
    <section
      role="status"
      aria-label="Việc cần bố trí lại"
      className="flex flex-col gap-3 rounded-xl border border-warning-line bg-warning-soft px-3 py-2 text-warning"
    >
      <h3 className="font-semibold">Việc cần bố trí lại</h3>
      {empty && <p>Không có lịch hẹn hay ca làm việc nào cần bố trí lại.</p>}
      {lichHen.tong > 0 && (
        <DependentGroup
          title={`${lichHen.tong} lịch hẹn đang hoạt động`}
          list={lichHen}
          renderItem={(item) => (
            <li key={item.lichHenId} className="flex flex-wrap gap-x-2">
              <span className="font-medium">{item.maLichHen}</span>
              <span>{formatSlotTime(item.thoiGian)}</span>
              <span>{formatAppointmentStatus(item.trangThai)}</span>
            </li>
          )}
        />
      )}
      {caLamViec.tong > 0 && (
        <DependentGroup
          title={`${caLamViec.tong} ca làm việc từ hôm nay`}
          list={caLamViec}
          renderItem={(item) => (
            <li key={item.lichLamViecId} className="flex flex-wrap gap-x-2">
              <span>{formatBirthDate(item.ngay)}</span>
              <span>{formatShift(item.ca)}</span>
            </li>
          )}
        />
      )}
    </section>
  );
}

function DependentGroup<T>({
  title,
  list,
  renderItem,
}: {
  title: string;
  list: DependentList<T>;
  renderItem: (item: T) => ReactNode;
}) {
  const more = hiddenCount(list);
  return (
    <div>
      <p className="font-medium">{title}</p>
      <ul className="mt-1 flex max-h-60 flex-col gap-1 overflow-y-auto">
        {list.muc.map(renderItem)}
        {more > 0 && <li>và {more} mục khác</li>}
      </ul>
    </div>
  );
}
