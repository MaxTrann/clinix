import { ThumbsDown, ThumbsUp, type LucideIcon } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import type { RatingChoice, RatingTotals } from '../api/article-types';
import {
  RATING_TEXT,
  dislikeCount,
  dislikeLabel,
  likeCount,
  likeLabel,
} from './rating-text';
import {
  RATING_BUTTONS_CLASS,
  RATING_COUNTS_CLASS,
  RATING_OFF,
  RATING_ON,
  RATING_TITLE_CLASS,
} from './rating-styles';

// Phần HIỂN THỊ của khối "Bài viết có ích không?" (PLAN article 5.13, 5.1; ABU-07): nhóm có tên, rồi HOẶC hai nút `aria-pressed` có số đếm trong tên,
// HOẶC chỉ hai số đếm (vai khác Bệnh nhân, lúc phiên chưa rõ). Không biết gì về API hay phiên: `ArticleRating` quyết chế độ, `useArticleRating` giữ trạng thái.
export interface RatingButtonsProps {
  // Phiếu hiện có (`null` = chưa chọn nút nào)
  choice: RatingChoice | null;
  // Khoá cả hai nút: `aria-disabled` (không phải `disabled`) để nút đang giữ tiêu điểm vẫn giữ tiêu điểm; bấm vào nút khoá do nơi gọi bỏ qua
  disabled: boolean;
  onPick(loai: RatingChoice): void;
}

interface RatingGroupProps {
  totals: RatingTotals;
  // `null` = chỉ xem số đếm
  buttons: RatingButtonsProps | null;
  // Đang tải phiếu hay đang gửi: đọc là `aria-busy`
  busy?: boolean;
  // Chỗ cho lời nhắc đăng nhập, dòng báo lỗi (nằm ngay dưới nút)
  children?: ReactNode;
}

function RatingButton({
  label,
  icon: Icon,
  pressed,
  disabled,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  pressed: boolean;
  disabled: boolean;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-disabled={disabled || undefined}
      onClick={onClick}
      className={pressed ? RATING_ON : RATING_OFF}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      {label}
    </button>
  );
}

export function RatingGroup({
  totals,
  buttons,
  busy = false,
  children,
}: RatingGroupProps) {
  const titleId = useId();
  return (
    <div role="group" aria-labelledby={titleId} aria-busy={busy}>
      {/* Nhãn của nhóm là `<p>`, không phải đề mục: trang chỉ có MỘT h1 và các h2 của thân bài (như tiêu đề của `ErrorState`) */}
      <p id={titleId} className={RATING_TITLE_CLASS}>
        {RATING_TEXT.groupLabel}
      </p>
      {buttons === null ? (
        <ul className={RATING_COUNTS_CLASS}>
          <li>{likeCount(totals.luotThich)}</li>
          <li>{dislikeCount(totals.luotKhongThich)}</li>
        </ul>
      ) : (
        <div className={RATING_BUTTONS_CLASS}>
          <RatingButton
            label={likeLabel(totals.luotThich)}
            icon={ThumbsUp}
            pressed={buttons.choice === 'Thich'}
            disabled={buttons.disabled}
            onClick={() => buttons.onPick('Thich')}
          />
          <RatingButton
            label={dislikeLabel(totals.luotKhongThich)}
            icon={ThumbsDown}
            pressed={buttons.choice === 'KhongThich'}
            disabled={buttons.disabled}
            onClick={() => buttons.onPick('KhongThich')}
          />
        </div>
      )}
      {children}
    </div>
  );
}
