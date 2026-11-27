import { useCallback, useEffect, useState } from 'react';
import { RequestAbortedError } from '../../../shared/api/errors';
import { usePolling } from '../../../shared/hooks/use-polling';
import { getConversations } from '../api/chat-api';
import {
  subscribeChatMessages,
  useChatConnectionStatus,
} from '../realtime/chat-connection';
import type {
  ConversationFilter,
  ConversationListItem,
} from '../api/chat-types';

// Danh sách hội thoại của khung nhắn tin (chat F3; PLAN chat 5.6, 5.13; WCH-07). Lọc và tìm đều GỬI LÊN máy chủ (`loc`, `q`): web không lọc hay đếm ở client,
// vì máy chủ mới biết phạm vi chi nhánh và quyền. "Xem thêm" theo con trỏ `truoc`. Làm tươi trang đầu mỗi 15 giây bằng vòng thăm dò dùng chung (tab ẩn tạm dừng,
// mất mạng dừng); khi socket đang nối (chat F2) thì nhịp là 60 giây và tin được đẩy kích hoạt đọc lại trang đầu.
//
// Trạng thái gắn với KHOÁ yêu cầu (bộ lọc + từ khoá + lần thử), nếp `useRemote`: đổi bộ lọc là thấy "đang tải" ngay, phản hồi muộn của bộ lọc cũ bị bỏ.

export const CHAT_REFRESH_MS = 15_000;
/** Socket đang nối (chat F2): vẫn tải bù mỗi 60 giây vì đẩy chỉ là cố gắng hết sức, REST mới là nguồn đúng (PLAN 5.7). */
export const CHAT_LIVE_RESYNC_MS = 60_000;
export const CONVERSATION_PAGE_SIZE = 20;

export interface ListData {
  items: ConversationListItem[];
  next: string | null;
  /** Giờ máy lúc dữ liệu về (luật `react-hooks/purity` cấm đọc đồng hồ lúc render): dùng cho nhãn "HH:mm" hay "dd/MM". */
  loadedAt: number;
}

type Result =
  { status: 'ready'; data: ListData } | { status: 'error'; error: unknown };

export type ListState = { status: 'loading' } | Result;

type MoreState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; error: unknown };

/** Gộp trang đầu mới vào danh sách đang hiện: dòng có trong trang mới lên trước theo thứ tự máy chủ, dòng cũ ở các trang sau giữ nguyên, không trùng. */
export function mergeFirstPage(
  current: ListData,
  fresh: { items: ConversationListItem[]; truocTiepTheo: string | null },
  loadedAt: number,
): ListData {
  // Chưa bấm "Xem thêm" lần nào: thay hẳn bằng trang mới (có cả con trỏ mới)
  if (current.items.length <= CONVERSATION_PAGE_SIZE)
    return { items: fresh.items, next: fresh.truocTiepTheo, loadedAt };
  const freshIds = new Set(fresh.items.map((item) => item.id));
  const rest = current.items.filter((item) => !freshIds.has(item.id));
  return { items: [...fresh.items, ...rest], next: current.next, loadedAt };
}

export function useConversationList(
  filter: ConversationFilter,
  keyword: string,
) {
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([filter, keyword, attempt]);
  const [settled, setSettled] = useState<{
    key: string;
    result: Result;
  } | null>(null);
  const [more, setMore] = useState<{ key: string; state: MoreState } | null>(
    null,
  );
  const query = useCallback(
    (truoc?: string) => ({
      loc: filter,
      q: keyword === '' ? undefined : keyword,
      truoc,
      limit: CONVERSATION_PAGE_SIZE,
    }),
    [filter, keyword],
  );

  useEffect(() => {
    const controller = new AbortController();
    getConversations(query(), controller.signal)
      .then((page) => {
        if (controller.signal.aborted) return;
        setSettled({
          key,
          result: {
            status: 'ready',
            data: {
              items: page.items,
              next: page.truocTiepTheo,
              loadedAt: Date.now(),
            },
          },
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || error instanceof RequestAbortedError)
          return;
        setSettled({ key, result: { status: 'error', error } });
      });
    return () => controller.abort();
    // `query` đổi cùng `filter`, `keyword`, đã nằm trong `key`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const state: ListState =
    settled && settled.key === key ? settled.result : { status: 'loading' };
  const moreState: MoreState =
    more && more.key === key ? more.state : { status: 'idle' };

  /** Đọc lại trang đầu rồi gộp (thăm dò, sau khi gửi tin). Lỗi để vòng thăm dò nuốt: giữ danh sách cũ. */
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      const page = await getConversations(query(), signal);
      const loadedAt = Date.now();
      setSettled((prev) =>
        prev && prev.key === key && prev.result.status === 'ready'
          ? {
              key,
              result: {
                status: 'ready',
                data: mergeFirstPage(prev.result.data, page, loadedAt),
              },
            }
          : prev,
      );
    },
    [key, query],
  );

  const live = useChatConnectionStatus().status === 'connected';

  // F2: có tin được đẩy (bất kỳ hội thoại nào) ⇒ đọc lại trang đầu để dòng đó lên đầu, xem trước và số chưa đọc đúng theo máy chủ
  useEffect(
    () =>
      subscribeChatMessages(() => {
        void refresh().catch(() => {
          // Giữ danh sách cũ; lượt làm tươi sau thử lại
        });
      }),
    [refresh],
  );

  usePolling(
    async (signal) => {
      // Lần tải đầu do effect ở trên làm; vòng thăm dò chỉ làm tươi khi đã có danh sách
      if (state.status !== 'ready') return;
      await refresh(signal);
    },
    live ? CHAT_LIVE_RESYNC_MS : CHAT_REFRESH_MS,
  );

  const nextCursor = state.status === 'ready' ? state.data.next : null;
  const loadMore = useCallback(() => {
    if (nextCursor === null || moreState.status === 'loading') return;
    const cursor = nextCursor;
    setMore({ key, state: { status: 'loading' } });
    getConversations(query(cursor))
      .then((page) => {
        setSettled((prev) => {
          if (!prev || prev.key !== key || prev.result.status !== 'ready')
            return prev;
          const known = new Set(prev.result.data.items.map((item) => item.id));
          return {
            key,
            result: {
              status: 'ready',
              data: {
                items: [
                  ...prev.result.data.items,
                  ...page.items.filter((item) => !known.has(item.id)),
                ],
                next: page.truocTiepTheo,
                loadedAt: Date.now(),
              },
            },
          };
        });
        setMore({ key, state: { status: 'idle' } });
      })
      .catch((error: unknown) => {
        setMore({ key, state: { status: 'error', error } });
      });
  }, [key, moreState.status, nextCursor, query]);

  /** Mở hội thoại và đánh dấu đọc xong thì số ở dòng về 0 ngay, không chờ lượt làm tươi. */
  const markRowRead = useCallback(
    (id: string) => {
      setSettled((prev) =>
        prev && prev.key === key && prev.result.status === 'ready'
          ? {
              key,
              result: {
                status: 'ready',
                data: {
                  ...prev.result.data,
                  items: prev.result.data.items.map((item) =>
                    item.id === id ? { ...item, soTinChuaDoc: 0 } : item,
                  ),
                },
              },
            }
          : prev,
      );
    },
    [key],
  );

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { state, moreState, loadMore, refresh, markRowRead, retry };
}
