import { Link } from 'react-router';
import { BOOKING_PATH } from '../../../../shared/routes/booking-paths';
import { ErrorState } from '../../../../shared/ui/error-state';
import { LoadingState } from '../../../../shared/ui/loading-state';
import { AppointmentTable } from './appointment-table';
import { LIST_TEXT, classifyListError, shownLabel } from './list-messages';
import { ListPagination } from './list-pagination';
import { StatusTabs } from './status-tabs';
import type { AppointmentListController } from './use-appointment-list';

// Thông báo lỗi có câu riêng theo `maLoi` (phiên hết hạn, không đủ quyền): không có `Thử lại` vì cùng yêu cầu sẽ cùng kết quả
function ListAlert({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="my-2 rounded-xl border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-strong"
    >
      {message}
    </p>
  );
}

// Rỗng có hai câu khác nhau: chưa có lịch nào (kèm nút đặt lịch) và có lịch nhưng không khớp bộ lọc (kèm nút xoá bộ lọc)
function EmptyList({ list }: { list: AppointmentListController }) {
  return (
    <div className="my-2 rounded-xl border border-gray-200 bg-white px-4 py-6 text-center">
      <p className="text-sm text-gray-700">
        {list.filtersActive ? LIST_TEXT.noMatch : LIST_TEXT.noneYet}
      </p>
      {list.filtersActive ? (
        <button
          type="button"
          onClick={list.clearFilters}
          className="mt-3 inline-flex min-h-[2.4rem] items-center rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          {LIST_TEXT.clearFilters}
        </button>
      ) : (
        <Link
          to={BOOKING_PATH}
          className="mt-3 inline-flex min-h-[2.4rem] items-center rounded-lg bg-brand-strong px-3 text-sm font-medium text-white hover:bg-cyan-800"
        >
          {LIST_TEXT.bookButton}
        </Link>
      )}
    </div>
  );
}

// Phần dưới ô lọc: đang tải lần đầu, lỗi theo `maLoi`, hoặc thẻ lọc + dòng "Hiển thị X / Y" + bảng + chuyển trang. Khi đổi trang hay bộ lọc, bảng và số đếm
// của truy vấn trước vẫn hiện (`aria-busy`, mờ đi) tới khi truy vấn mới về, không nhấp nháy về "Đang tải".
export function AppointmentResults({
  list,
}: {
  list: AppointmentListController;
}) {
  const { view } = list;
  if (view.kind === 'loading') {
    return <LoadingState message={LIST_TEXT.loading} />;
  }
  if (view.kind === 'error') {
    const kind = classifyListError(view.error);
    if (kind === 'session') {
      return <ListAlert message={LIST_TEXT.sessionExpired} />;
    }
    if (kind === 'forbidden') {
      return <ListAlert message={LIST_TEXT.forbidden} />;
    }
    return <ErrorState error={view.error} onRetry={list.retry} />;
  }

  const { data, refreshing } = view;
  return (
    <div aria-busy={refreshing}>
      <div className="mt-4">
        <StatusTabs
          counts={data.demTheoTrangThai}
          selected={list.status}
          onSelect={list.setStatus}
        />
      </div>
      <p aria-live="polite" className="pt-3.5 pb-3 text-sm text-gray-900">
        {shownLabel(data.items.length, data.total)}
      </p>
      <div className={refreshing ? 'opacity-60' : undefined}>
        {data.items.length === 0 ? (
          <EmptyList list={list} />
        ) : (
          <AppointmentTable appointments={data.items} />
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
