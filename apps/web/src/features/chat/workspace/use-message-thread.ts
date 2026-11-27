import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, RequestAbortedError } from '../../../shared/api/errors';
import { usePolling } from '../../../shared/hooks/use-polling';
import { usePageActive } from '../../auth';
import {
  getConversation,
  getMessages,
  markConversationRead,
  sendMessage,
} from '../api/chat-api';
import type { ChatMessage, ConversationDetail } from '../api/chat-types';
import { sendErrorMessage } from './chat-format';
import { CHAT_REFRESH_MS } from './use-conversation-list';

// Một hội thoại đang mở (chat F3; PLAN chat 5.6, 5.9, 5.13; WCH-08, WCH-09, WCH-11). Component dùng hook này được gắn `key` theo id hội thoại,
// nên đổi hội thoại là state mới hoàn toàn (không lẫn tin, nháp, mốc của hội thoại trước).
//
// Ba điểm khó:
//  1. MỐC BÙ (`syncedUpTo`): làm tươi 15 giây hỏi `sau=<mốc>`. Mốc CHỈ tiến theo các trang tin đọc bằng GET, KHÔNG theo tin mình vừa gửi: tin người kia
//     gửi trước tin mình (id nhỏ hơn) mà chưa kịp tải sẽ bị bỏ sót nếu mốc nhảy tới id tin của mình. Cùng lý do, F2 không lấy mốc từ tin được đẩy (đột biến 28).
//  2. GỬI LẠI cùng `maGui` (A1; đột biến 29): lỗi mạng hay quá giờ thì máy chủ có thể đã ghi, gửi lại cùng mã được 200 cùng thân chứ không thành hai tin.
//     Chỉ `CHAT_MA_GUI_DA_DUNG` (mã đã dùng cho nội dung KHÁC) mới cần mã mới. Bấm đúp: một mã đang bay thì lần bấm sau bị bỏ.
//  3. ĐÁNH DẤU ĐỌC (WCH-11): gọi với id lớn nhất đang hiện, chỉ khi tab hiện; MỘT lần cho mỗi giá trị, kể cả `StrictMode` chạy effect hai lần (ghi nhớ
//     giá trị đã gửi trong ref TRƯỚC khi gọi API).

export const MESSAGE_PAGE_SIZE = 30;
/** Trần số trang đọc liên tiếp trong một lượt làm tươi (hội thoại rất sôi động thì lượt sau đọc tiếp). */
const MAX_CATCH_UP_PAGES = 5;

/** So hai id BIGINT dạng chuỗi (không đổi sang `number`: vượt 2^53 thì sai). */
export function compareIds(a: string, b: string): number {
  if (a.length !== b.length) return a.length - b.length;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Gộp tin theo id, bỏ trùng (bản mới đè bản cũ), sắp TĂNG dần. */
export function mergeMessages(
  current: ChatMessage[],
  incoming: ChatMessage[],
): ChatMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => compareIds(a.id, b.id));
}

export interface OutgoingMessage {
  maGui: string;
  noiDung: string;
  status: 'sending' | 'failed';
  error: string | null;
}

interface ThreadData {
  detail: ConversationDetail;
  messages: ChatMessage[];
  hasOlder: boolean;
  /** Tin của người khác đến SAU lần tải đầu (qua làm tươi): chỉ những tin này được đọc lên ở vùng `log` (WCH-15). */
  arrivals: ChatMessage[];
  loadedAt: number;
}

type ThreadState =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'ready'; data: ThreadData };

type OlderState =
  { status: 'idle' } | { status: 'loading' } | { status: 'error' };

const newSendId = () => crypto.randomUUID();

export function useMessageThread(
  hoiThoaiId: string,
  { onActivity, onRead }: { onActivity: () => void; onRead: () => void },
) {
  const active = usePageActive();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ThreadState>({ status: 'loading' });
  const [older, setOlder] = useState<OlderState>({ status: 'idle' });
  const [outbox, setOutbox] = useState<OutgoingMessage[]>([]);
  // Người nhận ngưng hoạt động phát hiện lúc gửi (409) thì khoá ô soạn ngay, không chờ tải lại chi tiết
  const [blockedBySend, setBlockedBySend] = useState(false);
  const syncedUpTo = useRef<string | null>(null);
  const inFlight = useRef(new Set<string>());
  const lastMarked = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    Promise.all([
      getConversation(hoiThoaiId, signal),
      getMessages(hoiThoaiId, { limit: MESSAGE_PAGE_SIZE }, signal),
    ])
      .then(([detail, page]) => {
        if (signal.aborted) return;
        syncedUpTo.current = page.items.at(-1)?.id ?? null;
        setState({
          status: 'ready',
          data: {
            detail,
            messages: page.items,
            hasOlder: page.coThem,
            arrivals: [],
            loadedAt: Date.now(),
          },
        });
      })
      .catch((error: unknown) => {
        if (signal.aborted || error instanceof RequestAbortedError) return;
        setState({ status: 'error', error });
      });
    return () => controller.abort();
  }, [hoiThoaiId, attempt]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  // Làm tươi: đọc các tin mới hơn mốc bù, gộp, bỏ trùng (tin mình vừa gửi đã có sẵn thì không hiện hai lần)
  usePolling(async (signal) => {
    if (state.status !== 'ready') return;
    const fetched: ChatMessage[] = [];
    for (let page = 0; page < MAX_CATCH_UP_PAGES; page += 1) {
      const cursor = syncedUpTo.current;
      const result = await getMessages(
        hoiThoaiId,
        {
          cursor: cursor === null ? null : { sau: cursor },
          limit: MESSAGE_PAGE_SIZE,
        },
        signal,
      );
      fetched.push(...result.items);
      const last = result.items.at(-1);
      if (last) syncedUpTo.current = last.id;
      // Không con trỏ ⇒ máy chủ trả trang MỚI NHẤT, `coThem` lúc đó nói về tin CŨ hơn: không đọc tiếp
      if (cursor === null || !result.coThem || !last) break;
    }
    if (fetched.length === 0) return;
    setState((prev) => {
      if (prev.status !== 'ready') return prev;
      const known = new Set(prev.data.messages.map((message) => message.id));
      const fresh = fetched.filter(
        (message) => !known.has(message.id) && !message.laCuaToi,
      );
      return {
        status: 'ready',
        data: {
          ...prev.data,
          messages: mergeMessages(prev.data.messages, fetched),
          arrivals: [...prev.data.arrivals, ...fresh],
          loadedAt: Date.now(),
        },
      };
    });
    onActivity();
  }, CHAT_REFRESH_MS);

  const loadOlder = useCallback(() => {
    if (state.status !== 'ready' || !state.data.hasOlder) return;
    if (older.status === 'loading') return;
    const first = state.data.messages[0];
    if (!first) return;
    setOlder({ status: 'loading' });
    getMessages(hoiThoaiId, {
      cursor: { truoc: first.id },
      limit: MESSAGE_PAGE_SIZE,
    })
      .then((page) => {
        if (!active.current) return;
        setState((prev) =>
          prev.status === 'ready'
            ? {
                status: 'ready',
                data: {
                  ...prev.data,
                  messages: mergeMessages(prev.data.messages, page.items),
                  hasOlder: page.coThem,
                },
              }
            : prev,
        );
        setOlder({ status: 'idle' });
      })
      .catch(() => {
        if (active.current) setOlder({ status: 'error' });
      });
  }, [active, hoiThoaiId, older.status, state]);

  const deliver = useCallback(
    (maGui: string, noiDung: string) => {
      // Bấm đúp "Gửi lại" hay Enter lặp: mã này đang bay thì không gửi lần hai
      if (inFlight.current.has(maGui)) return;
      inFlight.current.add(maGui);
      sendMessage(hoiThoaiId, { noiDung, maGui })
        .then(({ tinNhan }) => {
          if (!active.current) return;
          setState((prev) =>
            prev.status === 'ready'
              ? {
                  status: 'ready',
                  data: {
                    ...prev.data,
                    messages: mergeMessages(prev.data.messages, [tinNhan]),
                  },
                }
              : prev,
          );
          setOutbox((prev) => prev.filter((item) => item.maGui !== maGui));
          onActivity();
        })
        .catch((error: unknown) => {
          if (!active.current) return;
          const code = error instanceof ApiError ? error.maLoi : null;
          if (code === 'CHAT_NGUOI_NHAN_KHONG_HOAT_DONG')
            setBlockedBySend(true);
          setOutbox((prev) =>
            prev.map((item) =>
              item.maGui === maGui
                ? {
                    // Mã đã dùng cho nội dung KHÁC: lần gửi lại phải có mã mới. Mọi lỗi khác giữ NGUYÊN mã (A1)
                    maGui: code === 'CHAT_MA_GUI_DA_DUNG' ? newSendId() : maGui,
                    noiDung,
                    status: 'failed',
                    error: sendErrorMessage(error),
                  }
                : item,
            ),
          );
        })
        .finally(() => inFlight.current.delete(maGui));
    },
    [active, hoiThoaiId, onActivity],
  );

  /** Gửi tin mới; nội dung đã được ô soạn kiểm (không rỗng, không quá dài). */
  const send = useCallback(
    (noiDung: string) => {
      const maGui = newSendId();
      setOutbox((prev) => [
        ...prev,
        { maGui, noiDung, status: 'sending', error: null },
      ]);
      deliver(maGui, noiDung);
    },
    [deliver],
  );

  const resend = useCallback(
    (item: OutgoingMessage) => {
      if (item.status !== 'failed') return;
      setOutbox((prev) =>
        prev.map((row) =>
          row.maGui === item.maGui
            ? { ...row, status: 'sending', error: null }
            : row,
        ),
      );
      deliver(item.maGui, item.noiDung);
    },
    [deliver],
  );

  const latestId =
    state.status === 'ready' ? (state.data.messages.at(-1)?.id ?? null) : null;

  useEffect(() => {
    if (latestId === null) return;
    const mark = () => {
      if (document.visibilityState !== 'visible') return;
      const previous = lastMarked.current;
      if (previous !== null && compareIds(latestId, previous) <= 0) return;
      lastMarked.current = latestId;
      markConversationRead(hoiThoaiId, latestId)
        .then(() => {
          if (active.current) onRead();
        })
        .catch(() => {
          // Ghi mốc lỗi: trả lại giá trị cũ để lần tab hiện lại hay tin mới sau thử lại
          if (lastMarked.current === latestId) lastMarked.current = previous;
        });
    };
    mark();
    document.addEventListener('visibilitychange', mark);
    return () => document.removeEventListener('visibilitychange', mark);
  }, [active, hoiThoaiId, latestId, onRead]);

  const canSend =
    state.status === 'ready' && state.data.detail.coTheGui && !blockedBySend;

  return {
    state,
    older,
    outbox,
    canSend,
    blockedBySend,
    loadOlder,
    send,
    resend,
    retry,
  };
}
