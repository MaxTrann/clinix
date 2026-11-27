import { useCallback, useRef, useState } from 'react';
import { ApiError } from '../../../shared/api/errors';
import { useRemote } from '../../../shared/hooks/use-remote';
import { usePageActive } from '../../auth';
import {
  getBranchStart,
  getDoctorStart,
  sendFirstMessage,
  type StartTarget,
} from '../api/chat-api';
import { sendErrorMessage } from '../workspace/chat-format';
import type { OutgoingMessage } from '../workspace/use-message-thread';

// Khung TRƯỚC tin đầu của Bệnh nhân (chat F4; PLAN chat 5.6, 5.13; 2.4.20 b2, b3; 2.4.21 b3, b4). Chỉ ĐỌC đầu khung (tên, banner, quan hệ, `coTheGui`):
// mở trang không tạo hội thoại nào (NBS-03). Đã có hội thoại (`hoiThoaiId` khác `null`) thì nơi gọi mở thẳng hội thoại đó.
// Tin đầu đi bằng REST tới route tìm-hoặc-tạo; thành công ⇒ nơi gọi chuyển sang `?hoiThoai=` (khung tin thường, F3/F2 lo tiếp). Lỗi ⇒ giữ nội dung,
// "Gửi lại" dùng CÙNG `maGui` (máy chủ chống trùng, không thành hai hội thoại hay hai tin); `CHAT_MA_GUI_DA_DUNG` mới đổi mã (như khung tin F3).

const newSendId = () => crypto.randomUUID();

export function useStartThread(
  target: StartTarget,
  onStarted: (hoiThoaiId: string) => void,
) {
  const active = usePageActive();
  const targetKey =
    target.kind === 'doctor'
      ? `bs:${target.bacSiId}`
      : `cn:${target.chiNhanhId}`;
  const { state, retry } = useRemote(
    (signal) =>
      target.kind === 'doctor'
        ? getDoctorStart(target.bacSiId, signal)
        : getBranchStart(target.chiNhanhId, signal),
    [targetKey],
  );
  const [pending, setPending] = useState<OutgoingMessage | null>(null);
  const [blockedBySend, setBlockedBySend] = useState(false);
  const inFlight = useRef(false);

  const deliver = useCallback(
    (maGui: string, noiDung: string) => {
      // Bấm đúp "Gửi lại" hay Enter lặp khi tin đầu đang bay: bỏ lần sau
      if (inFlight.current) return;
      inFlight.current = true;
      setPending({ maGui, noiDung, status: 'sending', error: null });
      sendFirstMessage(target, { noiDung, maGui })
        .then(({ hoiThoaiId }) => {
          if (active.current) onStarted(hoiThoaiId);
        })
        .catch((error: unknown) => {
          if (!active.current) return;
          const code = error instanceof ApiError ? error.maLoi : null;
          if (code === 'CHAT_NGUOI_NHAN_KHONG_HOAT_DONG')
            setBlockedBySend(true);
          setPending({
            maGui: code === 'CHAT_MA_GUI_DA_DUNG' ? newSendId() : maGui,
            noiDung,
            status: 'failed',
            error: sendErrorMessage(error),
          });
        })
        .finally(() => {
          inFlight.current = false;
        });
    },
    [active, onStarted, target],
  );

  /** Chỉ MỘT tin đầu: đang có tin chờ (đang gửi hay lỗi) thì phải gửi lại tin đó trước. */
  const send = useCallback(
    (noiDung: string) => {
      if (pending !== null) return;
      deliver(newSendId(), noiDung);
    },
    [deliver, pending],
  );

  const resend = useCallback(
    (item: OutgoingMessage) => {
      if (item.status === 'failed') deliver(item.maGui, item.noiDung);
    },
    [deliver],
  );

  const header = state.status === 'ready' ? state.data : null;
  const canSend =
    header !== null && header.coTheGui && !blockedBySend && pending === null;

  return {
    state,
    retry,
    pending,
    canSend,
    blocked: header !== null && (!header.coTheGui || blockedBySend),
    send,
    resend,
  };
}
