import { useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { useRemote } from '../../../../../shared/hooks/use-remote';
import { useListView } from '../use-list-view';
import {
  hasActiveRequestFilters,
  readRequestFilters,
  writeRequestFilters,
  type RequestFilters,
} from './request-query-state';
import type { RescheduleRequestsApi } from './request-types';

// Hook của trang danh sách yêu cầu đổi lịch (reschedule F4; nếp `use-reception-list.ts` của F12b): tab, trang, bác sĩ và mã lịch nằm trên URL (`request-query-state.ts`), tải bằng `useRemote` và GIỮ DỮ LIỆU
// CŨ khi đổi tab hay trang (`useListView` của `common/`: không nhấp nháy về "Đang tải"). Chỉ ĐỌC. Không biết vai trò: `api` là hàm gọi của vai trò đó (phải là đối tượng ỔN ĐỊNH, không dựng lại mỗi lần vẽ).
// Đổi tab, bác sĩ hay mã thì về trang 1. `replace` (không đẩy một mục lịch sử cho mỗi lần đổi), nên nút Quay lại từ trang chi tiết về đúng URL đã lọc. Đặt lại đúng giá trị cũ không đổi URL.
export function useRequestList(api: RescheduleRequestsApi) {
  const [params, setParams] = useSearchParams();
  const filters = readRequestFilters(params);

  const update = useCallback(
    (patch: Partial<RequestFilters>) => {
      setParams(
        (previous) => {
          const current = readRequestFilters(previous);
          const next = { ...current, ...patch, page: patch.page ?? 1 };
          const written = writeRequestFilters(next);
          return written.toString() === writeRequestFilters(current).toString()
            ? previous
            : written;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const { state: remote, retry } = useRemote(
    (signal) =>
      api.list(
        {
          tab: filters.tab,
          page: filters.page,
          bacSiId: filters.bacSiId,
          q: filters.q,
        },
        signal,
      ),
    [filters.tab, filters.page, filters.bacSiId, filters.q],
  );

  const setPage = useCallback(
    (value: number) => update({ page: value }),
    [update],
  );
  const view = useListView(remote, filters.page, setPage);

  const clearFilters = useCallback(
    () => update({ bacSiId: '', q: '' }),
    [update],
  );

  // `search` CHUẨN của danh sách hiện tại: trang chi tiết nhận qua `state` của liên kết để `Quay lại danh sách` khôi phục tab, trang và bộ lọc
  const search = writeRequestFilters(filters).toString();
  return {
    view,
    retry,
    filters,
    filtersActive: hasActiveRequestFilters(filters),
    listSearch: search === '' ? '' : `?${search}`,
    // Bấm lại tab đang chọn không làm gì (không về trang 1, không gọi lại API; nếp chip ngày của `use-reception-list.ts`)
    setTab: (tab: RequestFilters['tab']) => {
      if (tab !== filters.tab) update({ tab });
    },
    setDoctor: (bacSiId: string) => update({ bacSiId }),
    // Tìm lại ĐÚNG mã đang áp dụng thì làm mới danh sách (nếp `useKeywordBox.submit`), không đổi URL
    setCode: (q: string) => {
      if (q === filters.q) retry();
      else update({ q });
    },
    setPage,
    clearFilters,
  };
}

export type RequestListController = ReturnType<typeof useRequestList>;
