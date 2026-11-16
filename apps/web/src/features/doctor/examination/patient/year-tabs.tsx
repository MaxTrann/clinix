import { PATIENT_TEXT } from './patient-exam-text';

// Hàng tab năm ở đầu thẻ lưới (Figma `414:194`: chỉ MỘT tab "2026"; năm hiện tại và 4 năm trước theo giờ VN, Đại duyệt 16/11/2026 vì API không trả danh sách năm có ca). Nhóm nút `aria-pressed`: đổi năm là lọc lại dữ liệu,
// không có vùng nội dung riêng cho từng tab nên không dùng `role="tab"`. Tab đang chọn: nền `brand-soft`, chữ `brand-strong` (5,07:1 trên `brand-soft`), gạch chân 2 px; `#0092b8` của Figma chỉ là gạch trang trí.
export function YearTabs({
  years,
  selected,
  onSelect,
}: {
  years: readonly number[];
  selected: number;
  onSelect: (year: number) => void;
}) {
  return (
    <div
      role="group"
      aria-label={PATIENT_TEXT.yearGroup}
      className="flex overflow-x-auto border-b border-gray-100"
    >
      {years.map((year) => {
        const active = year === selected;
        const tone = active
          ? 'border-brand-strong bg-brand-soft text-brand-strong'
          : 'border-transparent text-gray-500 hover:bg-gray-50';
        return (
          <button
            key={year}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(year)}
            className={`border-b-2 px-4 py-2.5 text-sm font-semibold whitespace-nowrap ${tone}`}
          >
            {year}
          </button>
        );
      })}
    </div>
  );
}
