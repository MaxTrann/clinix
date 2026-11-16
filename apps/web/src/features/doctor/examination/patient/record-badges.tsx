import { CircleCheck, ClipboardList } from 'lucide-react';
import { PATIENT_TEXT } from './patient-exam-text';

// Nhãn bo tròn của hàng ca: "Đã có hồ sơ" (xanh, token `success-*` ADR 0004 trùng `#008236`, `#f0fdf4`, `#b9f8cf` của Figma `443:2`) hay "Chưa có hồ sơ" (xám, Figma `414:2`). Chữ LẤY TỪ cờ `coHoSoKham` của máy chủ
// (Q6; web không suy từ nội dung); biểu tượng trang trí. Nhãn xám: nền `gray-100` và viền `gray-200` đúng Figma; chữ `gray-600` (`#4a5565`) thay `#6a7282` của Figma vì `gray-500` trên `gray-100` chỉ 4,39:1 (đo Chromium 16/11/2026, ADR 0004: chữ ≥ 4,5:1).
export function RecordBadge({ hasRecord }: { hasRecord: boolean }) {
  const Icon = hasRecord ? CircleCheck : ClipboardList;
  const tone = hasRecord
    ? 'border-success-line bg-success-soft text-success'
    : 'border-gray-200 bg-gray-100 text-gray-600';
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] leading-[15px] font-bold whitespace-nowrap ${tone}`}
    >
      <Icon aria-hidden="true" className="size-2.5" />
      {hasRecord ? PATIENT_TEXT.hasRecord : PATIENT_TEXT.noRecord}
    </span>
  );
}

// Chip "Hoàn thành" ở thẻ đầu của ngăn chi tiết (Figma `443:521`): mọi ca của trang này đều `HoanThanh`
export function CompletedChip() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-success-line bg-success-soft px-2.5 py-1 text-xs font-semibold text-success">
      <CircleCheck aria-hidden="true" className="size-3" />
      {PATIENT_TEXT.visit.completed}
    </span>
  );
}
