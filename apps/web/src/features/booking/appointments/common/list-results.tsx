import type { ReactNode } from 'react';
import { LoadingState } from '../../../../shared/ui/loading-state';
import { ListFailure } from './list-failure';
import { ListPagination } from './list-pagination';
import type { ListView, PagedData } from './use-list-view';

// Phần dưới ô lọc của trang danh sách lịch hẹn có phân trang (booking F8 viết ở `reception/reception-results.tsx`, chuyển lên `common/` ở F10: Lễ tân và Quản trị viên cùng dùng):
// đang tải lần đầu, lỗi theo `maLoi`, hoặc bảng + chuyển trang. Khi đổi trang hay bộ lọc, bảng của truy vấn trước vẫn hiện (`aria-busy`, mờ đi) tới khi truy vấn mới về, không
// nhấp nháy về "Đang tải". Rỗng: MỘT câu do nơi gọi chọn (`emptyMessage`: không có lịch trong khoảng ngày, hay không khớp bộ lọc), kèm `Xóa lọc` khi nơi gọi đưa `clear`.
function EmptyList(props: {
  message: string;
  clear: { label: string; onClick: () => void } | null;
}) {
  return (
    <div className="my-2 rounded-xl border border-gray-200 bg-white px-4 py-6 text-center">
      <p className="text-sm text-gray-700">{props.message}</p>
      {props.clear !== null && (
        <button
          type="button"
          onClick={props.clear.onClick}
          className="mt-3 inline-flex min-h-[2.4rem] items-center rounded-lg border border-gray-500 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          {props.clear.label}
        </button>
      )}
    </div>
  );
}

export function ListResults<T extends PagedData>(props: {
  view: ListView<T>;
  retry: () => void;
  page: number;
  setPage: (page: number) => void;
  loadingText: string;
  emptyMessage: string;
  clear: { label: string; onClick: () => void } | null;
  renderTable: (data: T) => ReactNode;
}) {
  const { view } = props;
  if (view.kind === 'loading') {
    return <LoadingState message={props.loadingText} />;
  }
  if (view.kind === 'error') {
    return <ListFailure error={view.error} onRetry={props.retry} />;
  }

  const { data, refreshing } = view;
  return (
    <div aria-busy={refreshing} className="mt-4">
      <div className={refreshing ? 'opacity-60' : undefined}>
        {data.items.length === 0 ? (
          <EmptyList message={props.emptyMessage} clear={props.clear} />
        ) : (
          props.renderTable(data)
        )}
        <ListPagination
          page={props.page}
          pageSize={data.pageSize}
          total={data.total}
          onPageChange={props.setPage}
        />
      </div>
    </div>
  );
}
