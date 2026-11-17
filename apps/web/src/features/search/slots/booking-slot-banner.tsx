import { Info } from 'lucide-react';
import { BOOKING_SLOT_BANNER } from './slot-text';

// Banner xanh ở đầu Bước 3 (Figma 446:139): nền cyan-50, viền cyan-200, bo 13,375, đệm 15, chữ 15 màu #053345 (= cyan-950).
// Ý "chọn giờ chưa giữ chỗ" (T5): bấm một giờ chỉ đi tiếp sang Bước 4, việc giữ chỗ chỉ xảy ra khi thanh toán cọc ở bước cuối.
export function BookingSlotBanner() {
  return (
    <div className="mt-6 flex items-start gap-[11.25px] rounded-[13.375px] border border-cyan-200 bg-cyan-50 p-[15px] text-[15px] leading-[22.5px] text-cyan-950">
      <Info
        className="mt-[1.875px] size-[18.75px] shrink-0 text-cyan-700"
        aria-hidden="true"
      />
      <p>{BOOKING_SLOT_BANNER}</p>
    </div>
  );
}
