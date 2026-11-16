import { monthButtonName, PATIENT_TEXT } from './patient-exam-text';

// Lưới 12 tháng của năm (Figma `414:197`; WXH-02): mỗi ô "Tháng N" và số ca, hoặc dấu gạch khi không có ca. SỐ CA LẤY NGUYÊN từ `demTheoThang` của máy chủ (web không đếm lại từ danh sách). Ô không ca là `disabled` (chọn không có gì để xem;
// chữ nhạt như Figma, miễn tương phản vì là thành phần vô hiệu); ô đang chọn nền `brand-strong` chữ trắng (Figma `#0092b8` chỉ 3,62:1, ADR 0004), số `cyan-100`. Tên truy cập "Tháng 5, 1 ca" / "Tháng 1, không có ca". 12 ô xếp 6 × 2 ở màn hẹp.
export function MonthGrid({
  counts,
  selected,
  onSelect,
}: {
  counts: readonly number[];
  selected: number | null;
  onSelect: (month: number) => void;
}) {
  return (
    <div
      role="group"
      aria-label={PATIENT_TEXT.monthGroup}
      className="grid grid-cols-6 gap-px bg-gray-100 md:grid-cols-12"
    >
      {counts.map((count, index) => {
        const month = index + 1;
        const active = month === selected;
        const hasCases = count > 0;
        const tone = active
          ? 'bg-brand-strong text-white'
          : hasCases
            ? 'bg-white text-gray-700 hover:bg-gray-50'
            : 'bg-white text-gray-300';
        const countTone = active
          ? 'text-cyan-100'
          : hasCases
            ? 'text-brand-strong'
            : 'text-gray-200';
        return (
          <button
            key={month}
            type="button"
            disabled={!hasCases}
            aria-pressed={active}
            aria-label={monthButtonName(month, count)}
            onClick={() => onSelect(month)}
            className={`flex flex-col items-center justify-center px-1 py-3 ${tone}`}
          >
            <span className="text-[11px] leading-[11px] font-medium whitespace-nowrap">
              Tháng {month}
            </span>
            <span
              className={`pt-1.5 text-xs leading-none font-bold ${countTone}`}
            >
              {hasCases ? count : PATIENT_TEXT.noCases}
            </span>
          </button>
        );
      })}
    </div>
  );
}
