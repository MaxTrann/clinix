import { Star } from 'lucide-react';
import type { ExamRating } from '../api/patient-exam-types';
import { formatRatingDate } from './patient-exam-format';
import { ratingLabel, starName } from './rating-text';
import { starIconClass } from './star-icon-class';

// Đánh giá ĐÃ GỬI (doctor-exam F6; Figma `424:2`, `425:2`; WDG-04, WDG-08, WDG-09; Q19): hàng sao (đặc tới số sao, còn lại viền) + nhãn mức sao (`warning`, ADR 0004: `#bb4d00`) + ngày gửi căn phải (giờ Việt Nam), rồi nhận xét nếu có.
// Hiển thị y như nhau cho đánh giá đã bị Admin ẩn: web KHÔNG có cách biết (API không trả `biAn`) và không có nhãn "đã ẩn". Nhận xét là CHỮ do React vẽ (không `dangerouslySetInnerHTML`): `whitespace-pre-wrap` giữ xuống dòng,
// `wrap-anywhere` cho chuỗi dài không dấu cách bẻ dòng. Nhận xét `null` hay chỉ khoảng trắng ⇒ không có đoạn nhận xét. Hàng sao là MỘT ảnh có tên "n sao" (từng sao `aria-hidden`).
const STAR_SLOTS = [1, 2, 3, 4, 5] as const;

export function RatingSummary({ rating }: { rating: ExamRating }) {
  const label = ratingLabel(rating.soSao);
  const date = formatRatingDate(rating.thoiDiemTao);
  const comment =
    rating.nhanXet !== null && rating.nhanXet.trim() !== ''
      ? rating.nhanXet
      : null;
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-[7.5px]">
          <span
            role="img"
            aria-label={starName(rating.soSao)}
            className="flex items-center gap-0.5"
          >
            {STAR_SLOTS.map((stars) => (
              <span key={stars} className="p-0.5">
                <Star
                  aria-hidden="true"
                  className={starIconClass(stars <= rating.soSao)}
                />
              </span>
            ))}
          </span>
          {label !== null && (
            <span className="text-sm font-medium text-warning">{label}</span>
          )}
        </div>
        {date !== null && <span className="text-xs text-gray-500">{date}</span>}
      </div>
      {comment !== null && (
        <p className="pt-2 text-sm leading-relaxed wrap-anywhere whitespace-pre-wrap text-gray-800">
          {comment}
        </p>
      )}
    </div>
  );
}
