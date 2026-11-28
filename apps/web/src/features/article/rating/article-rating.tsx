import { useState } from 'react';
import { Link } from 'react-router';
import { errorMessageFor } from '../../../shared/api/error-message';
import { RequestAbortedError } from '../../../shared/api/errors';
import { ErrorState } from '../../../shared/ui/error-state';
import { LOGIN_PATH, useAuth } from '../../auth';
import type { RatingTotals } from '../api/article-types';
import { ARTICLE_ERROR, collectErrorCodes } from '../common/article-errors';
import { RatingGroup } from './rating-buttons';
import { RATING_ERROR_CLASS, RATING_LINK_CLASS } from './rating-styles';
import { RATING_TEXT } from './rating-text';
import { useArticleRating } from './use-article-rating';

// Khối "Bài viết có ích không?" của trang chi tiết (article F3; PLAN 5.13, MH14, MH16; use case 2.4.22). Chế độ chọn theo PHIÊN (`useAuth`):
//  - khách (`unauthenticated`): hai nút; bấm ⇒ lời nhắc "Đăng nhập để đánh giá" kèm liên kết `LOGIN_PATH`, KHÔNG gọi API (không nút vô hiệu im lặng);
//  - Bệnh nhân (`authenticated` và `BenhNhan`): `PatientRating` (tải phiếu, bấm PUT hay DELETE);
//  - còn lại (vai khác; phiên chưa rõ: `checking`, `error`): CHỈ số đếm, không nút, không gọi API. `checking` và `error` chưa phải "chưa đăng nhập" nên không vẽ nút khách
//    (tránh vẽ rồi đổi, nếp `GuestLoginBanner` của search); nút hiện ra khi phiên rõ.
// Phiên đổi giữa chừng (làm mới token thất bại ⇒ khách; đăng xuất) thì khối tự đổi chế độ vì đọc `useAuth()`, trang không trắng.
interface ArticleRatingProps {
  articleId: string;
  // Số đếm ban đầu, lấy từ chi tiết công khai
  luotThich: number;
  luotKhongThich: number;
}

export function ArticleRating({
  articleId,
  luotThich,
  luotKhongThich,
}: ArticleRatingProps) {
  const { status, user } = useAuth();
  const totals: RatingTotals = { luotThich, luotKhongThich };

  if (status === 'unauthenticated') return <GuestRating totals={totals} />;
  if (status === 'authenticated' && user?.vaiTro === 'BenhNhan') {
    return <PatientRating articleId={articleId} totals={totals} />;
  }
  return <RatingGroup totals={totals} buttons={null} />;
}

function GuestRating({ totals }: { totals: RatingTotals }) {
  const [prompted, setPrompted] = useState(false);
  return (
    <RatingGroup
      totals={totals}
      buttons={{
        choice: null,
        disabled: false,
        onPick: () => setPrompted(true),
      }}
    >
      {prompted && (
        <p role="status" className="mt-3">
          <Link to={LOGIN_PATH} className={RATING_LINK_CLASS}>
            {RATING_TEXT.loginPrompt}
          </Link>
        </p>
      )}
    </RatingGroup>
  );
}

// Lỗi ở khối: câu "không còn tồn tại" chọn theo MÃ `KHONG_TIM_THAY` (không theo mã HTTP); lỗi lúc TẢI phiếu có "Thử lại" (`onRetry`), lỗi lúc GHI thì
// chỉ báo một dòng cạnh nút (người dùng bấm lại là thử lại); mọi câu khác là câu chung của `shared/`
function RatingFailure({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  if (error instanceof RequestAbortedError) return null;
  if (collectErrorCodes(error).includes(ARTICLE_ERROR.notFound)) {
    return (
      <p role="alert" className={RATING_ERROR_CLASS}>
        {RATING_TEXT.unavailable}
      </p>
    );
  }
  if (onRetry) return <ErrorState error={error} onRetry={onRetry} />;
  return (
    <p role="alert" className={RATING_ERROR_CLASS}>
      {errorMessageFor(error)}
    </p>
  );
}

function PatientRating({
  articleId,
  totals,
}: {
  articleId: string;
  totals: RatingTotals;
}) {
  const rating = useArticleRating(articleId, totals);
  return (
    <RatingGroup
      totals={rating.totals}
      busy={rating.busy || rating.loading}
      buttons={{
        choice: rating.choice,
        // Khoá khi chưa biết phiếu của mình (đang tải hay tải lỗi) hoặc đang gửi
        disabled: !rating.ready || rating.busy,
        onPick: rating.pick,
      }}
    >
      {rating.loadError !== null && (
        <RatingFailure error={rating.loadError} onRetry={rating.retryLoad} />
      )}
      {rating.writeError !== null && (
        <RatingFailure error={rating.writeError} />
      )}
    </RatingGroup>
  );
}
