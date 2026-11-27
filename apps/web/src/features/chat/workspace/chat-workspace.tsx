import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useMediaQuery } from '../../../shared/hooks/use-media-query';
import { CHAT_QUERY } from '../../../shared/routes/chat-paths';
import type { StartTarget } from '../api/chat-api';
import type { ChatRole, ConversationFilter } from '../api/chat-types';
import { useChatConnectionStatus } from '../realtime/chat-connection';
import { BranchPickerDialog } from '../start/branch-picker-dialog';
import { StartThread } from '../start/start-thread';
import { ConversationList } from './conversation-list';
import { MessageThread } from './message-thread';
import { useConversationList } from './use-conversation-list';

// Khung nhắn tin DÙNG CHUNG cho Bệnh nhân, Bác sĩ, Lễ tân (chat F3; PLAN chat 5.13). Cấu hình theo vai trò chỉ ở chữ và bộ lọc; quyền, phạm vi chi nhánh, nội dung
// đối tác đều do máy chủ quyết (web không lọc ở client). F4, F5 thêm phần riêng (bắt đầu trò chuyện, hộp thư), F2 thay làm tươi bằng socket, F6 thêm tệp.
// - Hội thoại đang mở nằm ở `?hoiThoai=` (liên kết từ Trung tâm thông báo mở thẳng; nút Lùi của trình duyệt về danh sách).
// - Từ 1024 px: hai cột. Hẹp hơn: một màn, có "Quay lại" và Esc về danh sách (WCH-16). Hẹp/rộng do `useMediaQuery` (test kiểm được, nếp patient F11).
// - Tiêu điểm: mở hội thoại ⇒ về tiêu đề khung tin; quay lại (màn hẹp) ⇒ về đúng dòng vừa mở (WCH-15).
// - Nháp theo hội thoại nằm trong bộ nhớ (một `Map` của khung), mất khi rời trang; KHÔNG ghi kho trình duyệt (WCH-17, đột biến 30).
// - chat F4 (chỉ Bệnh nhân): `?bacSi=` hay `?chiNhanh=` (không có `?hoiThoai=`) mở khung TRƯỚC tin đầu (`StartThread`); gửi tin đầu xong hay đã có hội thoại thì
//   THAY đường dẫn bằng `?hoiThoai=` (nút Lùi không quay về khung trống). "Nhắn lễ tân" mở bộ chọn chi nhánh; "Nhắn bác sĩ" dẫn tới trang tra cứu bác sĩ (Q24) mà
//   router truyền xuống (`doctorSearchPath`), để chat không import `features/search`.

export const WIDE_LAYOUT_QUERY = '(min-width: 1024px)';

/** Đích bắt đầu trò chuyện từ đường dẫn (chỉ Bệnh nhân, khi chưa mở hội thoại nào). */
function startTargetOf(
  role: ChatRole,
  params: URLSearchParams,
): StartTarget | null {
  if (role !== 'BenhNhan' || params.get(CHAT_QUERY.conversation) !== null)
    return null;
  const bacSiId = params.get(CHAT_QUERY.doctor);
  if (bacSiId) return { kind: 'doctor', bacSiId };
  const chiNhanhId = params.get(CHAT_QUERY.branch);
  if (chiNhanhId) return { kind: 'branch', chiNhanhId };
  return null;
}

const startKeyOf = (target: StartTarget) =>
  target.kind === 'doctor' ? `bs:${target.bacSiId}` : `cn:${target.chiNhanhId}`;

/** Bỏ mọi tham số mở khung (hội thoại, bác sĩ, chi nhánh) rồi đặt `patch`. */
function withOpen(prev: URLSearchParams, patch: Record<string, string>) {
  const next = new URLSearchParams(prev);
  for (const key of Object.values(CHAT_QUERY)) next.delete(key);
  for (const [key, value] of Object.entries(patch)) next.set(key, value);
  return next;
}

export function ChatWorkspace({
  role,
  doctorSearchPath = null,
}: {
  role: ChatRole;
  /** Trang tra cứu bác sĩ (router truyền cho khung Bệnh nhân); `null` ⇒ không có nút "Nhắn bác sĩ". */
  doctorSearchPath?: string | null;
}) {
  const [params, setParams] = useSearchParams();
  const selectedId = params.get(CHAT_QUERY.conversation);
  const startTarget = startTargetOf(role, params);
  // Khoá của khung đang mở (hội thoại hay khung trước tin đầu): tiêu điểm, nháp, màn hẹp theo khoá này
  const openKey = selectedId ?? (startTarget ? startKeyOf(startTarget) : null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerButton = useRef<HTMLButtonElement>(null);
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
  const connection = useChatConnectionStatus();

  const select = (id: string) => {
    setReturnFocusId(id);
    setParams((prev) => withOpen(prev, { [CHAT_QUERY.conversation]: id }));
  };

  const back = useCallback(() => {
    setParams((prev) => withOpen(prev, {}));
  }, [setParams]);

  // Mở hội thoại thì tiêu điểm về tiêu đề khung tin; về danh sách (màn hẹp) thì về dòng vừa mở
  useEffect(() => {
    if (openKey !== null) threadHeading.current?.focus();
    else returnFocus.current?.focus();
  }, [openKey]);

  // Esc ở màn hẹp quay lại danh sách
  useEffect(() => {
    if (wide || openKey === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') back();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [back, openKey, wide]);

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
      if (openKey === null) return;
      if (text === '') drafts.delete(openKey);
      else drafts.set(openKey, text);
    },
    [drafts, openKey],
  );
  // Tin đầu đã gửi hay đã có sẵn hội thoại: thay khung trước tin đầu bằng hội thoại thật
  const openConversation = useCallback(
    (hoiThoaiId: string) => {
      setParams(
        (prev) => withOpen(prev, { [CHAT_QUERY.conversation]: hoiThoaiId }),
        { replace: true },
      );
      onActivity();
    },
    [onActivity, setParams],
  );
  const startWithBranch = (chiNhanhId: string) => {
    setPickerOpen(false);
    setParams((prev) => withOpen(prev, { [CHAT_QUERY.branch]: chiNhanhId }));
  };

  const showList = wide || openKey === null;

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
      {role === 'BenhNhan' && (
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            ref={pickerButton}
            type="button"
            onClick={() => setPickerOpen(true)}
            className="min-h-11 rounded-xl bg-brand-strong px-4 text-sm font-semibold text-white hover:bg-cyan-800"
          >
            Nhắn lễ tân
          </button>
          {doctorSearchPath && (
            <Link
              to={doctorSearchPath}
              className="inline-flex min-h-11 items-center rounded-xl border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Nhắn bác sĩ
            </Link>
          )}
        </div>
      )}
      {pickerOpen && (
        <BranchPickerDialog
          returnFocusRef={pickerButton}
          onConfirm={startWithBranch}
          onClose={() => setPickerOpen(false)}
        />
      )}
      {connection.everConnected && connection.status !== 'connected' && (
        // Đã từng nối rồi mất (chat F2): tin vẫn đến bằng thăm dò 15 giây, gửi vẫn đi bằng REST
        <p role="status" className="mb-2 text-sm text-gray-600">
          Đang nối lại, tin mới có thể đến chậm.
        </p>
      )}
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
        {selectedId !== null ? (
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
        ) : startTarget && openKey ? (
          <StartThread
            key={openKey}
            target={startTarget}
            headingRef={threadHeading}
            initialDraft={drafts.get(openKey) ?? ''}
            onDraftChange={onDraftChange}
            onOpenConversation={openConversation}
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
