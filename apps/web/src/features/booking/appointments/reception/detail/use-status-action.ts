import { useCallback, useEffect, useRef, useState } from 'react';
import { changeReceptionStatus } from '../api/reception-status-api';
import type {
  StatusChangeBody,
  StatusChangeResult,
} from '../api/reception-appointment-types';
import { describeStatusFailure, type StatusFailure } from './status-failure';

// Máy trạng thái CHUNG của ba thao tác của Lễ tân (hủy, vắng mặt, tiếp đón; booking F9, TRACKING 3.30 F9-G). Một lần gọi `submit` = một POST; không bao giờ tự gửi lại.
//   idle        chưa gửi (hay vừa `reset`)
//   submitting  đang gửi POST: không đóng được, không bấm lại được
//   failed      lỗi mà bấm lại được: 503, lỗi lạ, lý do bị máy chủ từ chối (`retry`), hay "chưa rõ" (`uncertain`; mạng, quá giờ, 200 sai hình dạng)
//   stopped     dừng hẳn, chỉ còn đóng: lịch đã đổi (409), không có (404), hết phiên, không quyền (`final`)
//   done        xong; `result` là 200 đã kiểm hình dạng (`DaHuy` kèm số hoàn THỰC TẾ)
export type StatusActionState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'failed'; failure: StatusFailure }
  | { kind: 'stopped'; failure: StatusFailure }
  | { kind: 'done'; result: StatusChangeResult };

interface UseStatusActionOptions {
  maLichHen: string;
  // Thành công (200): nơi gọi tải lại chi tiết và danh sách, đóng hộp, báo kết quả
  onSucceeded: (result: StatusChangeResult) => void;
  // Lỗi làm dữ liệu đang hiện lệch máy chủ (409, 404…): nơi gọi tải lại chi tiết (và danh sách) cho nút khớp lại
  onStale: (scope: 'detail' | 'detailAndList') => void;
}

export function useStatusAction({
  maLichHen,
  onSucceeded,
  onStale,
}: UseStatusActionOptions) {
  const [state, setState] = useState<StatusActionState>({ kind: 'idle' });
  // Cờ chống gửi đúp bằng ref: state chưa kịp render giữa hai lần bấm liên tiếp trong cùng một lượt xử lý (nếp F2); cũng là cờ "đang gửi" cho Esc và nút đóng
  const sending = useRef(false);
  // Hai hàm gọi lại luôn là bản mới nhất mà `submit` không phải đổi danh tính theo từng lần vẽ
  const callbacks = useRef({ onSucceeded, onStale });
  useEffect(() => {
    callbacks.current = { onSucceeded, onStale };
  });

  const submit = useCallback(
    async (body: StatusChangeBody) => {
      if (sending.current) return;
      sending.current = true;
      setState({ kind: 'submitting' });
      // Lấy kết quả trước, gọi hàm của nơi gọi SAU (lỗi trong hàm đó không được bị coi là lỗi của POST)
      let outcome:
        | { ok: true; result: StatusChangeResult }
        | { ok: false; failure: StatusFailure };
      try {
        outcome = {
          ok: true,
          result: await changeReceptionStatus(maLichHen, body),
        };
      } catch (error: unknown) {
        outcome = {
          ok: false,
          failure: describeStatusFailure(error, body.trangThai),
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

export type StatusActionController = ReturnType<typeof useStatusAction>;
