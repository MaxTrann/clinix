import { ListResults } from '../list-results';
import { isCodeRejected } from './request-errors';
import { RequestFilters } from './request-filters';
import { RequestNotice } from './request-notice';
import { RequestTable } from './request-table';
import { RequestTabs } from './request-tabs';
import { countLabel, emptyMessage, REQUEST_TEXT } from './request-text';
import type { RescheduleRequestsApi } from './request-types';
import { useDoctorOptions } from './use-doctor-options';
import { useRequestList } from './use-request-list';

// Phần thân của trang danh sách yêu cầu đổi lịch (reschedule F4; Lễ tân dùng trực tiếp, F5 sẽ dùng cho Quản trị viên): hai tab, dòng đếm, hàng lọc, bảng và chuyển trang. KHÔNG biết vai trò hay đường dẫn: nhận
// `api` (hàm gọi của vai trò đó, đối tượng ỔN ĐỊNH) và `detailPath` (liên kết tới trang chi tiết). Tiêu đề trang do nơi gọi đặt (Lễ tân: h1 riêng; Quản trị viên: nằm trong trang "Duyệt yêu cầu").
// Khung đang tải, lỗi theo `maLoi`, rỗng, giữ bảng cũ khi đổi tab hay trang và chuyển trang là `ListResults` của `common/`. Chỉ ĐỌC dữ liệu (GET).
// API từ chối mã lịch (400, lưới an toàn) ⇒ lỗi hiện CẠNH Ô TÌM (`RequestSearch`), phần kết quả để trống: khối lỗi chung kèm "Thử lại" vô ích vì cùng yêu cầu cùng kết quả.
export function RequestListView(props: {
  api: RescheduleRequestsApi;
  detailPath: (yeuCauId: string) => string;
}) {
  const list = useRequestList(props.api);
  const doctors = useDoctorOptions();
  const { view, filters } = list;
  const total = view.kind === 'ready' ? view.data.total : null;
  const rejected = view.kind === 'error' && isCodeRejected(view.error);

  return (
    <div>
      <RequestNotice />
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-gray-200">
        <RequestTabs selected={filters.tab} onSelect={list.setTab} />
        <p aria-live="polite" className="pb-2 text-sm text-gray-600">
          {total !== null && countLabel(total)}
        </p>
      </div>
      <RequestFilters
        code={filters.q}
        codeRejected={rejected}
        doctor={filters.bacSiId}
        doctors={doctors.state}
        retryDoctors={doctors.retry}
        filtersActive={list.filtersActive}
        onCode={list.setCode}
        onDoctor={list.setDoctor}
        onClear={list.clearFilters}
      />
      {rejected ? null : (
        <ListResults
          view={view}
          retry={list.retry}
          page={filters.page}
          setPage={list.setPage}
          loadingText={REQUEST_TEXT.loading}
          emptyMessage={emptyMessage(filters.tab, list.filtersActive)}
          clear={
            list.filtersActive
              ? { label: REQUEST_TEXT.clearFilters, onClick: list.clearFilters }
              : null
          }
          renderTable={(data) => (
            <RequestTable
              rows={data.items}
              detailPath={props.detailPath}
              listSearch={list.listSearch}
            />
          )}
        />
      )}
    </div>
  );
}
