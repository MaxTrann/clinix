import { ListResults } from '../common/list-results';
import { AdminFilters } from './admin-filters';
import { AppointmentTable } from './appointment-table';
import { countLabel, LIST_TEXT } from './list-messages';
import { useAdminFilterOptions } from './use-admin-filter-options';
import { useAdminList } from './use-admin-list';

// Câu khi bảng rỗng: có bộ lọc khác khoảng ngày (hay từ khoá) ⇒ "không khớp bộ lọc"; chỉ có khoảng ngày ⇒ "trong khoảng ngày đã chọn"; không lọc gì ⇒ "chưa có lịch hẹn nào"
function emptyMessage(nonDateFilters: boolean, filtersActive: boolean): string {
  if (nonDateFilters) return LIST_TEXT.noMatch;
  return filtersActive ? LIST_TEXT.noInRange : LIST_TEXT.noRows;
}

// Trang "Lịch hẹn" của Quản trị viên (booking F10; Figma `511:2`, `621:2`): tiêu đề và dòng đếm `{total} lịch hẹn phù hợp`, ô tìm, bộ lọc, bảng, chuyển trang; bấm `Chi tiết` mở TRANG chi tiết.
// h1 luôn hiện, kể cả khi đang tải hay lỗi. Chỉ ĐỌC dữ liệu (GET). Bộ lọc không cá nhân nằm trên URL, từ khoá và mã lịch chỉ ở bộ nhớ (`use-admin-list.ts`).
export function AdminListPage() {
  const list = useAdminList();
  const options = useAdminFilterOptions(list.allowBranch);
  const total = list.view.kind === 'ready' ? list.view.data.total : null;

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-[1.3333rem] leading-normal font-bold text-gray-900">
          {LIST_TEXT.title}
        </h1>
        {/* Figma `#99a1af` chữ xám nhạt chỉ 2,60:1: dùng `gray-600` (ADR 0004) */}
        <p aria-live="polite" className="pt-1 text-sm text-gray-600">
          {total !== null && countLabel(total)}
        </p>
      </div>
      <AdminFilters list={list} options={options} />
      <ListResults
        view={list.view}
        retry={list.retry}
        page={list.page}
        setPage={list.setPage}
        loadingText={LIST_TEXT.loading}
        emptyMessage={emptyMessage(list.nonDateFilters, list.filtersActive)}
        clear={
          list.filtersActive
            ? { label: LIST_TEXT.clearFilters, onClick: list.clearFilters }
            : null
        }
        renderTable={(data) => (
          <AppointmentTable
            appointments={data.items}
            listSearch={list.listSearch}
          />
        )}
      />
    </section>
  );
}
