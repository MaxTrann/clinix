import { useId } from 'react';
import type { ExamListItem } from '../api/patient-exam-types';
import { RecordRow } from './record-row';
import { casesLabel, truncatedNote } from './patient-exam-text';

// Thẻ danh sách ca của MỘT tháng (Figma `414:275`; WXH-02): đầu thẻ "Tháng 10 2026" và "2 ca", dưới là các hàng THEO THỨ TỰ MÁY CHỦ (giờ khám mới nhất trước; web không sắp lại). "N ca" lấy từ `total` của máy chủ, không từ số hàng đang hiện.
// Tháng có hơn 50 ca: API chỉ trả 50 (chưa chuyển trang, `TECH_DEBT` 166) nên thẻ có dòng ghi chú đang hiện bao nhiêu trên tổng. Thẻ được đặt tên bằng chính đầu thẻ (`aria-labelledby`), không thêm chữ.
export function RecordList({
  title,
  total,
  items,
  selectedCase,
  onSelect,
}: {
  title: string;
  total: number;
  items: readonly ExamListItem[];
  selectedCase: string | null;
  onSelect: (maLichHen: string) => void;
}) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="overflow-hidden rounded-2xl border border-gray-200 bg-white"
    >
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5 text-xs text-gray-500">
        <h2 id={headingId} className="font-semibold">
          {title}
        </h2>
        <span>{casesLabel(total)}</span>
      </div>
      <ul>
        {items.map((item) => (
          <RecordRow
            key={item.maLichHen}
            item={item}
            selected={item.maLichHen === selectedCase}
            onSelect={onSelect}
          />
        ))}
      </ul>
      {total > items.length && (
        <p className="border-t border-gray-100 px-4 py-2.5 text-xs text-gray-500">
          {truncatedNote(items.length, total)}
        </p>
      )}
    </section>
  );
}
