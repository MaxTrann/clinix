import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useSelectedBranch } from '../../../shared/branch-selection';
import { EmptyState } from '../../../shared/ui/empty-state';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import { getSpecialties } from '../api/search-service';
import type { SpecialtySummary } from '../api/search-types';
import { doctorCountLabel } from './doctor-count-label';
import { SpecialtyImage } from './specialty-image';
import { useRemote } from './use-remote';

export const SPECIALTY_SEARCH_DEBOUNCE_MS = 300;
export const SPECIALTY_EMPTY_MESSAGE = 'Không tìm thấy chuyên khoa phù hợp.';

function SpecialtyCard({ item }: { item: SpecialtySummary }) {
  return (
    <li>
      <Link
        to={`/chuyen-khoa/${item.chuyenKhoaId}`}
        className="block h-full overflow-hidden rounded-xl border border-gray-200 bg-white hover:shadow-md"
      >
        <SpecialtyImage
          src={item.anhDaiDien}
          name={item.ten}
          className="h-40 w-full object-cover"
        />
        <div className="p-4">
          <h2 className="text-base font-semibold text-gray-900">{item.ten}</h2>
          {item.moTa && (
            <p className="mt-1 line-clamp-2 text-sm text-gray-600">
              {item.moTa}
            </p>
          )}
          {/* Chữ xám đậm hơn Figma để đạt tương phản 4,5:1 (Q26) */}
          <p className="mt-2 text-sm font-medium text-gray-700">
            {doctorCountLabel(item.soBacSi)}
          </p>
        </div>
      </Link>
    </li>
  );
}

// Trang "Chuyên khoa" (Figma 217:2). Mặc định lọc theo chi nhánh đang chọn (Q5): đổi chi nhánh ở header là tải lại.
export function SpecialtyListPage() {
  const { selection, select } = useSelectedBranch();
  const branchId = selection?.chiNhanhId ?? null;
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');

  // Tự tìm sau 300 ms kể từ lần gõ cuối
  useEffect(() => {
    const timer = setTimeout(
      () => setQ(input.trim()),
      SPECIALTY_SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [input]);

  const { state, retry } = useRemote(
    (signal) => getSpecialties({ q, chiNhanhId: branchId }, signal),
    [q, branchId],
  );

  const clearFilters = () => {
    setInput('');
    setQ('');
    if (branchId !== null) select(null, 'NguoiDung');
  };

  return (
    <main className="mx-auto max-w-300 px-7.5 py-8">
      <nav aria-label="Đường dẫn" className="text-sm text-gray-600">
        <Link to="/" className="hover:underline">
          Trang chủ
        </Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Chuyên khoa</span>
      </nav>
      <h1 className="mt-3 text-3xl font-semibold text-gray-900">
        Khám chuyên khoa
      </h1>
      {state.status === 'ready' && (
        <p className="mt-1 text-gray-600">
          {state.data.total} chuyên khoa, {state.data.soCoBacSi} chuyên khoa
          hiện đã có bác sĩ.
        </p>
      )}

      <div className="mt-5 max-w-md">
        <label htmlFor="specialty-search" className="sr-only">
          Tìm chuyên khoa
        </label>
        <input
          id="specialty-search"
          type="search"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Tìm chuyên khoa, ví dụ: tim mạch"
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
            <EmptyState message={SPECIALTY_EMPTY_MESSAGE} />
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
          <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {state.data.items.map((item) => (
              <SpecialtyCard key={item.chuyenKhoaId} item={item} />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
