import { MapPin } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useSelectedBranch } from '../../../shared/branch-selection';
import { EmptyState } from '../../../shared/ui/empty-state';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import { searchBranches } from '../api/search-service';
import type { BranchSummary } from '../api/search-types';
import { selectedFirst } from './selected-first';
import { useRemote } from '../use-remote';

export const BRANCH_SEARCH_DEBOUNCE_MS = 300;
export const BRANCH_EMPTY_MESSAGE = 'Không tìm thấy kết quả phù hợp.';
export const SELECTED_BADGE = 'Đang chọn';

function BranchCard({
  item,
  selected,
}: {
  item: BranchSummary;
  selected: boolean;
}) {
  return (
    <li>
      <Link
        to={`/chi-nhanh/${item.chiNhanhId}`}
        className="block h-full rounded-xl border border-gray-200 bg-white p-4 hover:shadow-md"
      >
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-base font-semibold text-gray-900">{item.ten}</h2>
          {selected && (
            <span className="shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-cyan-800">
              {SELECTED_BADGE}
            </span>
          )}
        </div>
        <p className="mt-2 flex items-start gap-1.5 text-sm text-gray-600">
          <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{item.diaChi}</span>
        </p>
      </Link>
    </li>
  );
}

// Trang "Chi nhánh" (chưa có frame Figma — PLAN search Q8, Q25): lưới thẻ như trang Chuyên khoa.
// Ô tìm khớp tên và địa chỉ (Q3). Điểm vào: bộ chọn chi nhánh và chân trang, không thêm mục vào thanh điều hướng.
export function BranchListPage() {
  const { selection } = useSelectedBranch();
  const selectedId = selection?.chiNhanhId ?? null;
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');

  // Tự tìm sau 300 ms kể từ lần gõ cuối
  useEffect(() => {
    const timer = setTimeout(
      () => setQ(input.trim()),
      BRANCH_SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [input]);

  const { state, retry } = useRemote(
    (signal) => searchBranches(q, signal),
    [q],
  );

  const clearFilters = () => {
    setInput('');
    setQ('');
  };

  return (
    <main className="mx-auto max-w-300 px-7.5 py-8">
      <nav aria-label="Đường dẫn" className="text-sm text-gray-600">
        <Link to="/" className="hover:underline">
          Trang chủ
        </Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Chi nhánh</span>
      </nav>
      <h1 className="mt-3 text-3xl font-semibold text-gray-900">Chi nhánh</h1>
      {state.status === 'ready' && (
        <p className="mt-1 text-gray-600">{state.data.total} chi nhánh.</p>
      )}

      <div className="mt-5 max-w-md">
        <label htmlFor="branch-search" className="sr-only">
          Tìm chi nhánh
        </label>
        <input
          id="branch-search"
          type="search"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Tìm theo tên hoặc địa chỉ, ví dụ: Quận 3"
          className="w-full rounded-[0.625rem] border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="mt-6">
        {state.status === 'loading' && <LoadingState />}
        {state.status === 'error' && (
          <ErrorState error={state.error} onRetry={retry} />
        )}
        {state.status === 'ready' && state.data.items.length === 0 && (
          <div>
            <EmptyState message={BRANCH_EMPTY_MESSAGE} />
            <button
              type="button"
              onClick={clearFilters}
              className="text-sm font-medium underline"
            >
              Xoá bộ lọc
            </button>
          </div>
        )}
        {state.status === 'ready' && state.data.items.length > 0 && (
          <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {selectedFirst(state.data.items, selectedId).map((item) => (
              <BranchCard
                key={item.chiNhanhId}
                item={item}
                selected={item.chiNhanhId === selectedId}
              />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
