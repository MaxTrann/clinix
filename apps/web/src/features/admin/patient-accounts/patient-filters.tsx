import { Search } from 'lucide-react';
import type { RefObject } from 'react';
import { useRemote } from '../../../shared/hooks/use-remote';
import { listBranchOptions } from '../account-common/account-service';
import type {
  AccountStatus,
  AdminScopeKind,
} from '../account-common/account-types';

// Thanh lọc của màn Tài khoản bệnh nhân (admin F9). Ô tìm và lọc trạng thái cho cả hai phạm vi; lọc "khoá no-show" và lọc chi nhánh CHỈ Toàn hệ thống
// (Admin Chi nhánh dùng `khoaNoShow` sẽ bị API trả 403, và `chiNhanhId` bị API bỏ qua: PLAN 5.6, TRACKING 9A.3). Viền focus do lớp base vẽ: không `focus:`, `outline-*`, `ring-*` (FG-05).

export type StatusFilter = 'all' | Exclude<AccountStatus, 'ChoKichHoat'>;
export type NoShowFilter = 'all' | 'true' | 'false';

export const SEARCH_MAX_LENGTH = 200;

interface PatientFiltersBarProps {
  scope: AdminScopeKind;
  search: string;
  status: StatusFilter;
  noShow: NoShowFilter;
  branch: string;
  // Trang cần focus ô tìm khi nút hàng đã mở panel không còn (D4)
  searchInputRef: RefObject<HTMLInputElement | null>;
  onSearch: (value: string) => void;
  onStatus: (value: StatusFilter) => void;
  onNoShow: (value: NoShowFilter) => void;
  onBranch: (value: string) => void;
}

const SELECT =
  'h-[35px] min-w-0 rounded-[9.375px] border border-gray-200 bg-white px-3 text-[13px] text-slate-900';

export function PatientFiltersBar({
  scope,
  search,
  status,
  noShow,
  branch,
  searchInputRef,
  onSearch,
  onStatus,
  onNoShow,
  onBranch,
}: PatientFiltersBarProps) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      {/* D2: `sm:basis-60`, không `basis-60` trần: ở màn hẹp khung xếp CỘT và flex-basis thành CHIỀU CAO (đo ở 375 px: ô cao 225 px).
          D1: ô nhập `border-0` trong khung `field-frame` (mẫu của global-search và các ô tìm khác của Admin): viền do khung vẽ, không còn viền đôi. */}
      <label className="field-frame flex min-h-[35px] min-w-0 flex-1 items-center gap-2 rounded-[9.375px] border border-gray-200 bg-white px-3 sm:basis-60">
        <Search
          size={15}
          strokeWidth={1.5}
          aria-hidden="true"
          className="text-gray-400"
        />
        <input
          ref={searchInputRef}
          type="search"
          aria-label="Tìm theo tên, email hoặc số điện thoại"
          placeholder="Tìm theo tên, email hoặc số điện thoại…"
          maxLength={SEARCH_MAX_LENGTH}
          value={search}
          onChange={(event) => onSearch(event.currentTarget.value)}
          className="w-full min-w-0 border-0 bg-transparent text-[13px] text-slate-900"
        />
      </label>
      <select
        aria-label="Lọc trạng thái"
        className={SELECT}
        value={status}
        onChange={(event) =>
          onStatus(event.currentTarget.value as StatusFilter)
        }
      >
        <option value="all">Tất cả trạng thái</option>
        <option value="DangHoatDong">Đang hoạt động</option>
        <option value="NgungHoatDong">Ngừng hoạt động</option>
      </select>
      {scope === 'ToanHeThong' && (
        <>
          <select
            aria-label="Lọc khoá đặt lịch do no-show"
            className={SELECT}
            value={noShow}
            onChange={(event) =>
              onNoShow(event.currentTarget.value as NoShowFilter)
            }
          >
            <option value="all">Mọi tình trạng đặt lịch</option>
            <option value="true">Đang bị khoá do no-show</option>
            <option value="false">Không bị khoá do no-show</option>
          </select>
          <BranchFilter value={branch} onChange={onBranch} />
        </>
      )}
    </div>
  );
}

// Chỉ dựng cho Toàn hệ thống nên chỉ Toàn hệ thống gọi `GET /admin/branches`. Không tải được danh sách thì ô vẫn chọn được "Tất cả chi nhánh".
function BranchFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { state } = useRemote((signal) => listBranchOptions(signal), []);
  const options = state.status === 'ready' ? state.data : [];
  return (
    <>
      <select
        aria-label="Lọc chi nhánh"
        className={SELECT}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        <option value="all">Tất cả chi nhánh</option>
        {options.map((branch) => (
          <option key={branch.chiNhanhId} value={branch.chiNhanhId}>
            {branch.ten}
          </option>
        ))}
      </select>
      {state.status === 'error' && (
        <p role="status" className="self-center text-xs text-gray-500">
          Không tải được danh sách chi nhánh.
        </p>
      )}
    </>
  );
}
