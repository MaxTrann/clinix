import { Check, ChevronDown, LocateFixed, MapPin } from 'lucide-react';
import { Link } from 'react-router';
import type { BranchSummary } from '../api/search-types';
import { useDismissible } from './use-dismissible';

export const NATIONWIDE_LABEL = 'Toàn quốc';

export interface BranchPickerProps {
  branches: BranchSummary[];
  // Đã tải xong danh sách; chưa xong mà đã có id lưu thì chưa biết tên chi nhánh
  loaded: boolean;
  // null = "Toàn quốc" (hoặc chưa chọn)
  selectedId: string | null;
  locating: boolean;
  notice: string | null;
  canLocate: boolean;
  onSelect: (chiNhanhId: string | null) => void;
  onLocate: () => void;
  // Trang "Xem tất cả chi nhánh" (F3); chưa có trang thì không truyền và ẩn liên kết
  allBranchesTo?: string;
}

// Nút "📍 <tên chi nhánh> / Toàn quốc" bên trái "Đặt lịch khám" + hộp chọn (PLAN search Q19a). Chưa có frame Figma nên theo Q25:
// dùng token sẵn có, menu dạng "disclosure" giống ServiceMenu, đóng bằng Esc/bấm ra ngoài và trả focus về nút.
export function BranchPicker({
  branches,
  loaded,
  selectedId,
  locating,
  notice,
  canLocate,
  onSelect,
  onLocate,
  allBranchesTo,
}: BranchPickerProps) {
  const { open, setOpen, containerRef, triggerRef } = useDismissible();
  const selected = branches.find((branch) => branch.chiNhanhId === selectedId);

  let label = NATIONWIDE_LABEL;
  if (locating) label = 'Đang xác định vị trí…';
  else if (selectedId !== null && selected) label = selected.ten;
  else if (selectedId !== null && !loaded) label = 'Đang tải…';

  const choose = (chiNhanhId: string | null) => {
    onSelect(chiNhanhId);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const rowClass = (active: boolean) =>
    `flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm ${
      active ? 'bg-brand-soft text-cyan-800' : 'text-gray-700 hover:bg-gray-50'
    }`;

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls="public-branch-picker"
        aria-label={`Chi nhánh đang chọn: ${label}`}
        title={notice ?? undefined}
        onClick={() => setOpen((value) => !value)}
        className="flex max-w-56 items-center gap-1.5 rounded-[0.625rem] border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
      >
        <MapPin className="size-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{label}</span>
        <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" />
      </button>
      {notice && !open && (
        <p role="status" className="sr-only">
          {notice}
        </p>
      )}
      {open && (
        <div
          id="public-branch-picker"
          className="absolute right-0 top-full z-20 mt-1 max-h-96 w-72 overflow-y-auto rounded-xl border border-gray-100 bg-white p-2 shadow-lg"
        >
          <button
            type="button"
            aria-current={selectedId === null ? 'true' : undefined}
            onClick={() => choose(null)}
            className={rowClass(selectedId === null)}
          >
            {NATIONWIDE_LABEL}
            {selectedId === null && (
              <Check className="size-4 shrink-0" aria-hidden="true" />
            )}
          </button>
          {branches.map((branch) => {
            const active = branch.chiNhanhId === selectedId;
            return (
              <button
                key={branch.chiNhanhId}
                type="button"
                aria-current={active ? 'true' : undefined}
                onClick={() => choose(branch.chiNhanhId)}
                className={rowClass(active)}
              >
                <span>
                  <span className="block">{branch.ten}</span>
                  <span className="block text-xs text-gray-600">
                    {branch.diaChi}
                  </span>
                </span>
                {active && (
                  <Check className="size-4 shrink-0" aria-hidden="true" />
                )}
              </button>
            );
          })}
          {loaded && branches.length === 0 && (
            <p className="px-3 py-2 text-sm text-gray-600">
              Chưa có chi nhánh nào.
            </p>
          )}
          {(canLocate || allBranchesTo) && (
            <div className="mt-1 border-t border-gray-100 pt-1">
              {canLocate && (
                <button
                  type="button"
                  disabled={locating}
                  onClick={onLocate}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-brand-strong hover:bg-gray-50 disabled:text-gray-500"
                >
                  <LocateFixed className="size-4" aria-hidden="true" />
                  Dùng vị trí của tôi
                </button>
              )}
              {allBranchesTo && (
                <Link
                  to={allBranchesTo}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-2 text-sm font-medium text-brand-strong hover:bg-gray-50"
                >
                  Xem tất cả chi nhánh
                </Link>
              )}
            </div>
          )}
          {notice && (
            <p role="status" className="px-3 py-2 text-xs text-gray-600">
              {notice}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
