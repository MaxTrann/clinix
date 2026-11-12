import { useRef, useState } from 'react';
import { ReceptionDrawer } from './detail/reception-drawer';
import { countLabel, LIST_TEXT } from './list-messages';
import { ReceptionFilters } from './reception-filters';
import { ReceptionResults } from './reception-results';
import { useFilterOptions } from './use-filter-options';
import { useReceptionList } from './use-reception-list';

// Trang "Quản lý lịch hẹn" của Lễ tân (booking F8; Figma `479:2`, `494:2`, `488:2`): tiêu đề và dòng đếm `{total} lịch hẹn`, ô tìm, chip ngày và ba ô chọn, bảng, chuyển trang;
// bấm `Chi tiết` mở ngăn chi tiết (modal). h1 luôn hiện, kể cả khi đang tải hay lỗi. Chỉ ĐỌC dữ liệu (GET): không gọi API ghi (B12 chưa có; F9 gắn hai hộp và lời gọi tiếp đón).
// Bộ lọc, ô tìm và mã lịch đang xem chỉ ở bộ nhớ của trang: không ở URL hay kho trình duyệt (SĐT và tên bệnh nhân là dữ liệu cá nhân).
export function ReceptionListPage() {
  const list = useReceptionList();
  const options = useFilterOptions();
  // Mã lịch đang mở ngăn chi tiết; null = đóng. Nút `Chi tiết` đã bấm được giữ để trả tiêu điểm về đúng hàng khi đóng
  const [selected, setSelected] = useState<string | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const total = list.view.kind === 'ready' ? list.view.data.total : null;

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[1.3333rem] leading-normal font-bold text-gray-900">
            {LIST_TEXT.title}
          </h1>
          <p className="pt-[0.2667rem] text-[0.8667rem] leading-normal text-gray-600">
            {LIST_TEXT.subtitle}
          </p>
        </div>
        {/* Figma `#99a1af` chữ xám nhạt chỉ 2,60:1: dùng `gray-600` (ADR 0004) */}
        <p aria-live="polite" className="pt-1 text-sm text-gray-600">
          {total !== null && countLabel(total)}
        </p>
      </div>
      <ReceptionFilters list={list} options={options} />
      <ReceptionResults
        list={list}
        onOpen={(maLichHen, trigger) => {
          returnFocusRef.current = trigger;
          setSelected(maLichHen);
        }}
      />
      {selected !== null && (
        <ReceptionDrawer
          key={selected}
          maLichHen={selected}
          returnFocusRef={returnFocusRef}
          onClose={() => setSelected(null)}
          onReloadList={list.retry}
        />
      )}
    </section>
  );
}
