import { Search } from 'lucide-react';
import type { RefObject } from 'react';
import type {
  AccountStatus,
  AdminScopeKind,
} from '../account-common/account-types';
import {
  BranchFilter,
  SEARCH_MAX_LENGTH,
} from '../patient-accounts/patient-filters';
import { roleFilterOptions, type RoleFilter } from './staff-rules';

// Thanh lọc của màn Nhân sự (admin F8). Ô tìm, lọc vai trò và lọc trạng thái cho cả hai phạm vi; lọc chi nhánh CHỈ Toàn hệ thống (API bỏ qua `chiNhanhId`
// của Admin Chi nhánh: PLAN 5.6). Admin Chi nhánh thấy tên chi nhánh của mình ở dạng nhãn và KHÔNG có lựa chọn "Quản trị viên" (Q27, L9).
// Viền focus do lớp base vẽ: không `focus:`, `outline-*`, `ring-*` (FG-05).

export type StaffStatusFilter = 'all' | AccountStatus;

interface StaffFiltersBarProps {
  scope: AdminScopeKind;
  /** Tên chi nhánh của Admin Chi nhánh (`null` với Toàn hệ thống). */
  ownBranchName: string | null;
  search: string;
  role: RoleFilter;
  status: StaffStatusFilter;
  branch: string;
  // Trang cần focus ô tìm khi nút hàng đã mở panel không còn
  searchInputRef: RefObject<HTMLInputElement | null>;
  onSearch: (value: string) => void;
  onRole: (value: RoleFilter) => void;
  onStatus: (value: StaffStatusFilter) => void;
  onBranch: (value: string) => void;
}

const SELECT =
  'h-[35px] min-w-0 rounded-[9.375px] border border-gray-200 bg-white px-3 text-[13px] text-slate-900';

export function StaffFiltersBar({
  scope,
  ownBranchName,
  search,
  role,
  status,
  branch,
  searchInputRef,
  onSearch,
  onRole,
  onStatus,
  onBranch,
}: StaffFiltersBarProps) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      {/* `sm:basis-60`, không `basis-60` trần: ở màn hẹp khung xếp CỘT và flex-basis thành CHIỀU CAO (bài học F9 D2).
          Ô nhập `border-0` trong khung `field-frame`: viền do khung vẽ, không còn viền đôi (F9 D1). */}
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
        aria-label="Lọc vai trò"
        className={SELECT}
        value={role}
        onChange={(event) => onRole(event.currentTarget.value as RoleFilter)}
      >
        {roleFilterOptions(scope).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <select
        aria-label="Lọc trạng thái"
        className={SELECT}
        value={status}
        onChange={(event) =>
          onStatus(event.currentTarget.value as StaffStatusFilter)
        }
      >
        <option value="all">Tất cả trạng thái</option>
        <option value="ChoKichHoat">Chờ kích hoạt</option>
        <option value="DangHoatDong">Đang hoạt động</option>
        <option value="NgungHoatDong">Ngừng hoạt động</option>
      </select>
      {scope === 'ToanHeThong' ? (
        <BranchFilter value={branch} onChange={onBranch} />
      ) : (
        ownBranchName !== null && (
          <span className="self-center text-[13px] text-gray-600">
            Chi nhánh của bạn: {ownBranchName}
          </span>
        )
      )}
    </div>
  );
}
