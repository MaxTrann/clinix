import { countLabel, LIST_TEXT } from './list-messages';
import { ReceptionFilters } from './reception-filters';
import { ReceptionResults } from './reception-results';
import { useFilterOptions } from './use-filter-options';
import { useReceptionList } from './use-reception-list';

// Trang "Quản lý lịch hẹn" của Lễ tân (booking F8; Figma `479:2`, `494:2`): tiêu đề và dòng đếm `{total} lịch hẹn`, ô tìm, chip ngày và ba ô chọn, bảng, chuyển trang; `Chi tiết` là
// LIÊN KẾT tới TRANG chi tiết (F12b: trước là ngăn kéo; `detail/reception-detail-page.tsx`, Figma `488:2` lệch có chủ ý). h1 luôn hiện, kể cả khi đang tải hay lỗi. Chỉ ĐỌC dữ liệu (GET).
// Bộ lọc KHÔNG cá nhân (chip ngày, trạng thái, bác sĩ, chuyên khoa, khoảng ngày, trang) nằm trên URL để quay lại từ trang chi tiết không mất (F12b); ô tìm `q` và mã lịch chỉ ở bộ nhớ của
// trang, không ở URL hay kho trình duyệt (SĐT và tên bệnh nhân là dữ liệu cá nhân).
export function ReceptionListPage() {
  const list = useReceptionList();
  const options = useFilterOptions();

  const total = list.view.kind === 'ready' ? list.view.data.total : null;

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {LIST_TEXT.title}
          </h1>
          <p className="pt-1 text-sm leading-normal text-gray-600">
            {LIST_TEXT.subtitle}
          </p>
        </div>
        {/* Figma `#99a1af` chữ xám nhạt chỉ 2,60:1: dùng `gray-600` (ADR 0004) */}
        <p aria-live="polite" className="pt-1 text-sm text-gray-600">
          {total !== null && countLabel(total)}
        </p>
      </div>
      <ReceptionFilters list={list} options={options} />
      <ReceptionResults list={list} />
    </section>
  );
}
