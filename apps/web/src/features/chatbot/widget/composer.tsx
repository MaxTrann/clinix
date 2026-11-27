import { Send } from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { MAX_QUESTION_LENGTH } from '../api/chatbot-types';
import { countCodePoints, questionProblem } from '../state/question';
import { CHATBOT_TEXT, counterText } from './chatbot-text';

export function Composer({
  draft,
  consented,
  busy,
  canClear,
  focusRef,
  onDraftChange,
  onSend,
  onClear,
}: {
  draft: string;
  // Chưa bấm "Tôi hiểu" thì ô nhập và nút gửi bị khoá
  consented: boolean;
  busy: boolean;
  canClear: boolean;
  // Phần tử nhận tiêu điểm đầu khi mở khung: ô nhập (khi đã đồng ý)
  focusRef: RefObject<HTMLElement | null>;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onClear: () => void;
}) {
  const errorId = useId();
  const problem = questionProblem(draft);
  const tooLong = problem === 'tooLong';
  const sendDisabled = !consented || busy || problem !== null;

  // Vừa bấm "Tôi hiểu" thì nút đó biến mất: đưa tiêu điểm vào ô nhập
  const wasConsented = useRef(consented);
  useEffect(() => {
    if (!wasConsented.current && consented) focusRef.current?.focus();
    wasConsented.current = consented;
  }, [consented, focusRef]);

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey) return;
    // Đang gõ dấu tiếng Việt (IME, Telex trên điện thoại): Enter chốt chữ, không phải gửi
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    if (!sendDisabled) onSend();
  }

  return (
    <div className="shrink-0 border-t border-gray-200 bg-white px-3 py-3">
      <div className="flex items-end gap-2">
        <textarea
          ref={(node) => {
            if (consented) focusRef.current = node;
          }}
          aria-label={CHATBOT_TEXT.inputLabel}
          placeholder={CHATBOT_TEXT.inputLabel}
          rows={2}
          value={draft}
          disabled={!consented}
          aria-invalid={tooLong}
          aria-describedby={tooLong ? errorId : undefined}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={handleKeyDown}
          className="max-h-32 min-h-11 min-w-0 flex-1 resize-none px-3 py-2 text-sm"
        />
        <button
          type="button"
          aria-label={CHATBOT_TEXT.send}
          disabled={sendDisabled}
          // Giữ tiêu điểm ở ô nhập khi bấm chuột để gõ tiếp ngay
          onMouseDown={(event) => event.preventDefault()}
          onClick={onSend}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-strong text-white hover:bg-cyan-800 disabled:opacity-50"
        >
          <Send aria-hidden="true" className="size-5" />
        </button>
      </div>
      {tooLong && (
        <p id={errorId} className="mt-1 text-xs text-danger-strong">
          {CHATBOT_TEXT.errorInvalid}
        </p>
      )}
      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-gray-600">
        <button
          type="button"
          disabled={!canClear}
          onClick={onClear}
          className="font-medium text-brand-strong underline disabled:opacity-50"
        >
          {CHATBOT_TEXT.clear}
        </button>
        <span className={tooLong ? 'font-medium text-danger' : undefined}>
          {counterText(countCodePoints(draft.trim()), MAX_QUESTION_LENGTH)}
        </span>
      </div>
    </div>
  );
}
