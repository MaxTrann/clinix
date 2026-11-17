import type { ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import type { AdminReviewCounts } from '../api/admin-review-types';
import { formatCount } from '../exam-messages';
import { REVIEWS_TEXT } from './reviews-text';

function Chip({
  tone,
  icon,
  count,
  label,
}: {
  tone: string;
  icon: ReactNode;
  count: number;
  label: string;
}) {
  return (
    <li
      className={`flex items-center gap-[5.625px] rounded-[9.375px] border px-[11.25px] py-[5.625px] text-[13.125px] leading-[18.75px] ${tone}`}
    >
      {icon}
      <span className="font-bold">{formatCount(count)}</span>{' '}
      <span>{label}</span>
    </li>
  );
}

// Đầu trang (Figma `514:301`, `633:266`): tiêu đề, dòng phụ phạm vi ("Toàn hệ thống" hoặc "Chi nhánh: <tên>") và hai chip đếm "N hiển thị", "N đã ẩn" lấy từ `demTheoTrangThai` của MÁY CHỦ (không tính ở máy: số áp mọi bộ lọc trừ Trạng thái).
// Chip chỉ để xem (Figma không có hành vi bấm); `counts` là `null` khi chưa có số hay tải lỗi thì ẩn chip.
export function ReviewsHeader({
  subtitle,
  counts,
}: {
  subtitle: string;
  counts: AdminReviewCounts | null;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-[22.5px] leading-[30px] font-bold text-gray-900">
          {REVIEWS_TEXT.title}
        </h1>
        <p className="pt-[1.875px] text-[13.125px] leading-[18.75px] text-gray-500">
          {subtitle}
        </p>
      </div>
      {counts !== null && (
        <ul
          aria-label={REVIEWS_TEXT.chipsLabel}
          className="flex flex-wrap gap-[11.25px]"
        >
          <Chip
            tone="border-success-surface bg-success-soft text-success"
            icon={<Eye aria-hidden="true" className="size-[13.125px]" />}
            count={counts.HienThi}
            label={REVIEWS_TEXT.shownChip}
          />
          <Chip
            tone="border-red-100 bg-danger-soft text-danger-strong"
            icon={<EyeOff aria-hidden="true" className="size-[13.125px]" />}
            count={counts.DaAn}
            label={REVIEWS_TEXT.hiddenChip}
          />
        </ul>
      )}
    </div>
  );
}
