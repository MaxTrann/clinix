import { useEffect, type RefObject } from 'react';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import type { StartTarget } from '../api/chat-api';
import { isNotFound, recipientInactiveReason } from '../workspace/chat-format';
import { MessageComposer } from '../workspace/message-composer';
import {
  OutgoingBubble,
  ThreadBanner,
  ThreadHeader,
} from '../workspace/thread-parts';
import { useStartThread } from './use-start-thread';

// Khung trước tin đầu của Bệnh nhân (chat F4; PLAN chat 5.13; WCH-12): đầu khung như hội thoại thật (tên, chip quan hệ, banner với bác sĩ), "Chưa có tin nhắn nào.",
// ô soạn. Gắn `key` theo đích ở nơi dùng. Bác sĩ hay chi nhánh không tồn tại ⇒ 404 với câu `START_NOT_FOUND_MESSAGE` (khác câu "không có quyền xem" của hội thoại).

export const START_NOT_FOUND_MESSAGE =
  'Không tìm thấy bác sĩ hoặc chi nhánh này.';

interface StartThreadProps {
  target: StartTarget;
  headingRef: RefObject<HTMLHeadingElement | null>;
  initialDraft: string;
  onDraftChange: (text: string) => void;
  /** Gửi tin đầu xong, hay đã có sẵn hội thoại: mở hội thoại đó. */
  onOpenConversation: (hoiThoaiId: string) => void;
  onBack: (() => void) | null;
}

export function StartThread({
  target,
  headingRef,
  initialDraft,
  onDraftChange,
  onOpenConversation,
  onBack,
}: StartThreadProps) {
  const thread = useStartThread(target, onOpenConversation);
  const { state } = thread;
  const header = state.status === 'ready' ? state.data : null;
  const existing = header?.hoiThoaiId ?? null;

  // Đã có hội thoại với bác sĩ hay chi nhánh này: không dựng khung trống, mở thẳng hội thoại (một hội thoại cho mỗi cặp)
  useEffect(() => {
    if (existing !== null) onOpenConversation(existing);
  }, [existing, onOpenConversation]);

  return (
    <section
      aria-labelledby="chat-thread-title"
      className="flex min-h-0 min-w-0 flex-col"
    >
      <ThreadHeader
        partner={header?.doiTac ?? null}
        quanHe={header?.quanHe ?? null}
        headingRef={headingRef}
        onBack={onBack}
      />
      {state.status === 'loading' && (
        <div className="p-3">
          <LoadingState message="Đang mở khung trò chuyện…" />
        </div>
      )}
      {state.status === 'error' && (
        <div className="p-3">
          {isNotFound(state.error) ? (
            <p role="alert" className="my-2 text-sm text-danger-strong">
              {START_NOT_FOUND_MESSAGE}
            </p>
          ) : (
            <ErrorState error={state.error} onRetry={thread.retry} />
          )}
        </div>
      )}
      {header && existing === null && (
        <>
          {header.banner && <ThreadBanner />}
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
            {thread.pending ? (
              <ol aria-label="Tin nhắn" className="flex flex-col gap-2">
                <OutgoingBubble
                  item={thread.pending}
                  onResend={thread.resend}
                />
              </ol>
            ) : (
              <p className="my-4 text-center text-sm text-gray-600">
                Chưa có tin nhắn nào.
              </p>
            )}
          </div>
          <MessageComposer
            disabled={!thread.canSend}
            disabledReason={
              thread.blocked ? recipientInactiveReason('BenhNhan') : null
            }
            initialDraft={initialDraft}
            onDraftChange={onDraftChange}
            onSend={thread.send}
          />
        </>
      )}
    </section>
  );
}
