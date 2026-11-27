import { useEffect, useRef } from 'react';
import type { ChatbotApi } from '../api/chatbot-api';
import { canRetryOutcome, type Exchange } from '../state/exchange';
import { CHATBOT_TEXT } from './chatbot-text';
import { ReplyView } from './reply-view';

const BUTTON_CLASS =
  'inline-flex min-h-9 items-center rounded-xl border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-50';

function ExchangeView({
  exchange,
  canRetry,
  api,
  messagesPath,
  onRetry,
}: {
  exchange: Exchange;
  canRetry: boolean;
  api: ChatbotApi;
  messagesPath: string | null;
  onRetry: () => void;
}) {
  const { outcome } = exchange;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {/* Câu người dùng hiện nguyên chữ đã gõ (giữ xuống dòng), khác với bản đã che chỉ gửi cho máy chủ */}
      <div className="ml-auto max-w-[85%] rounded-2xl bg-brand-strong px-3 py-2 text-sm break-words whitespace-pre-wrap text-white">
        <span className="sr-only">{CHATBOT_TEXT.srUser}</span>
        {exchange.question}
      </div>
      {outcome.kind === 'pending' && (
        <p className="text-sm text-gray-600">{CHATBOT_TEXT.typing}</p>
      )}
      {outcome.kind === 'reply' && (
        <div className="max-w-[92%] min-w-0">
          <ReplyView
            reply={outcome.reply}
            api={api}
            messagesPath={messagesPath}
          />
        </div>
      )}
      {outcome.kind === 'error' && (
        <div className="max-w-[92%] rounded-2xl border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-strong">
          <span className="sr-only">{CHATBOT_TEXT.srAssistant}</span>
          {outcome.text}
        </div>
      )}
      {canRetry && (
        <button
          type="button"
          onClick={onRetry}
          className={`self-start ${BUTTON_CLASS}`}
        >
          {CHATBOT_TEXT.retry}
        </button>
      )}
    </div>
  );
}

export function MessageList({
  exchanges,
  api,
  messagesPath,
  quickEnabled,
  onQuick,
  onRetry,
}: {
  exchanges: readonly Exchange[];
  api: ChatbotApi;
  messagesPath: string | null;
  // Gợi ý nhanh bị khoá tới khi người dùng bấm "Tôi hiểu"
  quickEnabled: boolean;
  onQuick: (question: string) => void;
  onRetry: () => void;
}) {
  const logRef = useRef<HTMLDivElement>(null);
  // Tin mới luôn cuộn vào tầm nhìn
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [exchanges]);

  return (
    <div
      ref={logRef}
      role="log"
      aria-live="polite"
      aria-label={CHATBOT_TEXT.log}
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto bg-gray-50 px-3 py-3"
    >
      <div className="max-w-[92%] rounded-2xl bg-gray-100 px-3 py-2 text-sm text-gray-900">
        <span className="sr-only">{CHATBOT_TEXT.srAssistant}</span>
        {CHATBOT_TEXT.greeting}
      </div>
      {exchanges.length === 0 && (
        <div className="flex flex-col items-start gap-2">
          {CHATBOT_TEXT.quickQuestions.map((question) => (
            <button
              key={question}
              type="button"
              disabled={!quickEnabled}
              onClick={() => onQuick(question)}
              className="rounded-xl border border-brand-strong bg-white px-3 py-1.5 text-left text-sm text-brand-strong hover:bg-brand-soft disabled:opacity-50"
            >
              {question}
            </button>
          ))}
        </div>
      )}
      {exchanges.map((exchange, index) => (
        <ExchangeView
          key={exchange.id}
          exchange={exchange}
          // "Gửi lại" chỉ ở lượt CUỐI (Đại duyệt 27/11/2026, Đ1)
          canRetry={
            index === exchanges.length - 1 && canRetryOutcome(exchange.outcome)
          }
          api={api}
          messagesPath={messagesPath}
          onRetry={onRetry}
        />
      ))}
    </div>
  );
}
