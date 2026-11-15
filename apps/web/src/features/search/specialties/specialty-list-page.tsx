import { useEffect, useState } from 'react';
import { useSelectedBranch } from '../../../shared/branch-selection';
import { EmptyState } from '../../../shared/ui/empty-state';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import { getSpecialties } from '../api/search-service';
import { Breadcrumb } from '../breadcrumb';
import { SearchField } from '../search-field';
import { SpecialtyCard } from './specialty-card';
import { useRemote } from '../../../shared/hooks/use-remote';
import { PUBLIC_CONTAINER } from '../layout';

export const SPECIALTY_SEARCH_DEBOUNCE_MS = 300;
export const SPECIALTY_EMPTY_MESSAGE = 'Không tìm thấy chuyên khoa phù hợp.';

// Trang "Chuyên khoa" (Figma 217:2). Mặc định lọc theo chi nhánh đang chọn (Q5): đổi chi nhánh ở header là tải lại.
// Nhịp dọc theo Figma 217:52 đến 217:257 (search F14, K1): đệm 37,5; đường dẫn → H1 18,75; H1 → dòng đếm 5,625; dòng đếm → ô tìm 22,5; ô tìm → lưới 30.
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
    <main className={`${PUBLIC_CONTAINER} py-10`}>
      <Breadcrumb
        items={[{ label: 'Trang chủ', to: '/' }, { label: 'Chuyên khoa' }]}
      />
      <h1 className="mt-5 text-3xl font-bold text-gray-900">
        Khám chuyên khoa
      </h1>
      {state.status === 'ready' && (
        <p className="mt-1.5 text-gray-600">
          {state.data.total} chuyên khoa, {state.data.soCoBacSi} chuyên khoa
          hiện đã có bác sĩ.
        </p>
      )}

      <div className="mt-6 max-w-112">
        <label htmlFor="specialty-search" className="sr-only">
          Tìm chuyên khoa
        </label>
        <SearchField
          id="specialty-search"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Tìm chuyên khoa, ví dụ: tim mạch"
        />
      </div>

      <div className="mt-8">
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
              <SpecialtyCard
                key={item.chuyenKhoaId}
                item={item}
                headingLevel={2}
              />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
