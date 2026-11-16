import { Star } from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import type { RemoteState } from '../../../../shared/hooks/use-remote';
import { LoadingState } from '../../../../shared/ui/loading-state';
import type { ExamDetail, ExamRating } from '../api/patient-exam-types';
import { ExamCard } from './exam-card';
import { FailureBox } from './failure-box';
import { RatingForm } from './rating-form';
import { RatingSummary } from './rating-summary';
import { RATING_TEXT } from './rating-text';

// Dòng thông báo sau khi gửi xong hay khi đánh giá đã có từ trước: `sent` (201) và `already` (409 `DA_DANH_GIA` rồi tải lại)
export type RatingNotice = 'sent' | 'already';

function NotRated({
  triggerRef,
  onOpen,
}: {
  triggerRef: RefObject<HTMLButtonElement | null>;
  onOpen: () => void;
}) {
  return (
    <div className="flex flex-col">
      <p className="pb-3 text-sm text-gray-600">{RATING_TEXT.notRated}</p>
      <div>
        <button
          ref={triggerRef}
          type="button"
          onClick={onOpen}
          className="inline-flex h-12 items-center justify-center rounded-[13.375px] bg-brand-strong px-6 text-base font-semibold whitespace-nowrap text-white transition-colors hover:bg-cyan-800"
        >
          {RATING_TEXT.rateNow}
        </button>
      </div>
    </div>
  );
}

// Thẻ "Đánh giá bác sĩ" ở cột phải của chi tiết lịch hẹn (doctor-exam F6; Figma `422:2` đến `425:2`; WDG-01, WDG-04, WDG-08, WDG-15). Dữ liệu là kết quả MỘT lần gọi chi tiết do `PatientExamSections` giữ: đang tải / lỗi (cùng hộp `Thử lại` với thẻ hồ sơ) /
// có dữ liệu. Hai điều kiện ĐỘC LẬP: đánh giá hiệu lực = `rated ?? danhGia` ⇒ hiện đánh giá; `coTheDanhGia` (và chưa vừa gửi xong) ⇒ hiện câu "chưa đánh giá" và `Đánh giá ngay`, bấm thì mở form tại chỗ. Đã đánh giá ⇒ KHÔNG còn form (Q7: một lần, không sửa).
// Đánh giá bị ẩn hiện như chưa ẩn (Q19). `Huỷ` đóng form và trả tiêu điểm về `Đánh giá ngay`; sau khi gửi xong hay khi 409, dòng `role="status"` nhận tiêu điểm vì nút và form đã biến mất.
export function RatingSection({
  state,
  maLichHen,
  rated,
  notice,
  onRated,
  onAlreadyRated,
  onRetry,
}: {
  state: RemoteState<ExamDetail | null>;
  maLichHen: string;
  // Đánh giá vừa gửi thành công (thân 201), `null` nếu chưa
  rated: ExamRating | null;
  notice: RatingNotice | null;
  onRated: (rating: ExamRating) => void;
  onAlreadyRated: () => void;
  onRetry: () => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const statusRef = useRef<HTMLParagraphElement>(null);

  const detail = state.status === 'ready' ? state.data : null;
  const rating = rated ?? detail?.danhGia ?? null;
  const canRate = rated === null && detail !== null && detail.coTheDanhGia;
  const showNotice = notice !== null && rating !== null;

  useEffect(() => {
    if (showNotice) statusRef.current?.focus();
  }, [showNotice]);

  // Đóng form bằng `Huỷ`: nút `Đánh giá ngay` được vẽ lại ở lượt này nên tiêu điểm trả về SAU khi vẽ
  useEffect(() => {
    if (!open && restoreFocus.current) {
      restoreFocus.current = false;
      trigger.current?.focus();
    }
  }, [open]);

  let body: ReactNode = null;
  if (state.status === 'loading') {
    body = <LoadingState message={RATING_TEXT.loading} />;
  } else if (state.status === 'error') {
    body = <FailureBox error={state.error} onRetry={onRetry} />;
  } else if (detail !== null) {
    body = (
      <>
        {showNotice && (
          <p
            ref={statusRef}
            tabIndex={-1}
            role="status"
            className="pb-3 text-sm text-success"
          >
            {notice === 'sent' ? RATING_TEXT.sent : RATING_TEXT.already}
          </p>
        )}
        {rating !== null && <RatingSummary rating={rating} />}
        {canRate &&
          (open ? (
            <RatingForm
              maLichHen={maLichHen}
              onRated={onRated}
              onAlreadyRated={onAlreadyRated}
              onCancel={() => {
                restoreFocus.current = true;
                setOpen(false);
              }}
            />
          ) : (
            <NotRated triggerRef={trigger} onOpen={() => setOpen(true)} />
          ))}
      </>
    );
  }

  return (
    <ExamCard icon={Star} title={RATING_TEXT.title}>
      <div className="px-5 py-4">{body}</div>
    </ExamCard>
  );
}
