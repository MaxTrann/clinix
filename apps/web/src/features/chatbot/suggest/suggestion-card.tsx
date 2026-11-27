import { useId } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../../auth';
import type { ChuyenKhoaGoiY } from '../api/chatbot-types';
import { CHATBOT_TEXT } from '../widget/chatbot-text';
import { DOCTOR_LOOKUP_PATH } from '../widget/entity-paths';
import { useChatbotApi } from './chatbot-api-context';
import { DayShiftPicker } from './day-shift-picker';
import { DoctorCard } from './doctor-card';
import { SpecialtyPicker } from './specialty-picker';
import { statusTextOf } from './suggest-status';
import { PILL_CLASS } from './suggest-styles';
import { useSuggestion } from './use-suggestion';

const TEXT = CHATBOT_TEXT.suggest;

// Thẻ gợi ý đặt lịch trong khung chat (chatbot F2; 2.4.7 b8 đến b11, A5). Gắn ở `widget/reply-view.tsx` cho phản hồi `GoiY`.
// Luồng: chọn chuyên khoa (người dùng bấm) → máy chủ trả ngày sớm nhất còn giờ trống → đổi ngày, ca nếu muốn → bấm ô giờ (liên kết sang bước 4).
// `aria-live="off"`: danh sách tin là vùng `aria-live="polite"`; không có dòng này thì mỗi lần đổi ngày trình đọc màn hình đọc lại cả thẻ.
// Chỉ dòng `role="status"` (luôn có mặt trong DOM để thay đổi nội dung được đọc) báo kết quả.
export function SuggestionCard({
  suggestions,
}: {
  suggestions: readonly ChuyenKhoaGoiY[];
}) {
  const api = useChatbotApi();
  const suggestion = useSuggestion(api);
  const { status } = useAuth();
  const titleId = useId();
  const { selection, view, retry } = suggestion;
  const chosen = selection.chuyenKhoaId !== null;
  // Khách chưa đăng nhập: bấm ô giờ thì `RequireAuth` đưa tới đăng nhập rồi quay lại bước 4 (PLAN 5.11)
  const guest = status === 'unauthenticated';

  return (
    <section
      aria-live="off"
      aria-labelledby={titleId}
      className="mt-2 rounded-xl border border-gray-200 bg-white p-3 text-sm text-gray-900"
    >
      <h3 id={titleId} className="text-sm font-semibold">
        {TEXT.title}
      </h3>
      <SpecialtyPicker suggestions={suggestions} suggestion={suggestion} />
      {chosen && <DayShiftPicker suggestion={suggestion} />}
      <p
        role="status"
        className={chosen ? 'mt-3 font-medium break-words' : 'sr-only'}
      >
        {statusTextOf(view, selection)}
      </p>
      {view.kind === 'error' && view.error.canRetry && (
        <button type="button" onClick={retry} className={`mt-2 ${PILL_CLASS}`}>
          {TEXT.retry}
        </button>
      )}
      {(view.kind === 'error' || view.kind === 'empty') && (
        <Link to={DOCTOR_LOOKUP_PATH} className={`mt-2 ${PILL_CLASS}`}>
          {CHATBOT_TEXT.linkDoctors}
        </Link>
      )}
      {view.kind === 'result' && (
        <>
          {guest && <p className="mt-2 font-medium">{TEXT.loginHint}</p>}
          <ul className="mt-2 flex flex-col gap-2">
            {view.data.bacSi.map((doctor) => (
              <DoctorCard key={doctor.bacSiId} doctor={doctor} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
