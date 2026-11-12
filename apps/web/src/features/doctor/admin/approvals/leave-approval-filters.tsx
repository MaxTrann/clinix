import { AdminSearchInput } from '../../../admin';
import {
  ALL,
  DATE_ORDER_MESSAGE,
  type ApprovalFilters,
} from './approval-filters';
import {
  LEAVE_STATUS_LABELS,
  LEAVE_STATUS_ORDER,
} from '../../leave/leave-format';

const FIELD =
  'min-h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900';
const LABEL =
  'flex flex-col gap-1 text-xs font-semibold text-gray-600 uppercase';

interface FiltersProps {
  filters: ApprovalFilters;
  onChange: (filters: ApprovalFilters) => void;
  // Có danh sách ⇒ hiện ô chi nhánh (Admin Toàn hệ thống); `undefined` ⇒ chip chi nhánh cố định của Admin Chi nhánh (Figma `623:2`)
  branches?: readonly { chiNhanhId: string; ten: string }[];
  fixedBranchName?: string;
  dateOrderInvalid: boolean;
}

// Khối lọc (Figma `582:2`): Tìm kiếm, Trạng thái, Từ ngày gửi, Đến ngày gửi, Chi nhánh.
export function LeaveApprovalFilters({
  filters,
  onChange,
  branches,
  fixedBranchName,
  dateOrderInvalid,
}: FiltersProps) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <AdminSearchInput
            label="Tìm kiếm"
            value={filters.q}
            placeholder="Tên bác sĩ, chuyên khoa..."
            onChange={(q) => onChange({ ...filters, q })}
          />
        </div>
        <label className={LABEL}>
          Trạng thái
          <select
            className={FIELD}
            value={filters.trangThai}
            onChange={(event) =>
              onChange({
                ...filters,
                trangThai: event.target.value as ApprovalFilters['trangThai'],
              })
            }
          >
            <option value={ALL}>Tất cả</option>
            {LEAVE_STATUS_ORDER.map((status) => (
              <option key={status} value={status}>
                {LEAVE_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>
        <label className={LABEL}>
          Từ ngày gửi
          <input
            type="date"
            className={FIELD}
            value={filters.tuNgayGui}
            onChange={(event) =>
              onChange({ ...filters, tuNgayGui: event.target.value })
            }
          />
        </label>
        <label className={LABEL}>
          Đến ngày gửi
          <input
            type="date"
            className={FIELD}
            value={filters.denNgayGui}
            aria-invalid={dateOrderInvalid ? true : undefined}
            aria-describedby={dateOrderInvalid ? 'date-order-error' : undefined}
            onChange={(event) =>
              onChange({ ...filters, denNgayGui: event.target.value })
            }
          />
        </label>
        {branches !== undefined && (
          <label className={LABEL}>
            Chi nhánh
            <select
              className={FIELD}
              value={filters.chiNhanhId}
              onChange={(event) =>
                onChange({ ...filters, chiNhanhId: event.target.value })
              }
            >
              <option value={ALL}>Tất cả chi nhánh</option>
              {branches.map((branch) => (
                <option key={branch.chiNhanhId} value={branch.chiNhanhId}>
                  {branch.ten}
                </option>
              ))}
            </select>
          </label>
        )}
        {fixedBranchName !== undefined && (
          <p className={LABEL}>
            Chi nhánh
            <span className="inline-flex min-h-10 items-center rounded-lg border border-sky-300 bg-sky-50 px-3 text-sm font-medium text-brand-strong normal-case">
              {fixedBranchName}
            </span>
          </p>
        )}
      </div>
      {dateOrderInvalid && (
        <p
          id="date-order-error"
          role="alert"
          className="text-sm text-danger-strong"
        >
          {DATE_ORDER_MESSAGE}
        </p>
      )}
    </div>
  );
}
