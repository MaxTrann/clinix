import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileText } from 'lucide-react';
import {
  AdminTable,
  useAdminScope,
  type AdminTableColumn,
} from '../../../admin';
import { ErrorState } from '../../../../shared/ui/error-state';
import { LoadingState } from '../../../../shared/ui/loading-state';
import {
  ADMIN_LEAVE_PAGE_SIZE,
  listAdminLeaveRequests,
  type AdminLeaveItem,
  type AdminLeavePage,
  type AdminLeaveQuery,
} from '../../api/admin-leave-api';
import { LeaveToast } from '../../leave/leave-toast';
import {
  useLoad,
  useReceptionDoctors,
} from '../../reception/use-reception-data';
import {
  formatLeaveKindLabel,
  formatLeaveTime,
  formatSentDate,
} from './approvals-format';
import { LeaveDetailDrawer } from './leave-detail-drawer';
import { ALL, EMPTY_FILTERS, type ApprovalFilters } from './approval-filters';
import { LeaveApprovalFilters } from './leave-approval-filters';
import { LeaveStats } from './leave-stats';
import { RejectDialog } from './reject-dialog';
import { StatusBadge } from './status-badge';

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_MIN_LENGTH = 2;
const REJECTED_MESSAGE = 'Đã từ chối yêu cầu nghỉ phép.';

// Tab "Yêu cầu nghỉ phép" của trang Duyệt yêu cầu (doctor F8; Figma `582:2` Toàn hệ thống, `623:2` Chi nhánh, `517:2` rỗng, `583:2` chi tiết, `584:2` Từ chối).
// Chỉ xem và Từ chối: KHÔNG có nút Duyệt (F9 làm sau khi B15 merge, Q26; WA-16). Phạm vi chi nhánh do server ép: Admin Chi nhánh thấy chip cố định.
export function LeaveApprovalPage() {
  const scope = useAdminScope();
  const isBranchAdmin = scope.phamVi === 'ChiNhanh';
  const doctors = useReceptionDoctors('admin');
  const [filters, setFilters] = useState<ApprovalFilters>(EMPTY_FILTERS);
  // `q` đã trì hoãn: gõ tới đâu cũng chỉ gọi server sau khi ngừng gõ một lúc
  const [debouncedQ, setDebouncedQ] = useState('');
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [detailItem, setDetailItem] = useState<AdminLeaveItem | null>(null);
  const [rejectItem, setRejectItem] = useState<AdminLeaveItem | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Nút đã mở ngăn kéo/hộp: nhận lại focus khi đóng
  const opener = useRef<HTMLElement | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedQ(filters.q.trim()),
      SEARCH_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [filters.q]);

  const branches = useMemo(
    () =>
      doctors.state.status === 'success'
        ? [
            ...new Map(
              doctors.state.data.map((d) => [
                d.chiNhanh.chiNhanhId,
                d.chiNhanh,
              ]),
            ).values(),
          ]
        : [],
    [doctors.state],
  );

  const dateOrderInvalid =
    filters.tuNgayGui !== '' &&
    filters.denNgayGui !== '' &&
    filters.denNgayGui < filters.tuNgayGui;

  const query = useMemo<AdminLeaveQuery>(
    () => ({
      page,
      pageSize: ADMIN_LEAVE_PAGE_SIZE,
      trangThai: filters.trangThai === ALL ? undefined : filters.trangThai,
      // Server chỉ nhận 2–100 ký tự (Q38): ngắn hơn thì coi như chưa tìm
      q:
        debouncedQ.length >= SEARCH_MIN_LENGTH
          ? debouncedQ.slice(0, 100)
          : undefined,
      tuNgayGui: filters.tuNgayGui || undefined,
      // Khoảng ngày ngược thì không gửi "đến ngày" (server sẽ báo 400); ô vẫn hiện lỗi cho người dùng sửa
      denNgayGui: dateOrderInvalid
        ? undefined
        : filters.denNgayGui || undefined,
      chiNhanhId:
        !isBranchAdmin && filters.chiNhanhId !== ALL
          ? filters.chiNhanhId
          : undefined,
    }),
    [page, filters, debouncedQ, dateOrderInvalid, isBranchAdmin],
  );
  const list = useLoad<AdminLeavePage>(
    (signal) => listAdminLeaveRequests(query, signal),
    JSON.stringify([query, refresh]),
  );

  // Đổi bộ lọc thì về trang 1
  function changeFilters(next: ApprovalFilters) {
    setFilters(next);
    setPage(1);
  }

  function openReject(item: AdminLeaveItem) {
    setDetailItem(null);
    setRejectItem(item);
  }

  const columns: AdminTableColumn<AdminLeaveItem>[] = [
    {
      id: 'bacSi',
      header: 'Bác sĩ',
      width: '26%',
      cell: (item) => (
        <div className="flex flex-col items-start gap-1">
          <button
            type="button"
            onClick={(event) => {
              opener.current = event.currentTarget;
              setDetailItem(item);
            }}
            className="text-left font-semibold text-gray-900 hover:text-brand-strong hover:underline"
          >
            {item.bacSi.hoTen}
          </button>
          <span className="rounded-md bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand-strong">
            {item.chuyenKhoa.ten}
          </span>
          <span className="text-xs text-gray-500">{item.chiNhanh.ten}</span>
        </div>
      ),
    },
    {
      id: 'loai',
      header: 'Loại nghỉ',
      width: '12%',
      cell: formatLeaveKindLabel,
    },
    {
      id: 'thoiGian',
      header: 'Thời gian',
      width: '24%',
      cell: formatLeaveTime,
    },
    {
      id: 'ngayGui',
      header: 'Ngày gửi',
      width: '14%',
      cell: (item) => formatSentDate(item.thoiDiemTao),
    },
    {
      id: 'trangThai',
      header: 'Trạng thái',
      width: '12%',
      cell: (item) => <StatusBadge status={item.trangThai} />,
    },
    {
      id: 'thaoTac',
      header: 'Thao tác',
      width: '12%',
      cell: (item) =>
        item.trangThai === 'ChoDuyet' ? (
          <button
            type="button"
            aria-label={`Từ chối yêu cầu của ${item.bacSi.hoTen}`}
            onClick={(event) => {
              opener.current = event.currentTarget;
              setRejectItem(item);
            }}
            className="min-h-9 rounded-lg border border-danger-line bg-white px-3 text-xs font-semibold text-danger-strong hover:bg-danger-soft"
          >
            Từ chối
          </button>
        ) : null,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {list.state.status === 'success' && (
        <LeaveStats stats={list.state.data.thongKe} />
      )}

      <LeaveApprovalFilters
        filters={filters}
        onChange={changeFilters}
        branches={isBranchAdmin ? undefined : branches}
        fixedBranchName={isBranchAdmin ? scope.chiNhanh.ten : undefined}
        dateOrderInvalid={dateOrderInvalid}
      />

      {list.state.status === 'loading' && (
        <LoadingState message="Đang tải yêu cầu nghỉ phép…" />
      )}
      {list.state.status === 'error' && (
        <ErrorState error={list.state.error} onRetry={list.retry} />
      )}
      {list.state.status === 'success' &&
        (list.state.data.total === 0 ? (
          <EmptyApprovals />
        ) : (
          <AdminTable
            label="Yêu cầu nghỉ phép của bác sĩ"
            columns={columns}
            rows={list.state.data.items}
            getRowKey={(item) => item.yeuCauNghiPhepId}
            page={page}
            pageSize={ADMIN_LEAVE_PAGE_SIZE}
            total={list.state.data.total}
            onPageChange={setPage}
            emptyMessage="Không có yêu cầu nào"
          />
        ))}

      {detailItem !== null && (
        <LeaveDetailDrawer
          item={detailItem}
          onClose={() => setDetailItem(null)}
          onReject={openReject}
        />
      )}
      {rejectItem !== null && (
        <RejectDialog
          item={rejectItem}
          returnFocusRef={opener}
          onClose={() => setRejectItem(null)}
          onRejected={() => {
            setRejectItem(null);
            setRefresh((value) => value + 1);
            setToast(REJECTED_MESSAGE);
          }}
          onGone={() => setRefresh((value) => value + 1)}
        />
      )}
      {toast !== null && (
        <LeaveToast message={toast} onDismiss={dismissToast} />
      )}
    </div>
  );
}

// Trạng thái rỗng (Figma `517:2`): không có yêu cầu nào theo bộ lọc hiện tại
function EmptyApprovals() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-gray-100 bg-white px-4 py-12 text-gray-500 shadow-sm">
      <FileText aria-hidden="true" className="size-7 text-gray-400" />
      <p role="status" className="text-sm">
        Không có yêu cầu nào
      </p>
    </div>
  );
}
