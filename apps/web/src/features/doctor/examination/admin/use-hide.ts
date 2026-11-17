import { useCallback, useEffect, useRef, useState } from 'react';
import { RequestAbortedError } from '../../../../shared/api/errors';
import { hideAdminReview } from '../api/exam-api';
import { describeHideFailure, type HideFailure } from './hide-failure';
import { checkReason } from './hide-rules';

// 409 và 404: đánh giá đã ẩn hay không còn thấy; nơi gọi đóng hộp, tải lại danh sách và báo
export type HideSettled = 'already' | 'gone';

// Máy trạng thái của MỘT lần ẩn đánh giá (doctor-exam F8; PLAN 5.8, 5.13; WKD-05 đến WKD-08, WKD-23; mẫu `use-rating.ts`, `use-save-record.ts`). `hide` kiểm ở máy (`checkReason`: thiếu, ngắn, dài; có lỗi thì KHÔNG gọi API và giữ lý do) rồi gửi đúng MỘT POST.
// KHÔNG BAO GIỜ tự gửi lại: mạng đứt hay quá giờ nghĩa là "chưa rõ đã ẩn"; người dùng bấm lại thì an toàn (lần trước đã ẩn ⇒ 409 `DANH_GIA_DA_AN` ⇒ `onSettled('already')`). Lý do chỉ đi qua tham số của `hide` và thân `POST`: không lưu ở đâu.
export function useHide({
  danhGiaId,
  onHidden,
  onSettled,
}: {
  danhGiaId: string;
  // 200: đã ẩn; nơi gọi đóng hộp, tải lại danh sách và báo thành công
  onHidden: () => void;
  onSettled: (kind: HideSettled) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<HideFailure | null>(null);
  // Cờ chống gửi đúp bằng ref: state chưa kịp vẽ lại giữa hai lần bấm trong cùng một lượt xử lý (nút `disabled` chưa kịp có hiệu lực)
  const sending = useRef(false);
  const controller = useRef<AbortController | null>(null);
  // Hàm gọi lại luôn là bản mới nhất mà `hide` không phải đổi danh tính theo từng lần vẽ
  const onHiddenRef = useRef(onHidden);
  const onSettledRef = useRef(onSettled);
  useEffect(() => {
    onHiddenRef.current = onHidden;
    onSettledRef.current = onSettled;
  });
  // Gỡ hộp khi đang gửi (rời trang, đăng xuất): huỷ yêu cầu để không cập nhật state hay tải lại sau khi gỡ
  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );

  const hide = useCallback(
    async (raw: string) => {
      if (sending.current) return;
      const checked = checkReason(raw);
      if (!checked.ok) {
        setFailure({ message: null, kind: 'field', code: checked.code });
        return;
      }
      sending.current = true;
      const abort = new AbortController();
      controller.current = abort;
      setFailure(null);
      setSaving(true);
      // Lấy kết quả trước, cập nhật state và gọi hàm của nơi gọi SAU (lỗi trong `onHidden` không bị coi là lỗi của lời gọi mạng)
      let result: HideFailure | null = null;
      try {
        await hideAdminReview(danhGiaId, checked.value, abort.signal);
      } catch (error: unknown) {
        // Bị huỷ (rời trang, đăng xuất): không báo gì cho người dùng
        if (error instanceof RequestAbortedError) {
          sending.current = false;
          return;
        }
        result = describeHideFailure(error);
      }
      sending.current = false;
      if (abort.signal.aborted) return;
      setSaving(false);

      if (result === null) {
        onHiddenRef.current();
        return;
      }
      if (result.kind === 'already' || result.kind === 'gone') {
        onSettledRef.current(result.kind);
        return;
      }
      setFailure(result);
    },
    [danhGiaId],
  );

  // Gõ lại lý do thì bỏ lỗi của ô; dải chung (503, mạng…) ở lại cho tới lần gửi kế tiếp
  const clearReasonError = useCallback(() => {
    setFailure((current) => (current?.kind === 'field' ? null : current));
  }, []);

  return { saving, failure, hide, clearReasonError };
}
