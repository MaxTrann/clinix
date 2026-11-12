import { useCallback, useEffect, useRef, useState } from 'react';
import {
  cancelPatientAppointment,
  getCancelPreview,
} from '../api/patient-cancel-api';
import type {
  CancelResult,
  RefundAmount,
  RefundPreview,
} from '../api/patient-appointment-types';
import {
  cannotCancelMessage,
  describeCancelError,
  type CancelFailure,
} from './detail-messages';
import { sameRefund } from './refund-text';

// Máy trạng thái của hộp huỷ nội tuyến (booking F2; Figma `421:2`; TRACKING 3.27 F2-I, F2-J). Luồng: mở ⇒ GET xem trước (đúng một lần, chỉ đọc) ⇒ `ready` ⇒
// `Xác nhận hủy` ⇒ POST ⇒ `done` (số THỰC TẾ). `Giữ lịch` chỉ đóng, KHÔNG gọi API nào (LH-05, HLH A2).
//   loadingPreview  đang tải số hoàn dự kiến
//   previewFailed   xem trước lỗi, thử lại được (mạng, 503, lỗi lạ)
//   ready           đã có số dự kiến; `failure` khác `null` khi lần gửi trước lỗi mà bấm lại được (503, "chưa rõ", lỗi lạ)
//   submitting      đang gửi POST: không đóng được, không bấm lại được
//   stopped         dừng hẳn, chỉ còn đóng: lịch không huỷ được (409, xem trước `choPhepHuy = false`), 404, 401, 403
//   done            huỷ xong; `differs` = số thực tế khác số dự kiến (Q18)
export type CancelBoxState =
  | { kind: 'closed' }
  | { kind: 'loadingPreview' }
  | { kind: 'previewFailed'; failure: CancelFailure }
  | {
      kind: 'ready';
      expected: RefundPreview | null;
      failure: CancelFailure | null;
    }
  | { kind: 'submitting'; expected: RefundPreview | null }
  | { kind: 'stopped'; message: string }
  | { kind: 'done'; actual: RefundAmount | null; differs: boolean };

interface UseCancelBoxOptions {
  maLichHen: string;
  // Huỷ thành công (200): trang đổi sang `DaHuy` tại chỗ
  onCancelled: (result: CancelResult) => void;
  // Chi tiết đang hiện đã lệch máy chủ (409, xem trước nói không huỷ được) hoặc người dùng chọn `Tải lại chi tiết`: tải lại chi tiết
  onStale: () => void;
}

export function useCancelBox({
  maLichHen,
  onCancelled,
  onStale,
}: UseCancelBoxOptions) {
  const [state, setState] = useState<CancelBoxState>({ kind: 'closed' });
  // Cờ chống gửi đúp bằng ref: state chưa kịp render giữa hai lần bấm liên tiếp (HL-06); cũng là cờ "đang gửi" cho `Esc` và `Giữ lịch`
  const submitting = useRef(false);
  const previewRequest = useRef<AbortController | null>(null);
  // Số dự kiến của lần xem trước hiện tại: để so với số thực tế sau khi huỷ
  const expected = useRef<RefundPreview | null>(null);

  // Gỡ trang giữa chừng thì huỷ yêu cầu xem trước (chỉ đọc). Yêu cầu huỷ lịch đã gửi thì KHÔNG huỷ được, và không cần: máy chủ vẫn xử lý.
  useEffect(() => () => previewRequest.current?.abort(), []);

  const loadPreview = useCallback(() => {
    previewRequest.current?.abort();
    const controller = new AbortController();
    previewRequest.current = controller;
    setState({ kind: 'loadingPreview' });
    getCancelPreview(maLichHen, controller.signal).then(
      (preview) => {
        if (controller.signal.aborted) return;
        if (!preview.choPhepHuy) {
          // Lịch đã đổi trạng thái giữa lúc mở trang và lúc mở hộp: dừng, và tải lại chi tiết để trang hiện đúng trạng thái
          setState({ kind: 'stopped', message: cannotCancelMessage() });
          onStale();
          return;
        }
        expected.current = preview.hoanCoc;
        setState({ kind: 'ready', expected: preview.hoanCoc, failure: null });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        const failure = describeCancelError(error, 'preview');
        setState(
          failure.kind === 'final'
            ? { kind: 'stopped', message: failure.message }
            : { kind: 'previewFailed', failure },
        );
        if (failure.reloadDetail) onStale();
      },
    );
  }, [maLichHen, onStale]);

  // Đóng mà không đổi gì, KHÔNG gọi API. Đang gửi thì không đóng (yêu cầu không huỷ được, đóng giữa chừng người dùng không biết kết quả).
  const dismiss = useCallback(() => {
    if (submitting.current) return;
    previewRequest.current?.abort();
    setState({ kind: 'closed' });
  }, []);

  const confirm = useCallback(async () => {
    if (submitting.current) return;
    submitting.current = true;
    setState({ kind: 'submitting', expected: expected.current });
    try {
      const result = await cancelPatientAppointment(maLichHen);
      setState({
        kind: 'done',
        actual: result.hoanCoc,
        differs: !sameRefund(expected.current, result.hoanCoc),
      });
      onCancelled(result);
    } catch (error: unknown) {
      const failure = describeCancelError(error, 'submit');
      setState(
        failure.kind === 'final'
          ? { kind: 'stopped', message: failure.message }
          : { kind: 'ready', expected: expected.current, failure },
      );
      if (failure.reloadDetail) onStale();
    } finally {
      submitting.current = false;
    }
  }, [maLichHen, onCancelled, onStale]);

  return {
    state,
    open: loadPreview,
    retryPreview: loadPreview,
    dismiss,
    confirm,
  };
}

export type CancelBoxController = ReturnType<typeof useCancelBox>;
