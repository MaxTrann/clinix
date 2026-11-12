import { AdminDetailPanel } from '../../../admin';
import { LoadingState } from '../../../../shared/ui/loading-state';
import { ErrorState } from '../../../../shared/ui/error-state';
import {
  getAdminLeaveRequest,
  type AdminLeaveDetail,
  type AdminLeaveItem,
} from '../../api/admin-leave-api';
import { formatVnDateTime } from '../../leave/leave-format';
import { useLoad } from '../../reception/use-reception-data';
import {
  formatLeaveKindLabel,
  formatLeaveTime,
  formatSentDate,
} from './approvals-format';
import { StatusBadge } from './status-badge';

interface DrawerProps {
  item: AdminLeaveItem;
  onClose: () => void;
  onReject: (item: AdminLeaveItem) => void;
}

// Ngăn kéo "Chi tiết yêu cầu" (Figma `583:2`; WA-08). Phần đầu lấy từ dòng đã có; lý do nghỉ chỉ có ở chi tiết nên gọi `GET /admin/leave-requests/:id`.
// KHÔNG có nút Duyệt (F9, Q26) và chưa có mục "Lịch hẹn bị ảnh hưởng" (cần booking B11, nối ở B17): không hiện số 0 giả.
export function LeaveDetailDrawer({ item, onClose, onReject }: DrawerProps) {
  const detail = useLoad<AdminLeaveDetail>(
    (signal) => getAdminLeaveRequest(item.yeuCauNghiPhepId, signal),
    item.yeuCauNghiPhepId,
  );

  return (
    <AdminDetailPanel open title={item.bacSi.hoTen} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col items-start gap-1.5">
          <span className="rounded-md bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand-strong">
            {item.chuyenKhoa.ten}
          </span>
          <p className="text-xs text-gray-500">{item.chiNhanh.ten}</p>
          <StatusBadge status={item.trangThai} />
        </div>
        <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-3 text-sm">
          <dt className="text-gray-500">Loại nghỉ</dt>
          <dd className="text-gray-900">{formatLeaveKindLabel(item)}</dd>
          <dt className="text-gray-500">Thời gian</dt>
          <dd className="text-gray-900">{formatLeaveTime(item)}</dd>
          <dt className="text-gray-500">Lý do</dt>
          <dd className="text-gray-900">
            {detail.state.status === 'success' && (
              <span className="break-words whitespace-pre-line">
                {detail.state.data.lyDo}
              </span>
            )}
            {detail.state.status === 'loading' && (
              <span className="text-gray-500">Đang tải…</span>
            )}
          </dd>
          <dt className="text-gray-500">Ngày gửi</dt>
          <dd className="text-gray-900">{formatSentDate(item.thoiDiemTao)}</dd>
          {item.thoiDiemXuLy !== null && (
            <>
              <dt className="text-gray-500">Ngày xử lý</dt>
              <dd className="text-gray-900">
                {formatVnDateTime(item.thoiDiemXuLy)}
              </dd>
            </>
          )}
        </dl>
        {detail.state.status === 'loading' && (
          <LoadingState message="Đang tải chi tiết…" />
        )}
        {detail.state.status === 'error' && (
          <ErrorState error={detail.state.error} onRetry={detail.retry} />
        )}
        {item.trangThai === 'ChoDuyet' && (
          <div className="border-t border-gray-100 pt-4">
            <button
              type="button"
              onClick={() => onReject(item)}
              className="min-h-11 w-full rounded-lg border border-danger-line bg-white text-sm font-semibold text-danger-strong hover:bg-danger-soft"
            >
              Từ chối
            </button>
          </div>
        )}
      </div>
    </AdminDetailPanel>
  );
}
