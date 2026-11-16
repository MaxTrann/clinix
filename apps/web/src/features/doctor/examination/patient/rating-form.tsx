import { useId, useState } from 'react';
import { formatCount } from '../exam-messages';
import type { ExamRating } from '../api/patient-exam-types';
import { commentCount, RATING_COMMENT_MAX } from './rating-rules';
import { RATING_TEXT, ratingLabel } from './rating-text';
import { StarInput } from './star-input';
import { useRating } from './use-rating';

// Khung lớp theo Figma `423:398` (gốc 15 px): nhãn 13,125 đậm vừa; ô nhập cao tối thiểu 95,75 (`rows` 2: số hàng không được làm ô cao hơn; đo Chromium 24.8) và cách bộ đếm 6,5 (Figma `423:438`: ô 95,75 trong khung 102,25), bo 13,375, đệm 11,25 × 9,375, chữ 13,125 cao dòng 21,33, viền `gray-300`; bộ đếm 11,25 (`gray-500`, ADR 0004: `#99a1af` chỉ 2,6:1);
// hai nút cao 45 (`h-12`), bo 13,375, cách nhau 9,375, chia đôi; nút chính `bg-brand-strong` (ADR 0004: `#0092b8` với chữ trắng chỉ 3,62:1).
const CONTROL =
  'block min-h-[95.75px] w-full resize-y rounded-[13.375px] border bg-white px-3 py-2.5 text-sm leading-relaxed text-gray-900 placeholder:text-gray-500 aria-[invalid=true]:border-danger';
const BUTTON =
  'h-12 flex-1 rounded-[13.375px] px-6 text-sm font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-60';

function FieldError({ id, message }: { id: string; message: string }) {
  return (
    <p id={id} role="alert" className="pt-1 text-xs text-danger-strong">
      {message}
    </p>
  );
}

// Form "Đánh giá bác sĩ" (doctor-exam F6; Figma `423:2`; PLAN 5.7, 5.13; Q7; WDG-02, WDG-03, WDG-06, WDG-07, WDG-10, WDG-15). Số sao BẮT BUỘC, nhận xét TUỲ CHỌN (L1, Đại 16/11/2026: lệch Figma `423:2` "Nhận xét *" ≥ 10 ký tự), đếm `n/1.000` bằng
// `string.length` SAU chuẩn hoá như máy chủ. Gửi = đúng MỘT POST (`useRating`); lỗi theo ô hiện ĐÚNG ô và nội dung LUÔN giữ; "chưa rõ" cho bấm lại, không tự gửi lại. Nội dung đang gõ chỉ ở state của form này (không kho trình duyệt, URL, log: BDK-09).
// `Huỷ` bỏ hết (sao và nhận xét) và đóng form; khi đang gửi thì `Huỷ` bị khoá để không "huỷ" một lời gọi có thể đã tới máy chủ.
export function RatingForm({
  maLichHen,
  onRated,
  onAlreadyRated,
  onCancel,
}: {
  maLichHen: string;
  onRated: (rating: ExamRating) => void;
  onAlreadyRated: () => void;
  onCancel: () => void;
}) {
  const [stars, setStars] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const { saving, failure, submit, clearField } = useRating({
    maLichHen,
    onRated,
    onAlreadyRated,
  });
  const id = useId();
  const legendId = `${id}-legend`;
  const starsErrorId = `${id}-stars-error`;
  const commentId = `${id}-comment`;
  const commentErrorId = `${id}-comment-error`;
  const countId = `${id}-count`;

  const fields = failure?.fields ?? {};
  const count = commentCount(comment);
  const label = stars === null ? null : ratingLabel(stars);
  // 404, 401, 403, 409 "chưa hoàn thành": gửi lại không đổi được kết quả, chỉ còn `Huỷ`
  const locked = failure?.kind === 'final';

  return (
    <div aria-busy={saving} className="flex flex-col">
      <div id={legendId} className="text-sm font-medium text-gray-900">
        {RATING_TEXT.starsLegend}{' '}
        <span aria-hidden="true" className="text-danger">
          *
        </span>
      </div>
      <div className="flex items-center gap-[7.5px] pt-2">
        <StarInput
          value={stars}
          onChange={(next) => {
            setStars(next);
            clearField('soSao');
          }}
          labelledBy={legendId}
          describedBy={fields.soSao ? starsErrorId : undefined}
          invalid={fields.soSao !== undefined}
          disabled={saving}
          autoFocus
        />
        {label !== null && (
          <span className="text-sm font-medium text-warning">{label}</span>
        )}
      </div>
      {fields.soSao !== undefined && (
        <FieldError id={starsErrorId} message={RATING_TEXT.starsRequired} />
      )}

      <div className="flex flex-col pt-4">
        <label
          htmlFor={commentId}
          className="pb-1.5 text-sm font-medium text-gray-900"
        >
          {RATING_TEXT.commentLabel}{' '}
          <span className="font-normal text-gray-600">
            {RATING_TEXT.optional}
          </span>
        </label>
        <textarea
          id={commentId}
          rows={2}
          aria-invalid={fields.nhanXet ? true : undefined}
          aria-describedby={[fields.nhanXet ? commentErrorId : null, countId]
            .filter((part) => part !== null)
            .join(' ')}
          placeholder={RATING_TEXT.commentPlaceholder}
          value={comment}
          readOnly={saving}
          onChange={(event) => {
            setComment(event.target.value);
            clearField('nhanXet');
          }}
          className={`${CONTROL} border-gray-300`}
        />
        <span
          id={countId}
          className={`mt-[6.5px] pt-1 text-xs ${count > RATING_COMMENT_MAX ? 'text-danger' : 'text-gray-500'}`}
        >
          {`${formatCount(count)}/${formatCount(RATING_COMMENT_MAX)}`}
        </span>
        {fields.nhanXet !== undefined && (
          <FieldError id={commentErrorId} message={RATING_TEXT.tooLong} />
        )}
      </div>

      {failure?.message != null && (
        <p
          role="alert"
          className="mt-3 rounded-xl border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-strong"
        >
          {failure.message}
        </p>
      )}

      <div className="flex gap-2.5 pt-4">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className={`${BUTTON} border border-gray-300 bg-white text-gray-700 hover:bg-gray-50`}
        >
          {RATING_TEXT.cancel}
        </button>
        <button
          type="button"
          onClick={() => void submit(stars, comment)}
          disabled={saving || locked}
          className={`${BUTTON} bg-brand-strong text-white hover:bg-cyan-800`}
        >
          {saving ? RATING_TEXT.submitting : RATING_TEXT.submit}
        </button>
      </div>
    </div>
  );
}
