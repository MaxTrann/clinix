import { Star } from 'lucide-react';
import { starName } from '../patient/rating-text';

const STAR_SLOTS = [1, 2, 3, 4, 5] as const;

// Hàng sao của màn Kiểm duyệt (doctor-exam F7; Figma `514:2` sao 13 px, `570:2` sao 16 px). MỘT ảnh có tên "n sao" (từng sao `aria-hidden`). Sao đặc dùng `amber-600` và sao viền `gray-500` vì ký hiệu phải đạt 3:1 trên nền trắng
// (ADR 0004; cùng lý do và số đo với `star-icon-class.ts` của F6: vàng `#ffb900` của Figma chỉ ≈ 1,7:1).
export function ReviewStars({
  value,
  large = false,
}: {
  value: number;
  large?: boolean;
}) {
  return (
    <span
      role="img"
      aria-label={starName(value)}
      className="inline-flex items-center gap-[1.875px]"
    >
      {STAR_SLOTS.map((slot) => (
        <Star
          key={slot}
          aria-hidden="true"
          className={`${large ? 'size-[16px]' : 'size-[13px]'} ${
            slot <= value ? 'fill-current text-amber-600' : 'text-gray-500'
          }`}
        />
      ))}
    </span>
  );
}
