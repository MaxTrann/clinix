import { CircleAlert, Plus } from 'lucide-react';
import { useAdminScope } from '../../../admin';
import { countPendingLeaveRequests } from '../../api/reception-api';
import { ScheduleBoard } from '../../reception/schedule-board';
import { useLoad } from '../../reception/use-reception-data';

// Nút "+ Phân công ca" và nút "Xem yêu cầu" dẫn tới trang chưa có (hộp Phân công: doctor F7; trang Duyệt yêu cầu: doctor F8). Dùng `aria-disabled`
// thay cho `disabled` để trình đọc màn hình vẫn đọc được lý do và phím Tab vẫn dừng ở đó; bấm không làm gì.
const DEFERRED = {
  'aria-disabled': true,
  title: 'Chưa được triển khai',
  onClick: (event: { preventDefault: () => void }) => event.preventDefault(),
} as const;

// Trang "Lịch làm việc bác sĩ" của Quản trị viên (doctor F6; Figma `515:2` Toàn hệ thống, `622:2` Chi nhánh; WA-01, WA-14). Toàn hệ thống: lọc chi nhánh,
// tên chi nhánh ở từng bác sĩ. Chi nhánh: chip chi nhánh cố định (server ép phạm vi), banner số yêu cầu nghỉ chờ duyệt. Ô trống có "+" mờ; hộp Phân công
// và Gỡ ca là F7.
export function AdminSchedulePage() {
  const scope = useAdminScope();
  const isBranchAdmin = scope.phamVi === 'ChiNhanh';
  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Lịch làm việc bác sĩ
          </h1>
          {isBranchAdmin && (
            <p className="mt-1">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-300 bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-brand-strong">
                <span
                  aria-hidden="true"
                  className="size-1.5 rounded-full bg-brand-strong"
                />
                {scope.chiNhanh.ten}
              </span>
            </p>
          )}
        </div>
        <button
          type="button"
          {...DEFERRED}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-gray-200 px-5 text-sm font-semibold text-gray-600"
        >
          <Plus aria-hidden="true" className="size-4" />
          Phân công ca
          <span className="sr-only"> (chưa được triển khai)</span>
        </button>
      </header>

      {isBranchAdmin && <PendingLeaveBanner />}

      <ScheduleBoard
        source="admin"
        allBranches={!isBranchAdmin}
        showAssignPlus
      />
    </section>
  );
}

// Banner vàng của Admin Chi nhánh (Figma `622:2`; WA-14): chỉ hiện khi có yêu cầu chờ duyệt; lỗi tải thì ẩn (chỉ là thông tin phụ, không chặn lưới).
function PendingLeaveBanner() {
  const { state } = useLoad<number>(
    (signal) => countPendingLeaveRequests(signal).catch(() => 0),
    'pending-leave',
  );
  if (state.status !== 'success' || state.data === 0) return null;
  return (
    <p
      role="status"
      className="flex flex-wrap items-center gap-2 rounded-xl border border-warning-line bg-warning-soft px-4 py-3 text-sm text-gray-900"
    >
      <CircleAlert aria-hidden="true" className="size-4 text-warning" />
      <span>
        Có <strong>{state.data}</strong> yêu cầu nghỉ chờ duyệt trong phạm vi
        của bạn.
      </span>
      <button
        type="button"
        {...DEFERRED}
        className="ml-auto text-xs font-semibold text-warning underline"
      >
        Xem yêu cầu
        <span className="sr-only"> (chưa được triển khai)</span>
      </button>
    </p>
  );
}
