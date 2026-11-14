import { shownLabel } from '../common/list-text';
import { ListResults } from '../common/list-results';
import { StatusTabs } from '../common/status-tabs';
import { DoctorFilters } from './doctor-filters';
import { DoctorTable } from './doctor-table';
import { LIST_TEXT, STATUS_TAB_ORDER } from './list-messages';
import { useDoctorList } from './use-doctor-list';

// Câu khi bảng rỗng: có bộ lọc khác khoảng ngày (hay từ khoá) ⇒ "không khớp bộ lọc"; chỉ có khoảng ngày ⇒ "trong khoảng ngày đã chọn"; không lọc gì (kể cả chỉ đổi thứ tự) ⇒ "chưa có lịch hẹn nào được phân công"
function emptyMessage(
  nonDateFilters: boolean,
  dateFilterActive: boolean,
): string {
  if (nonDateFilters) return LIST_TEXT.noMatch;
  return dateFilterActive ? LIST_TEXT.noInRange : LIST_TEXT.noneYet;
}

// Trang "Lịch hẹn" của Bác sĩ (booking F11; Figma `457:2`): tiêu đề và phụ đề, ô tìm và bộ lọc, chip trạng thái có số đếm, dòng "Hiển thị X / Y lịch hẹn", bảng, chuyển trang; bấm `Chi tiết` mở TRANG chi tiết.
// h1 luôn hiện, kể cả khi đang tải hay lỗi. Chỉ ĐỌC dữ liệu (GET): không nút đổi trạng thái (`Hoàn thành ca khám`, `Ghi hồ sơ khám` là của module `doctor`). Bộ lọc không cá nhân nằm trên URL, từ khoá chỉ ở
// bộ nhớ (`use-doctor-list.ts`). Chip trạng thái và dòng "Hiển thị" là phần đầu của `ListResults` nên vẫn hiện khi lọc ra 0 dòng (để bấm `Tất cả` thoát được).
export function DoctorAppointmentsPage() {
  const list = useDoctorList();

  return (
    <section>
      <h1 className="text-[1.3333rem] leading-normal font-bold text-gray-900">
        {LIST_TEXT.title}
      </h1>
      <p className="pt-[0.2667rem] text-[0.8667rem] leading-normal text-gray-600">
        {LIST_TEXT.subtitle}
      </p>
      <DoctorFilters list={list} />
      <ListResults
        view={list.view}
        retry={list.retry}
        page={list.page}
        setPage={list.setPage}
        loadingText={LIST_TEXT.loading}
        emptyMessage={emptyMessage(list.nonDateFilters, list.dateFilterActive)}
        clear={
          list.filtersActive
            ? { label: LIST_TEXT.clearFilters, onClick: list.clearFilters }
            : null
        }
        renderHeader={(data) => (
          <>
            <StatusTabs
              counts={data.demTheoTrangThai}
              selected={list.filters.status}
              onSelect={list.setStatus}
              states={STATUS_TAB_ORDER}
              groupLabel={LIST_TEXT.statusGroup}
              allLabel={LIST_TEXT.allStatuses}
            />
            <p aria-live="polite" className="pt-3.5 pb-3 text-sm text-gray-900">
              {shownLabel(data.items.length, data.total)}
            </p>
          </>
        )}
        renderTable={(data) => (
          <DoctorTable appointments={data.items} listSearch={list.listSearch} />
        )}
      />
    </section>
  );
}
