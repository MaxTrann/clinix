import { useCallback, useEffect, useRef, useState } from 'react';
import {
  describeRescheduleFailure,
  withUncertainHint,
  type FailureContext,
  type RescheduleFailure,
} from './reschedule-failure';

// Trạng thái gửi (reschedule F2). `idle`: chưa gửi hoặc đã bấm lại. `submitting`: đang chờ máy chủ (thành công cũng ở lại trạng thái này cho tới khi trang chuyển đi, để nút không bật lại giữa chừng).
// `failed`: lần gửi vừa rồi lỗi, `failure` nói phải làm gì.
export type SubmitState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'failed'; failure: RescheduleFailure };

interface UseRescheduleSubmitOptions<Result> {
  // Gọi POST của nơi dùng với chữ lý do ĐÃ chuẩn hoá (hoặc `null` khi không có ô lý do). KHÔNG truyền `signal`: yêu cầu đã gửi thì máy chủ vẫn xử lý dù trang bị gỡ
  send: (reason: string | null) => Promise<Result>;
  // Ngữ cảnh của nơi dùng (tên trường lý do, câu "chưa rõ"…); xem `FailureContext`
  context: FailureContext;
  // 201: trang điều hướng sang chi tiết lịch (WDH-05, WDO-04)
  onDone: (result: Result) => void;
  // Khung giờ vừa bị đặt, giữ, qua giờ hay biến mất: trang về lưới và tải lại lưới (WDH-06, WDO-05)
  onSlotGone: (maLoi: string) => void;
}

/**
 * Gửi đổi lịch MỘT lần mỗi cú bấm: LÕI dùng chung của Bệnh nhân (reschedule F2; WDH-05, WDH-07) và Lễ tân đổi hộ (reschedule F3; WDO-04, WDO-06, WDO-12). Chốt bằng `useRef`, không chỉ state: hai cú bấm
 * trong cùng một nhịp render đều thấy state cũ nên chỉ ref chặn được lần thứ hai. Chốt hạ trong `finally` để gửi lại được sau lỗi. Cờ `alive` chặn mọi cập nhật và điều hướng sau khi trang đã bị gỡ
 * (người dùng rời đi giữa lúc chờ; yêu cầu đã gửi thì máy chủ vẫn xử lý).
 * `forcedRequest`: máy chủ vừa đòi lý do (`VUOT_SO_LAN_TU_DOI`: hết lần tự đổi giữa lúc xem trước và lúc gửi; chỉ đường Bệnh nhân) ⇒ trang chuyển sang nhánh yêu cầu NGAY TẠI CHỖ (không GET lại preview, không điều hướng).
 * `reasonFocus` tăng mỗi lần lỗi nằm ở ô lý do (máy chủ đòi lý do, hay 400 ở trường lý do): trang dùng nó để đưa tiêu điểm vào ô.
 * Sau một lần "chưa rõ" mà lần gửi lại ra 404 hay mã "đã thành công" của ngữ cảnh thì kèm gợi ý "lần trước có thể đã thành công" (WDH-46, WDH-47, WDO-11).
 */
export function useRescheduleSubmit<Result>({
  send,
  context,
  onDone,
  onSlotGone,
}: UseRescheduleSubmitOptions<Result>) {
  const [state, setState] = useState<SubmitState>({ kind: 'idle' });
  const [forcedRequest, setForcedRequest] = useState(false);
  const [reasonFocus, setReasonFocus] = useState(0);
  const busy = useRef(false);
  const alive = useRef(true);
  const sawUncertain = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const submit = useCallback(
    async (reason: string | null) => {
      if (busy.current) return;
      busy.current = true;
      setState({ kind: 'submitting' });
      try {
        const result = await send(reason);
        if (alive.current) onDone(result);
      } catch (error: unknown) {
        if (!alive.current) return;
        const described = describeRescheduleFailure(error, 'submit', context);
        if (described.kind === 'uncertain') sawUncertain.current = true;
        const failure = sawUncertain.current
          ? withUncertainHint(described, context)
          : described;
        if (failure.kind === 'slotGone' && failure.maLoi !== null) {
          onSlotGone(failure.maLoi);
          return;
        }
        if (failure.kind === 'needsReason') setForcedRequest(true);
        if (
          failure.kind === 'needsReason' ||
          failure.kind === 'reasonInvalid'
        ) {
          setReasonFocus((n) => n + 1);
        }
        setState({ kind: 'failed', failure });
      } finally {
        busy.current = false;
      }
    },
    [send, context, onDone, onSlotGone],
  );

  return { state, submit, forcedRequest, reasonFocus };
}
