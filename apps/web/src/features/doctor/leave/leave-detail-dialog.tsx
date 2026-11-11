import { useRef, type RefObject } from 'react';
import type { LeaveRequest } from '../api/leave-api';
import { ModalFrame } from '../components/modal-frame';
import { STATUS_STYLES } from '../schedule/status-styles';
import {
  formatLeaveDays,
  formatVnDateTime,
  LEAVE_KIND_LABELS,
  LEAVE_STATUS_LABELS,
} from './leave-format';
import { SHIFT_LABELS } from '../../../shared/schedule/shift-labels';

export interface LeaveDetailDialogProps {
  request: LeaveRequest;
  // Dòng lịch sử đã mở hộp thoại: nhận lại focus khi đóng
  returnFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
}

// Hộp "Chi tiết yêu cầu nghỉ" (Figma `471:2`; WN-08): trạng thái, loại, ngày, ca, lý do, gửi lúc (+ xử lý lúc khi đã xử lý).
// KHÔNG có nút "Hủy yêu cầu" của Figma: Bác sĩ không tự hủy (Q23, WN-09); chỉ Admin duyệt hoặc từ chối. Dữ liệu lấy từ dòng của danh sách
// (cùng hình dạng với `GET /doctor/leave-requests/:id`), nên mở hộp không phát sinh lời gọi mới. Lý do từ chối của Admin chưa có cột (Q27, TECH_DEBT).
export function LeaveDetailDialog({
  request,
  returnFocusRef,
  onClose,
}: LeaveDetailDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  return (
    <ModalFrame
      title="Chi tiết yêu cầu nghỉ"
      initialFocusRef={closeRef}
      returnFocusRef={returnFocusRef}
      onClose={onClose}
      showCloseIcon
    >
      <div className="min-h-0 overflow-y-auto px-6 py-5">
        <span
          className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[request.trangThai].chip}`}
        >
          {LEAVE_STATUS_LABELS[request.trangThai]}
        </span>
        <dl className="mt-4 grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-3 text-sm">
          <dt className="text-gray-500">Loại</dt>
          <dd className="text-gray-900">
            {LEAVE_KIND_LABELS[request.hinhThuc]}
          </dd>
          <dt className="text-gray-500">Ngày</dt>
          <dd className="text-gray-900">{formatLeaveDays(request)}</dd>
          {request.ca !== null && (
            <>
              <dt className="text-gray-500">Ca</dt>
              <dd className="text-gray-900">{SHIFT_LABELS[request.ca]}</dd>
            </>
          )}
          <dt className="text-gray-500">Lý do</dt>
          <dd className="break-words whitespace-pre-wrap text-gray-900">
            {request.lyDo}
          </dd>
          <dt className="text-gray-500">Gửi lúc</dt>
          <dd className="text-gray-900">
            {formatVnDateTime(request.thoiDiemTao)}
          </dd>
          {request.thoiDiemXuLy !== null && (
            <>
              <dt className="text-gray-500">Xử lý lúc</dt>
              <dd className="text-gray-900">
                {formatVnDateTime(request.thoiDiemXuLy)}
              </dd>
            </>
          )}
        </dl>
      </div>
      <div className="border-t border-gray-100 px-6 py-4">
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="min-h-10 w-full rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50"
        >
          Đóng
        </button>
      </div>
    </ModalFrame>
  );
}
