import { X } from 'lucide-react';
import type { RefObject } from 'react';
import type { ChatbotApi } from '../api/chatbot-api';
import type { Conversation } from '../state/use-conversation';
import { CHATBOT_TEXT } from './chatbot-text';
import { Composer } from './composer';
import { MessageList } from './message-list';
import { Banner, ConsentNotice } from './notice-banner';

// Thân khung chat, đứng trong `WideFrame` hay `NarrowFrame`. Thứ tự (PLAN 5.14): tiêu đề, banner (luôn ghim), danh sách tin,
// khối thông báo quyền riêng tư (tới khi bấm "Tôi hiểu"), ô nhập. Mọi state nằm ở `ChatbotWidget`, nên đổi giữa màn rộng và màn hẹp không mất gì.
export function ChatbotPanel({
  conversation,
  api,
  messagesPath,
  consented,
  draft,
  focusRef,
  onAccept,
  onDraftChange,
  onSend,
  onQuick,
  onClear,
  onClose,
}: {
  conversation: Conversation;
  api: ChatbotApi;
  messagesPath: string | null;
  consented: boolean;
  draft: string;
  focusRef: RefObject<HTMLElement | null>;
  onAccept: () => void;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onQuick: (question: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-200 bg-white px-3 py-2">
        <h2 className="text-base font-semibold text-gray-900">
          {CHATBOT_TEXT.title}
        </h2>
        <button
          type="button"
          aria-label={CHATBOT_TEXT.close}
          onClick={onClose}
          className="inline-flex size-10 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100"
        >
          <X aria-hidden="true" className="size-5" />
        </button>
      </header>
      <Banner />
      <MessageList
        exchanges={conversation.exchanges}
        api={api}
        messagesPath={messagesPath}
        quickEnabled={consented && !conversation.busy}
        onQuick={onQuick}
        onRetry={() => void conversation.retry()}
      />
      {!consented && <ConsentNotice onAccept={onAccept} focusRef={focusRef} />}
      <Composer
        draft={draft}
        consented={consented}
        busy={conversation.busy}
        canClear={conversation.exchanges.length > 0 || draft !== ''}
        focusRef={focusRef}
        onDraftChange={onDraftChange}
        onSend={onSend}
        onClear={onClear}
      />
    </>
  );
}
