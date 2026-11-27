import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useMediaQuery } from '../../../shared/hooks/use-media-query';
import { CHAT_QUERY } from '../../../shared/routes/chat-paths';
import type { ChatRole, ConversationFilter } from '../api/chat-types';
import { ConversationList } from './conversation-list';
import { MessageThread } from './message-thread';
import { useConversationList } from './use-conversation-list';

// Khung nhắn tin DÙNG CHUNG cho Bệnh nhân, Bác sĩ, Lễ tân (chat F3; PLAN chat 5.13). Cấu hình theo vai trò chỉ ở chữ và bộ lọc; quyền, phạm vi chi nhánh, nội dung
// đối tác đều do máy chủ quyết (web không lọc ở client). F4, F5 thêm phần riêng (bắt đầu trò chuyện, hộp thư), F2 thay làm tươi bằng socket, F6 thêm tệp.
// - Hội thoại đang mở nằm ở `?hoiThoai=` (liên kết từ Trung tâm thông báo mở thẳng; nút Lùi của trình duyệt về danh sách).
// - Từ 1024 px: hai cột. Hẹp hơn: một màn, có "Quay lại" và Esc về danh sách (WCH-16). Hẹp/rộng do `useMediaQuery` (test kiểm được, nếp patient F11).
// - Tiêu điểm: mở hội thoại ⇒ về tiêu đề khung tin; quay lại (màn hẹp) ⇒ về đúng dòng vừa mở (WCH-15).
// - Nháp theo hội thoại nằm trong bộ nhớ (một `Map` của khung), mất khi rời trang; KHÔNG ghi kho trình duyệt (WCH-17, đột biến 30).

export const WIDE_LAYOUT_QUERY = '(min-width: 1024px)';

export function ChatWorkspace({ role }: { role: ChatRole }) {
  const [params, setParams] = useSearchParams();
  const selectedId = params.get(CHAT_QUERY.conversation);
  const wide = useMediaQuery(WIDE_LAYOUT_QUERY);
  const [filter, setFilter] = useState<ConversationFilter>('tat-ca');
  const [keyword, setKeyword] = useState('');
  const list = useConversationList(filter, keyword);
  // Một Map sống suốt đời khung (khởi tạo một lần); đọc qua hàm nên không đọc ref lúc render
  const [drafts] = useState(() => new Map<string, string>());
  const threadHeading = useRef<HTMLHeadingElement>(null);
  const returnFocus = useRef<HTMLButtonElement>(null);
  const [returnFocusId, setReturnFocusId] = useState<string | null>(null);
  const { refresh, markRowRead } = list;

  const select = (id: string) => {
    setReturnFocusId(id);
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set(CHAT_QUERY.conversation, id);
      return next;
    });
  };

  const back = useCallback(() => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete(CHAT_QUERY.conversation);
      return next;
    });
  }, [setParams]);

  // Mở hội thoại thì tiêu điểm về tiêu đề khung tin; về danh sách (màn hẹp) thì về dòng vừa mở
  useEffect(() => {
    if (selectedId !== null) threadHeading.current?.focus();
    else returnFocus.current?.focus();
  }, [selectedId]);

  // Esc ở màn hẹp quay lại danh sách
  useEffect(() => {
    if (wide || selectedId === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') back();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [back, selectedId, wide]);

  const onActivity = useCallback(() => {
    void refresh().catch(() => {
      // Làm tươi danh sách lỗi thì giữ danh sách cũ; lượt thăm dò sau thử lại
    });
  }, [refresh]);
  const onRead = useCallback(() => {
    if (selectedId !== null) markRowRead(selectedId);
  }, [markRowRead, selectedId]);
  const onDraftChange = useCallback(
    (text: string) => {
      if (selectedId === null) return;
      if (text === '') drafts.delete(selectedId);
      else drafts.set(selectedId, text);
    },
    [drafts, selectedId],
  );

  const showList = wide || selectedId === null;
  const showThread = selectedId !== null;

  return (
    <section
      aria-labelledby="chat-page-title"
      className="flex min-w-0 flex-col p-4 sm:p-6"
    >
      <h1
        id="chat-page-title"
        className="mb-3 text-xl font-semibold text-gray-900"
      >
        Tin nhắn
      </h1>
      <div
        className={`grid min-h-[32rem] min-w-0 overflow-hidden rounded-2xl border border-gray-200 bg-white ${
          wide
            ? 'h-[calc(100vh-12rem)] grid-cols-[22rem_minmax(0,1fr)]'
            : 'grid-cols-1'
        }`}
      >
        {showList && (
          <div
            className={`min-h-0 min-w-0 ${wide ? 'border-r border-gray-200' : ''}`}
          >
            <ConversationList
              role={role}
              filter={filter}
              keyword={keyword}
              state={list.state}
              loadingMore={list.moreState.status === 'loading'}
              moreError={
                list.moreState.status === 'error' ? list.moreState.error : null
              }
              selectedId={selectedId}
              returnFocusId={returnFocusId}
              returnFocusRef={returnFocus}
              onFilterChange={setFilter}
              onSearch={setKeyword}
              onSelect={select}
              onLoadMore={list.loadMore}
              onRetry={list.retry}
            />
          </div>
        )}
        {showThread ? (
          <MessageThread
            key={selectedId}
            hoiThoaiId={selectedId}
            role={role}
            headingRef={threadHeading}
            initialDraft={drafts.get(selectedId) ?? ''}
            onDraftChange={onDraftChange}
            onActivity={onActivity}
            onRead={onRead}
            onBack={wide ? null : back}
          />
        ) : (
          wide && (
            <p className="m-auto p-6 text-sm text-gray-600">
              Chọn một hội thoại để xem tin nhắn.
            </p>
          )
        )}
      </div>
    </section>
  );
}
