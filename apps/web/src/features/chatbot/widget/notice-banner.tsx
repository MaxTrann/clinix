import type { RefObject } from 'react';
import { CHATBOT_TEXT } from './chatbot-text';

// b1 của 2.4.7 và "Cấp cứu: gọi 115." LUÔN ghim ở đầu khung, không chỉ lần đầu (PLAN 5.8, 5.14)
export function Banner() {
  return (
    <div className="shrink-0 border-b border-warning-line bg-warning-soft px-3 py-2 text-xs text-warning">
      <p>{CHATBOT_TEXT.bannerLine1}</p>
      <p className="font-semibold">{CHATBOT_TEXT.bannerLine2}</p>
    </div>
  );
}

// Thông báo quyền riêng tư và độ tuổi (Q5). Ô nhập bị khoá tới khi bấm "Tôi hiểu". Nút này là phần tử nhận tiêu điểm đầu khi mở lần đầu.
export function ConsentNotice({
  onAccept,
  focusRef,
}: {
  onAccept: () => void;
  focusRef: RefObject<HTMLElement | null>;
}) {
  return (
    <section className="shrink-0 border-t border-gray-200 bg-white px-3 py-3 text-sm">
      <p className="text-gray-900">{CHATBOT_TEXT.consentNotice}</p>
      <button
        ref={(node) => {
          focusRef.current = node;
        }}
        type="button"
        onClick={onAccept}
        className="mt-2 inline-flex min-h-11 items-center rounded-xl bg-brand-strong px-4 text-sm font-medium text-white hover:bg-cyan-800"
      >
        {CHATBOT_TEXT.consentAccept}
      </button>
    </section>
  );
}
