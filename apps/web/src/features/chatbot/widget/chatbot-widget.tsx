import { Bot } from 'lucide-react';
import { useCallback, useId, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { useMediaQuery } from '../../../shared/hooks/use-media-query';
import { useAuth } from '../../auth';
import { httpChatbotApi, type ChatbotApi } from '../api/chatbot-api';
import { useConversation } from '../state/use-conversation';
import { useSessionReset } from '../state/use-session-reset';
import { ChatbotApiContext } from '../suggest/chatbot-api-context';
import { NarrowFrame, WideFrame } from './chatbot-frames';
import { ChatbotPanel } from './chatbot-panel';
import { CHATBOT_TEXT } from './chatbot-text';
import { isWidgetVisible } from './visibility';
import { WIDE_QUERY } from './widget-config';

export interface ChatbotWidgetProps {
  // Lớp gọi máy chủ. Mặc định là bản thật; CHỈ test truyền lớp giả (`testing/`)
  api?: ChatbotApi;
}

// Khung chat Trợ lý AI (chatbot F1). Gắn MỘT lần ở `router/root-layout.tsx`, nên không bị gỡ khi đổi trang và giữ được lịch sử.
// Lịch sử, bản nháp, việc đã bấm "Tôi hiểu" chỉ nằm ở state React của component này (PLAN 5.9): tải lại trang là mất.
export function ChatbotWidget({ api = httpChatbotApi }: ChatbotWidgetProps) {
  const { status, user } = useAuth();
  const { pathname, key } = useLocation();
  const wide = useMediaQuery(WIDE_QUERY);
  const visible = isWidgetVisible({
    status,
    vaiTro: user?.vaiTro,
    pathname,
  });

  // `openKey` = khoá của vị trí (`location.key`) lúc mở khung; null = đóng
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [consented, setConsented] = useState(false);
  const [draft, setDraft] = useState('');
  const conversation = useConversation(api);
  const { clear } = conversation;
  const launcherRef = useRef<HTMLButtonElement>(null);
  const focusRef = useRef<HTMLElement | null>(null);
  const panelId = useId();

  // Chỉnh state ngay lúc render (nếp `role-shell.tsx`), không cần effect:
  // - nút bị ẩn (ví dụ khách bấm "Lịch hẹn của tôi" bị chuyển sang trang đăng nhập) thì đóng khung, kẻo sau khi quay lại khung tự mở phủ trang;
  // - màn hẹp: đổi trang (kể cả bấm liên kết trong tin) thì đóng khung (Đại duyệt 27/11/2026, Đ7); màn rộng: giữ mở, theo sang trang mới.
  if (openKey !== null) {
    if (!visible || (!wide && openKey !== key)) setOpenKey(null);
    else if (openKey !== key) setOpenKey(key);
  }
  const open = visible && openKey !== null && (wide || openKey === key);

  const close = useCallback(() => {
    setOpenKey(null);
    launcherRef.current?.focus();
  }, []);

  // Đăng xuất hay hết phiên: xoá lịch sử, bản nháp, và hỏi lại "Tôi hiểu" (người kế tiếp phải đọc thông báo; Đ2)
  const resetAll = useCallback(() => {
    clear();
    setConsented(false);
    setDraft('');
    setOpenKey(null);
  }, [clear]);
  useSessionReset(resetAll);

  if (!visible) return null;

  function handleSend() {
    if (conversation.send(draft)) setDraft('');
  }

  // "Xoá hội thoại" xoá cả bản nháp nhưng KHÔNG hỏi lại "Tôi hiểu" (Đ2)
  function handleClear() {
    conversation.clear();
    setDraft('');
  }

  const panel = (
    <ChatbotPanel
      conversation={conversation}
      consented={consented}
      draft={draft}
      focusRef={focusRef}
      onAccept={() => setConsented(true)}
      onDraftChange={setDraft}
      onSend={handleSend}
      // Bấm câu gợi ý nhanh là gửi ngay (Đ4); bản nháp đang gõ được giữ nguyên
      onQuick={(question) => void conversation.send(question)}
      onClear={handleClear}
      onClose={close}
    />
  );

  // `ChatbotApiContext`: thẻ gợi ý (chatbot F2) nằm sâu trong danh sách tin nên lấy cùng lớp API với khung (bản thật, hay lớp giả của test)
  return (
    <ChatbotApiContext.Provider value={api}>
      <button
        ref={launcherRef}
        type="button"
        aria-label={CHATBOT_TEXT.launcher}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => (open ? close() : setOpenKey(key))}
        // Nút tròn 48 px ở góc dưới phải, `z-30` dưới mọi lớp phủ và hộp thoại của trang; từ 640 px có thêm chữ
        className="fixed right-4 bottom-4 z-30 inline-flex size-[48px] items-center justify-center gap-2 rounded-full bg-brand-strong text-white shadow-lg hover:bg-cyan-800 sm:w-auto sm:px-4"
      >
        <Bot aria-hidden="true" className="size-6 shrink-0" />
        <span className="hidden text-sm font-medium sm:inline">
          {CHATBOT_TEXT.launcher}
        </span>
      </button>
      {open &&
        (wide ? (
          <WideFrame
            id={panelId}
            label={CHATBOT_TEXT.launcher}
            focusRef={focusRef}
            onClose={close}
          >
            {panel}
          </WideFrame>
        ) : (
          <NarrowFrame
            id={panelId}
            label={CHATBOT_TEXT.launcher}
            focusRef={focusRef}
            returnFocusRef={launcherRef}
            onClose={close}
          >
            {panel}
          </NarrowFrame>
        ))}
    </ChatbotApiContext.Provider>
  );
}
