import { ListResults } from '../common/list-results';
import { LIST_TEXT } from './list-messages';
import { ReceptionTable, type OpenDetail } from './reception-table';
import type { ReceptionListController } from './use-reception-list';

// Phần dưới ô lọc của "Quản lý lịch hẹn" của Lễ tân. Khung (đang tải, lỗi theo `maLoi`, giữ bảng cũ, rỗng, chuyển trang) đã chuyển lên `common/list-results.tsx` ở F10.
// Rỗng có hai câu khác nhau: không có lịch nào trong khoảng ngày (chỉ chip ngày, chưa lọc gì khác) và có bộ lọc khác mà không khớp. `Xóa lọc` khi đang lọc.
// Không có thẻ lọc trạng thái có số đếm (B3 không trả `demTheoTrangThai`).
export function ReceptionResults(props: {
  list: ReceptionListController;
  onOpen: OpenDetail;
}) {
  const { list } = props;
  return (
    <ListResults
      view={list.view}
      retry={list.retry}
      page={list.page}
      setPage={list.setPage}
      loadingText={LIST_TEXT.loading}
      emptyMessage={
        list.nonDateFilters ? LIST_TEXT.noMatch : LIST_TEXT.noInRange
      }
      clear={
        list.filtersActive
          ? { label: LIST_TEXT.clearFilters, onClick: list.clearFilters }
          : null
      }
      renderTable={(data) => (
        <ReceptionTable appointments={data.items} onOpen={props.onOpen} />
      )}
    />
  );
}
