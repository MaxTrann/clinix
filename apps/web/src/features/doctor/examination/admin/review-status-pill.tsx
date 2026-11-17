import { Eye, EyeOff } from 'lucide-react';
import { STATUS_TEXT } from './reviews-text';

// Nhãn trạng thái của đánh giá (Figma `514:398`, `514:490`, `570:881`): "Hiển thị" xanh lá có mắt, "Đã ẩn" đỏ có mắt gạch. Chữ dùng `success` (green-700) và `danger-strong` (red-700) thay cho `#00a63e` và `#e7000b` của Figma
// vì chữ 11 px phải đạt 4,5:1 trên nền nhạt (ADR 0004; số đo thật ở TRACKING 26.8). Thông tin không chỉ ở màu: có chữ và biểu tượng khác nhau.
export function ReviewStatusPill({ hidden }: { hidden: boolean }) {
  const Icon = hidden ? EyeOff : Eye;
  return (
    <span
      className={`inline-flex items-center gap-[3.75px] rounded-full border px-[7.5px] py-[1.875px] text-[11px] leading-[15.714px] font-medium whitespace-nowrap ${
        hidden
          ? 'border-red-100 bg-danger-soft text-danger-strong'
          : 'border-success-surface bg-success-soft text-success'
      }`}
    >
      <Icon aria-hidden="true" className="size-[11.25px]" />
      {STATUS_TEXT[hidden ? 'DaAn' : 'HienThi']}
    </span>
  );
}
