import { useCallback, useEffect, useRef, useState } from 'react';
import { RequestAbortedError } from '../../../../shared/api/errors';
import { submitRating } from '../api/exam-api';
import type { ExamRating } from '../api/patient-exam-types';
import { describeRatingFailure, type RatingFailure } from './rating-failure';
import { checkRating, type RatingFieldErrors } from './rating-rules';

// Máy trạng thái của MỘT lần gửi đánh giá (doctor-exam F6; PLAN 5.7, 5.13; WDG-03, WDG-05, WDG-06, WDG-07; mẫu `use-save-record.ts`). `submit` kiểm ở máy (`checkRating`: chưa chọn sao, nhận xét quá dài; có lỗi thì KHÔNG gọi API và giữ nội dung) rồi
// gửi đúng MỘT POST. KHÔNG BAO GIỜ tự gửi lại: `POST` không idempotent, mạng đứt hay quá giờ nghĩa là "chưa rõ đã lưu"; người dùng bấm Gửi lại thì an toàn (lần trước đã lưu ⇒ 409 `DA_DANH_GIA` ⇒ nơi gọi tải lại và hiện đánh giá).
export function useRating({
  maLichHen,
  onRated,
  onAlreadyRated,
}: {
  maLichHen: string;
  // 201: đánh giá máy chủ vừa ghi (ba khoá), nơi gọi hiện "đã đánh giá" ngay không cần tải lại
  onRated: (rating: ExamRating) => void;
  // 409 `DA_DANH_GIA`: đánh giá đã có, nơi gọi tải lại chi tiết để hiện đánh giá của máy chủ
  onAlreadyRated: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<RatingFailure | null>(null);
  // Cờ chống gửi đúp bằng ref: state chưa kịp vẽ lại giữa hai lần bấm trong cùng một lượt xử lý (nút `disabled` chưa kịp có hiệu lực)
  const sending = useRef(false);
  const controller = useRef<AbortController | null>(null);
  // Hàm gọi lại luôn là bản mới nhất mà `submit` không phải đổi danh tính theo từng lần vẽ
  const onRatedRef = useRef(onRated);
  const onAlreadyRef = useRef(onAlreadyRated);
  useEffect(() => {
    onRatedRef.current = onRated;
    onAlreadyRef.current = onAlreadyRated;
  });
  // Gỡ form khi đang gửi (đổi lịch hẹn, rời trang, đăng xuất): huỷ yêu cầu để không cập nhật state sau khi gỡ
  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );

  const submit = useCallback(
    async (stars: number | null, comment: string) => {
      if (sending.current) return;
      const checked = checkRating(stars, comment);
      if (!checked.ok) {
        setFailure({ message: null, kind: 'field', fields: checked.errors });
        return;
      }
      sending.current = true;
      const abort = new AbortController();
      controller.current = abort;
      setFailure(null);
      setSaving(true);
      // Lấy kết quả trước, cập nhật state và gọi hàm của nơi gọi SAU (lỗi trong `onRated` không bị coi là lỗi của lời gọi mạng)
      let outcome: { rating: ExamRating } | { failed: RatingFailure };
      try {
        outcome = {
          rating: await submitRating(maLichHen, checked.body, abort.signal),
        };
      } catch (error: unknown) {
        // Bị huỷ (đổi lịch hẹn, rời trang, đăng xuất): không báo gì cho người dùng
        if (error instanceof RequestAbortedError) {
          sending.current = false;
          return;
        }
        outcome = { failed: describeRatingFailure(error) };
      }
      sending.current = false;
      if (abort.signal.aborted) return;
      setSaving(false);

      if ('rating' in outcome) {
        onRatedRef.current(outcome.rating);
        return;
      }
      setFailure(outcome.failed);
      if (outcome.failed.kind === 'already') onAlreadyRef.current();
    },
    [maLichHen],
  );

  // Chọn sao hay gõ nhận xét thì bỏ lỗi của đúng ô đó; dải chung (503, mạng…) ở lại cho tới lần gửi kế tiếp
  const clearField = useCallback((field: keyof RatingFieldErrors) => {
    setFailure((current) => {
      if (current === null || current.fields[field] === undefined) {
        return current;
      }
      const fields = { ...current.fields };
      delete fields[field];
      return { ...current, fields };
    });
  }, []);

  return { saving, failure, submit, clearField };
}
