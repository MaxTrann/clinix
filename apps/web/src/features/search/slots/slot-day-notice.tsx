import { CalendarX } from 'lucide-react';
import { PICK_OTHER_DAY } from './slot-text';

// Ngày bác sĩ không có khung giờ để chọn (Figma 446:422): biểu tượng 30, câu chính 13,125, câu phụ 11,25. Figma tô cả hai câu và biểu tượng gray-400 (≈ 2,5:1) nên
// dùng gray-600 và gray-500 (đo ở Chromium). Chọn câu chính theo trạng thái ngày: `slotDayNoticeTitle` ở `slot-text.ts`.
export function SlotDayNotice({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center">
      <CalendarX className="size-[30px] text-gray-500" aria-hidden="true" />
      <p className="text-sm text-gray-600">{title}</p>
      <p className="text-xs text-gray-500">{PICK_OTHER_DAY}</p>
    </div>
  );
}
