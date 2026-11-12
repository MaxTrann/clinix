import { useCallback, useMemo, useRef, useState } from 'react';
import { CircleAlert, Plus } from 'lucide-react';
import { Link } from 'react-router';
import { useAdminScope } from '../../../admin';
import { ADMIN_LEAVE_APPROVALS_PATH } from '../approvals/approvals-paths';
import {
  countPendingLeaveRequests,
  type ReceptionDoctor,
} from '../../api/reception-api';
import { LeaveToast } from '../../leave/leave-toast';
import { ScheduleBoard } from '../../reception/schedule-board';
import {
  useLoad,
  useReceptionDoctors,
} from '../../reception/use-reception-data';
import { AssignDialog } from './assign/assign-dialog';
import {
  EMPTY_ASSIGN_FORM,
  prefillFromCell,
  type AssignFormValues,
} from './assign/assign-form';
import { RemoveShiftAction } from './assign/remove-shift-action';

// Trang "Lịch làm việc bác sĩ" của Quản trị viên (doctor F6 lưới, F7 phân công; Figma `515:2` Toàn hệ thống, `622:2` Chi nhánh, `516:2` hộp Phân công).
// Toàn hệ thống: lọc chi nhánh, tên chi nhánh ở từng bác sĩ. Chi nhánh: chip chi nhánh cố định (server ép phạm vi), banner số yêu cầu nghỉ chờ duyệt.
// "Phân công ca" và ô "+" mở hộp Phân công (ô "+" điền sẵn bác sĩ/ngày/ca, WA-05); "Gỡ ca" nằm ở ngăn kéo "Chi tiết ca" (WA-06).
export function AdminSchedulePage() {
  const scope = useAdminScope();
  const isBranchAdmin = scope.phamVi === 'ChiNhanh';
  const doctors = useReceptionDoctors('admin');
  const [assignInitial, setAssignInitial] = useState<AssignFormValues | null>(
    null,
  );
  const [toast, setToast] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  // Phần tử đã mở hộp (nút "Phân công ca" hoặc ô "+"): nhận lại focus khi đóng
  const opener = useRef<HTMLElement | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  // Bác sĩ ngừng hoạt động không phân công được (Q11): ẩn khỏi danh sách chọn
  const assignable = useMemo<ReceptionDoctor[]>(
    () =>
      doctors.state.status === 'success'
        ? doctors.state.data.filter((d) => !d.ngungHoatDong)
        : [],
    [doctors.state],
  );
  const branches = useMemo(
    () => [
      ...new Map(
        assignable.map((d) => [d.chiNhanh.chiNhanhId, d.chiNhanh]),
      ).values(),
    ],
    [assignable],
  );
  const ready = doctors.state.status === 'success';

  function openAssign(initial: AssignFormValues, trigger: HTMLElement) {
    if (!ready) return;
    opener.current = trigger;
    setAssignInitial(initial);
  }

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
          disabled={!ready}
          onClick={(event) =>
            openAssign(EMPTY_ASSIGN_FORM, event.currentTarget)
          }
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-strong px-5 text-sm font-semibold text-white transition-colors hover:bg-cyan-800 disabled:bg-gray-200 disabled:text-gray-500"
        >
          <Plus aria-hidden="true" className="size-4" />
          Phân công ca
        </button>
      </header>

      {isBranchAdmin && <PendingLeaveBanner />}

      <ScheduleBoard
        source="admin"
        allBranches={!isBranchAdmin}
        refreshToken={refresh}
        onAssignCell={(cell, trigger) =>
          openAssign(prefillFromCell(cell), trigger)
        }
        shiftActions={({ shift, close, refresh: reload }) => (
          <RemoveShiftAction
            lichLamViecId={shift.lichLamViecId}
            ngay={shift.ngay}
            onRemoved={() => {
              close();
              reload();
              setToast('Đã gỡ ca làm việc.');
            }}
            onGone={() => {
              close();
              reload();
            }}
          />
        )}
      />

      {assignInitial !== null && (
        <AssignDialog
          doctors={assignable}
          branches={isBranchAdmin ? undefined : branches}
          fixedBranchName={isBranchAdmin ? scope.chiNhanh.ten : undefined}
          initial={assignInitial}
          returnFocusRef={opener}
          onClose={() => setAssignInitial(null)}
          onAssigned={(result) => {
            setAssignInitial(null);
            setRefresh((value) => value + 1);
            setToast(`Đã phân công ${result.soCa} ca làm việc.`);
          }}
        />
      )}
      {toast !== null && (
        <LeaveToast message={toast} onDismiss={dismissToast} />
      )}
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
      <Link
        to={ADMIN_LEAVE_APPROVALS_PATH}
        className="ml-auto text-xs font-semibold text-warning underline"
      >
        Xem yêu cầu
      </Link>
    </p>
  );
}
