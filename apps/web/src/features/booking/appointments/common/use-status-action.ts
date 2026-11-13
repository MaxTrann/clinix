import { useCallback, useEffect, useRef, useState } from 'react';
import type { StatusFailure } from './status-failure';

// Máy trạng thái CHUNG của các thao tác đổi trạng thái lịch hẹn: ba thao tác của Lễ tân (hủy, vắng mặt, tiếp đón; booking F9, TRACKING 3.30 F9-G) và override của Quản trị viên
// (F10). Chuyển từ `reception/detail/use-status-action.ts` lên `common/` ở F10, tổng quát theo thân gửi `B` và kết quả `R`: nơi gọi truyền `perform` (lời gọi mạng) và `describe`
// (câu lỗi). Một lần gọi `submit` = một lời gọi `perform`; không bao giờ tự gửi lại.
//   idle        chưa gửi (hay vừa `reset`)
//   submitting  đang gửi: không đóng được, không bấm lại được
//   failed      lỗi mà bấm lại được: 503, lỗi lạ, lý do bị máy chủ từ chối (`retry`), hay "chưa rõ" (`uncertain`; mạng, quá giờ, 200 sai hình dạng)
//   stopped     dừng hẳn, chỉ còn đóng: lịch đã đổi (409), không có (404), hết phiên, không quyền (`final`)
//   done        xong; `result` là 200 đã kiểm hình dạng
export type StatusActionState<R> =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'failed'; failure: StatusFailure }
  | { kind: 'stopped'; failure: StatusFailure }
  | { kind: 'done'; result: R };

interface UseStatusActionOptions<B, R> {
  maLichHen: string;
  // Lời gọi mạng. Không truyền `signal`: yêu cầu đã gửi thì máy chủ vẫn xử lý dù trang bị gỡ, nên huỷ ở client chỉ làm người dùng không biết kết quả (nếp F2)
  perform: (maLichHen: string, body: B) => Promise<R>;
  // Câu lỗi theo `maLoi` của route này (hàm thuần)
  describe: (error: unknown, body: B) => StatusFailure;
  // Thành công (200): nơi gọi tải lại chi tiết (và danh sách), đóng hộp, báo kết quả
  onSucceeded: (result: R) => void;
  // Lỗi làm dữ liệu đang hiện lệch máy chủ (409, 404…): nơi gọi tải lại chi tiết (và danh sách) cho nút khớp lại
  onStale: (scope: 'detail' | 'detailAndList') => void;
}

export function useStatusAction<B, R>({
  maLichHen,
  perform,
  describe,
  onSucceeded,
  onStale,
}: UseStatusActionOptions<B, R>) {
  const [state, setState] = useState<StatusActionState<R>>({ kind: 'idle' });
  // Cờ chống gửi đúp bằng ref: state chưa kịp render giữa hai lần bấm liên tiếp trong cùng một lượt xử lý (nếp F2); cũng là cờ "đang gửi" cho Esc và nút đóng
  const sending = useRef(false);
  // Các hàm gọi lại luôn là bản mới nhất mà `submit` không phải đổi danh tính theo từng lần vẽ
  const callbacks = useRef({ perform, describe, onSucceeded, onStale });
  useEffect(() => {
    callbacks.current = { perform, describe, onSucceeded, onStale };
  });

  const submit = useCallback(
    async (body: B) => {
      if (sending.current) return;
      sending.current = true;
      setState({ kind: 'submitting' });
      // Lấy kết quả trước, gọi hàm của nơi gọi SAU (lỗi trong hàm đó không được bị coi là lỗi của lời gọi mạng)
      let outcome:
        { ok: true; result: R } | { ok: false; failure: StatusFailure };
      try {
        outcome = {
          ok: true,
          result: await callbacks.current.perform(maLichHen, body),
        };
      } catch (error: unknown) {
        outcome = {
          ok: false,
          failure: callbacks.current.describe(error, body),
        };
      }
      sending.current = false;
      if (outcome.ok) {
        setState({ kind: 'done', result: outcome.result });
        callbacks.current.onSucceeded(outcome.result);
        return;
      }
      const { failure } = outcome;
      setState(
        failure.kind === 'final'
          ? { kind: 'stopped', failure }
          : { kind: 'failed', failure },
      );
      if (failure.refresh !== 'none')
        callbacks.current.onStale(failure.refresh);
    },
    [maLichHen],
  );

  // Về `idle` (mở thao tác khác, đóng hộp). Đang gửi thì không làm gì.
  const reset = useCallback(() => {
    if (sending.current) return;
    setState({ kind: 'idle' });
  }, []);

  const isSending = useCallback(() => sending.current, []);

  return { state, submit, reset, isSending };
}
