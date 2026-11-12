import { LoadingState } from '../../../../shared/ui/loading-state';
import { ListFailure } from '../common/list-failure';
import { ListPagination } from '../common/list-pagination';
import { LIST_TEXT } from './list-messages';
import { ReceptionTable, type OpenDetail } from './reception-table';
import type { ReceptionListController } from './use-reception-list';

// Rỗng có hai câu khác nhau: không có lịch nào trong khoảng ngày (chỉ chip ngày, chưa lọc gì khác) và có bộ lọc khác mà không khớp. `Xóa lọc` khi đang lọc.
function EmptyList({ list }: { list: ReceptionListController }) {
  return (
    <div className="my-2 rounded-xl border border-gray-200 bg-white px-4 py-6 text-center">
      <p className="text-sm text-gray-700">
        {list.nonDateFilters ? LIST_TEXT.noMatch : LIST_TEXT.noInRange}
      </p>
      {list.filtersActive && (
        <button
          type="button"
          onClick={list.clearFilters}
          className="mt-3 inline-flex min-h-[2.4rem] items-center rounded-lg border border-gray-500 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          {LIST_TEXT.clearFilters}
        </button>
      )}
    </div>
  );
}

// Phần dưới ô lọc: đang tải lần đầu, lỗi theo `maLoi`, hoặc bảng + chuyển trang. Khi đổi trang hay bộ lọc, bảng của truy vấn trước vẫn hiện (`aria-busy`, mờ đi) tới khi truy vấn
// mới về, không nhấp nháy về "Đang tải". Không có thẻ lọc trạng thái có số đếm (B3 không trả `demTheoTrangThai`).
export function ReceptionResults(props: {
  list: ReceptionListController;
  onOpen: OpenDetail;
}) {
  const { list } = props;
  const { view } = list;
  if (view.kind === 'loading') {
    return <LoadingState message={LIST_TEXT.loading} />;
  }
  if (view.kind === 'error') {
    return <ListFailure error={view.error} onRetry={list.retry} />;
  }

  const { data, refreshing } = view;
  return (
    <div aria-busy={refreshing} className="mt-4">
      <div className={refreshing ? 'opacity-60' : undefined}>
        {data.items.length === 0 ? (
          <EmptyList list={list} />
        ) : (
          <ReceptionTable appointments={data.items} onOpen={props.onOpen} />
        )}
        <ListPagination
          page={list.page}
          pageSize={data.pageSize}
          total={data.total}
          onPageChange={list.setPage}
        />
      </div>
    </div>
  );
}
