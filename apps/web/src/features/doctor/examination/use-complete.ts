import { useCallback, useEffect, useRef, useState } from 'react';
import { RequestAbortedError } from '../../../shared/api/errors';
import { completeAppointment } from './api/exam-api';
import { describeCompleteFailure, type CompleteFailure } from './exam-messages';

// Máy trạng thái của nút `Hoàn thành ca khám` (doctor-exam F1; PLAN 5.13).
//   step     idle (chỉ nút) → confirming (hàng `Xác nhận hoàn thành?`) → submitting (đang gửi) → về idle hoặc confirming
//   outcome  kết quả lần gửi gần nhất: `done` (200), `already` (409 mà lịch đã `HoanThanh`), `failed` kèm câu lỗi
// Một lần `confirm` = đúng một lời gọi mạng; KHÔNG BAO GIỜ tự gửi lại (lỗi mạng, quá giờ, 200 sai hình dạng nghĩa là "chưa rõ đã lưu": mời tải lại chi tiết).
// API không idempotent: bấm lại sau "chưa rõ" mà lịch đã hoàn thành thì nhận 409 `HoanThanh` ⇒ `already`, nên bấm lại luôn an toàn.
export type CompleteStep = 'idle' | 'confirming' | 'submitting';

export type CompleteOutcome =
  | null
  | { kind: 'done' }
  | { kind: 'already' }
  | { kind: 'failed'; failure: CompleteFailure };

export function useComplete({
  maLichHen,
  onChanged,
}: {
  maLichHen: string;
  // Gọi khi máy chủ đã đổi hay dữ liệu đang hiện chắc chắn lệch: nơi gọi tải lại chi tiết
  onChanged: () => void;
}) {
  const [step, setStep] = useState<CompleteStep>('idle');
  const [outcome, setOutcome] = useState<CompleteOutcome>(null);
  // Cờ chống gửi đúp bằng ref: state chưa kịp vẽ lại giữa hai lần bấm trong cùng một lượt xử lý (nút `disabled` chưa kịp có hiệu lực)
  const sending = useRef(false);
  const controller = useRef<AbortController | null>(null);
  // Hàm gọi lại luôn là bản mới nhất mà `confirm` không phải đổi danh tính theo từng lần vẽ
  const onChangedRef = useRef(onChanged);
  useEffect(() => {
    onChangedRef.current = onChanged;
  });
  // Rời trang khi đang gửi: huỷ yêu cầu để không cập nhật state hay tải lại sau khi gỡ. (`Hủy` và Esc bị khoá khi đang gửi nên "đóng" và "rời trang" là một.)
  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );

  const ask = useCallback(() => {
    if (sending.current) return;
    setOutcome(null);
    setStep('confirming');
  }, []);

  const cancel = useCallback(() => {
    if (sending.current) return;
    setStep('idle');
  }, []);

  const confirm = useCallback(async () => {
    if (sending.current) return;
    sending.current = true;
    const abort = new AbortController();
    controller.current = abort;
    setStep('submitting');
    // Lấy kết quả trước, cập nhật state và gọi hàm của nơi gọi SAU (lỗi trong `onChanged` không bị coi là lỗi của lời gọi mạng)
    let failure: CompleteFailure | null = null;
    try {
      await completeAppointment(maLichHen, abort.signal);
    } catch (error: unknown) {
      if (!(error instanceof RequestAbortedError)) {
        failure = describeCompleteFailure(error);
      } else {
        // Bị huỷ (rời trang, đăng xuất): không báo gì cho người dùng
        sending.current = false;
        return;
      }
    }
    sending.current = false;
    if (abort.signal.aborted) return;

    if (failure === null) {
      setOutcome({ kind: 'done' });
      setStep('idle');
      onChangedRef.current();
      return;
    }
    if (failure.kind === 'already') {
      setOutcome({ kind: 'already' });
      setStep('idle');
    } else {
      setOutcome({ kind: 'failed', failure });
      setStep(failure.kind === 'retry' ? 'confirming' : 'idle');
    }
    if (failure.refresh) onChangedRef.current();
  }, [maLichHen]);

  // `Tải lại chi tiết` sau "chưa rõ": chỉ tải lại, KHÔNG gửi POST
  const reloadDetail = useCallback(() => onChangedRef.current(), []);

  return { step, outcome, ask, cancel, confirm, reloadDetail };
}
