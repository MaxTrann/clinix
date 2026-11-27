import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import type { ChatMessage, ChatRole } from '../api/chat-types';
import {
  NO_ACCESS_MESSAGE,
  dayDividerLabel,
  formatClock,
  isNotFound,
  recipientInactiveReason,
  vnDayKey,
} from './chat-format';
import { MessageComposer } from './message-composer';
import { OutgoingBubble, ThreadBanner, ThreadHeader } from './thread-parts';
import { useMessageThread, type OutgoingMessage } from './use-message-thread';

// Khung tin của MỘT hội thoại (chat F3; PLAN chat 5.13; WCH-08…WCH-11, WCH-15, BCH-04). Gắn `key={hoiThoaiId}` ở nơi dùng.
// - Nội dung tin hiện bằng chữ của React (tự thoát HTML) với `whitespace-pre-wrap`: `<img onerror>` hiện nguyên chữ, không chạy (BCH-04, PLAN 5.11).
// - Tự cuộn xuống cuối khi đang ở cuối (hay tin của chính mình); đang đọc tin cũ thì hiện nút "Tin mới ↓" thay vì kéo người dùng đi. Tải tin cũ hơn thì
//   giữ nguyên chỗ đang đọc (bù phần chiều cao mới thêm ở trên).
// - Vùng `role="log"` (ẩn với mắt) chỉ chứa tin của người khác đến SAU lần tải đầu, nên trình đọc màn hình không đọc cả lịch sử khi mở (WCH-15).

/** Cách đáy dưới ngưỡng này (px) coi như "đang ở cuối". */
const BOTTOM_SLACK_PX = 48;

interface MessageThreadProps {
  hoiThoaiId: string;
  role: ChatRole;
  headingRef: RefObject<HTMLHeadingElement | null>;
  initialDraft: string;
  onDraftChange: (text: string) => void;
  onActivity: () => void;
  onRead: () => void;
  /** Màn hẹp: nút "Quay lại" về danh sách; màn rộng: `null`. */
  onBack: (() => void) | null;
}

export function MessageThread({
  hoiThoaiId,
  role,
  headingRef,
  initialDraft,
  onDraftChange,
  onActivity,
  onRead,
  onBack,
}: MessageThreadProps) {
  const thread = useMessageThread(hoiThoaiId, { onActivity, onRead });
  const { state } = thread;

  const detail = state.status === 'ready' ? state.data.detail : null;
  const blocked = !thread.canSend;
  const reason = blocked ? recipientInactiveReason(role) : null;

  // MỘT tiêu đề cho mọi trạng thái (đang tải, lỗi, sẵn sàng): tiêu điểm đặt lúc mở vẫn giữ khi dữ liệu về, không bị vẽ lại thành phần tử khác
  return (
    <section
      aria-labelledby="chat-thread-title"
      className="flex min-h-0 min-w-0 flex-col"
    >
      <ThreadHeader
        partner={detail?.doiTac ?? null}
        quanHe={detail?.quanHe ?? null}
        headingRef={headingRef}
        onBack={onBack}
      />
      {state.status === 'loading' && (
        <div className="p-3">
          <LoadingState message="Đang tải tin nhắn…" />
        </div>
      )}
      {state.status === 'error' && (
        <div className="p-3">
          {isNotFound(state.error) ? (
            <p role="alert" className="my-2 text-sm text-danger-strong">
              {NO_ACCESS_MESSAGE}
            </p>
          ) : (
            <ErrorState error={state.error} onRetry={thread.retry} />
          )}
        </div>
      )}
      {state.status === 'ready' && detail && (
        <>
          {detail.banner && <ThreadBanner />}
          <MessageList
            messages={state.data.messages}
            now={state.data.loadedAt}
            outbox={thread.outbox}
            hasOlder={state.data.hasOlder}
            olderStatus={thread.older.status}
            onLoadOlder={thread.loadOlder}
            onResend={thread.resend}
          />
          <div role="log" aria-label="Tin nhắn mới đến" className="sr-only">
            {state.data.arrivals.map((message) => (
              <p key={message.id}>
                {message.nguoiGui.tenHienThi}: {message.noiDung}
              </p>
            ))}
          </div>
          <MessageComposer
            disabled={blocked}
            disabledReason={reason}
            initialDraft={initialDraft}
            onDraftChange={onDraftChange}
            onSend={thread.send}
          />
        </>
      )}
    </section>
  );
}

function MessageList({
  messages,
  now,
  outbox,
  hasOlder,
  olderStatus,
  onLoadOlder,
  onResend,
}: {
  messages: ChatMessage[];
  now: number;
  outbox: OutgoingMessage[];
  hasOlder: boolean;
  olderStatus: 'idle' | 'loading' | 'error';
  onLoadOlder: () => void;
  onResend: (item: OutgoingMessage) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const previous = useRef<{
    firstId: string | null;
    lastId: string | null;
    height: number;
    pending: number;
  }>({
    firstId: null,
    lastId: null,
    height: 0,
    pending: 0,
  });
  // Id tin cuối lúc người dùng còn ở đáy; tin cuối khác id này mà họ đang ở trên ⇒ hiện "Tin mới ↓"
  const [seenLastId, setSeenLastId] = useState<string | null>(
    messages.at(-1)?.id ?? null,
  );
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const firstId = messages[0]?.id ?? null;
  const lastId = messages.at(-1)?.id ?? null;
  const lastIsMine = messages.at(-1)?.laCuaToi ?? false;

  const scrollToBottom = () => {
    const box = scroller.current;
    if (box) box.scrollTop = box.scrollHeight;
  };

  useLayoutEffect(() => {
    const box = scroller.current;
    if (!box) return;
    const before = previous.current;
    if (before.lastId === null && before.firstId === null) {
      // Lần vẽ đầu: xuống tin mới nhất
      scrollToBottom();
    } else if (firstId !== before.firstId && lastId === before.lastId) {
      // Vừa tải tin cũ hơn ở trên: giữ nguyên tin đang đọc
      box.scrollTop += box.scrollHeight - before.height;
    } else if (
      (lastId !== before.lastId || outbox.length > before.pending) &&
      (atBottom.current || lastIsMine || outbox.length > before.pending)
    ) {
      scrollToBottom();
    }
    previous.current = {
      firstId,
      lastId,
      height: box.scrollHeight,
      pending: outbox.length,
    };
  }, [firstId, lastId, lastIsMine, outbox.length]);

  const onScroll = () => {
    const box = scroller.current;
    if (!box) return;
    const bottom =
      box.scrollHeight - box.scrollTop - box.clientHeight <= BOTTOM_SLACK_PX;
    atBottom.current = bottom;
    setAwayFromBottom(!bottom);
    if (bottom) setSeenLastId(lastId);
  };

  const showJump = awayFromBottom && lastId !== seenLastId && !lastIsMine;
  const rows = withDayDividers(messages);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scroller}
        onScroll={onScroll}
        data-testid="chat-scroller"
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-2"
      >
        {hasOlder && (
          <button
            type="button"
            disabled={olderStatus === 'loading'}
            onClick={onLoadOlder}
            className="mx-auto mb-2 block min-h-9 rounded-full border border-gray-300 px-3 text-sm disabled:opacity-60"
          >
            {olderStatus === 'loading' ? 'Đang tải…' : 'Xem tin cũ hơn'}
          </button>
        )}
        {olderStatus === 'error' && (
          <p
            role="alert"
            className="mb-2 text-center text-sm text-danger-strong"
          >
            Chưa tải được tin cũ hơn. Bấm "Xem tin cũ hơn" để thử lại.
          </p>
        )}
        {messages.length === 0 && outbox.length === 0 && (
          <p className="my-4 text-center text-sm text-gray-600">
            Chưa có tin nhắn nào.
          </p>
        )}
        <ol aria-label="Tin nhắn" className="flex flex-col gap-2">
          {rows.map(({ message, divider }) => {
            return (
              <li key={message.id} className="flex flex-col">
                {divider && (
                  <p className="my-2 text-center text-xs font-medium text-gray-500">
                    {dayDividerLabel(message.thoiDiemGui, now)}
                  </p>
                )}
                <Bubble message={message} />
              </li>
            );
          })}
          {outbox.map((item) => (
            <OutgoingBubble key={item.maGui} item={item} onResend={onResend} />
          ))}
        </ol>
      </div>
      {showJump && (
        <button
          type="button"
          onClick={() => {
            scrollToBottom();
            atBottom.current = true;
            setAwayFromBottom(false);
            setSeenLastId(lastId);
          }}
          className="absolute bottom-2 left-1/2 min-h-9 -translate-x-1/2 rounded-full bg-brand-strong px-3 text-sm font-semibold text-white shadow"
        >
          Tin mới ↓
        </button>
      )}
    </div>
  );
}

/** Đánh dấu tin đầu của mỗi ngày (giờ Việt Nam) để vẽ ngăn ngày phía trên nó. */
function withDayDividers(messages: ChatMessage[]) {
  return messages.map((message, index) => {
    const before = messages[index - 1];
    return {
      message,
      divider:
        before === undefined ||
        vnDayKey(before.thoiDiemGui) !== vnDayKey(message.thoiDiemGui),
    };
  });
}

function Bubble({ message }: { message: ChatMessage }) {
  const mine = message.laCuaToi;
  return (
    <div className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
      {!mine && (
        <span className="mb-0.5 text-xs text-gray-500">
          {message.nguoiGui.tenHienThi}
        </span>
      )}
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
          mine ? 'bg-brand-soft text-gray-900' : 'bg-gray-100 text-gray-900'
        }`}
      >
        {message.tep && (
          // Chỉ hiện tên tệp; xem ảnh, tải PDF là chat F6
          <p className="mb-1 break-all text-xs text-gray-600">
            {message.tep.loai === 'application/pdf' ? '[Tệp PDF]' : '[Ảnh]'}{' '}
            {message.tep.ten}
          </p>
        )}
        {message.noiDung && (
          <p className="whitespace-pre-wrap break-words">{message.noiDung}</p>
        )}
      </div>
      <time
        dateTime={message.thoiDiemGui}
        className="mt-0.5 text-xs text-gray-500"
      >
        {formatClock(message.thoiDiemGui)}
      </time>
    </div>
  );
}
