import { useState, type FormEvent, type RefObject } from 'react';
import { ApiError } from '../../../shared/api/errors';
import { EmptyState } from '../../../shared/ui/empty-state';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import type {
  ChatRole,
  ConversationFilter,
  ConversationListItem,
} from '../api/chat-types';
import {
  KEYWORD_INVALID_MESSAGE,
  KIND_LABELS,
  RELATIONSHIP_LABELS,
  listTimeLabel,
  replyLabel,
  rowLabel,
  unreadText,
} from './chat-format';
import type { ListState } from './use-conversation-list';

// Cột danh sách hội thoại (chat F3; PLAN chat 5.13; WCH-07, WCH-15). Chỉ hiển thị: dữ liệu và việc tải do `useConversationList` ở khung giữ.
// Danh sách là `ul` các NÚT có tên truy cập gồm số chưa đọc; dòng đang mở có `aria-current`. Ô tìm chỉ cho Bác sĩ và Lễ tân, gửi lên máy chủ khi bấm Tìm.

const FILTERS_BY_ROLE: Record<
  ChatRole,
  { value: ConversationFilter; label: string }[]
> = {
  BenhNhan: [
    { value: 'tat-ca', label: 'Tất cả' },
    { value: 'chua-doc', label: 'Chưa đọc' },
    { value: 'bac-si', label: 'Bác sĩ' },
    { value: 'le-tan', label: 'Lễ tân' },
  ],
  BacSi: [
    { value: 'tat-ca', label: 'Tất cả' },
    { value: 'chua-doc', label: 'Chưa đọc' },
  ],
  LeTan: [
    { value: 'tat-ca', label: 'Tất cả' },
    { value: 'chua-doc', label: 'Chưa đọc' },
  ],
};

const SEARCH_HINT: Record<ChatRole, string | null> = {
  BenhNhan: null,
  BacSi: 'Tìm theo họ tên bệnh nhân',
  LeTan: 'Tìm theo họ tên, số điện thoại hoặc email',
};

interface ConversationListProps {
  role: ChatRole;
  filter: ConversationFilter;
  keyword: string;
  state: ListState;
  loadingMore: boolean;
  moreError: unknown;
  selectedId: string | null;
  /** Dòng vừa rời (màn hẹp, bấm Quay lại) nhận lại tiêu điểm. */
  returnFocusId: string | null;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  onFilterChange: (filter: ConversationFilter) => void;
  onSearch: (keyword: string) => void;
  onSelect: (id: string) => void;
  onLoadMore: () => void;
  onRetry: () => void;
}

export function ConversationList({
  role,
  filter,
  keyword,
  state,
  loadingMore,
  moreError,
  selectedId,
  returnFocusId,
  returnFocusRef,
  onFilterChange,
  onSearch,
  onSelect,
  onLoadMore,
  onRetry,
}: ConversationListProps) {
  const [draft, setDraft] = useState(keyword);
  const searchHint = SEARCH_HINT[role];

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    onSearch(draft.trim());
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-col">
      {searchHint && (
        <form role="search" onSubmit={submitSearch} className="flex gap-2 p-3">
          <label htmlFor="chat-search" className="sr-only">
            {searchHint}
          </label>
          <input
            id="chat-search"
            type="search"
            value={draft}
            maxLength={100}
            placeholder={searchHint}
            onChange={(event) => setDraft(event.target.value)}
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-gray-300 px-3 text-sm"
          />
          <button
            type="submit"
            className="min-h-11 shrink-0 rounded-xl border border-gray-300 px-3 text-sm font-medium"
          >
            Tìm
          </button>
        </form>
      )}
      <div
        role="group"
        aria-label="Lọc hội thoại"
        className="flex flex-wrap gap-2 px-3 pb-2"
      >
        {FILTERS_BY_ROLE[role].map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={filter === option.value}
            onClick={() => onFilterChange(option.value)}
            className={`min-h-9 rounded-full px-3 text-sm ${
              filter === option.value
                ? 'bg-brand-strong font-semibold text-white'
                : 'border border-gray-300 text-gray-700'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <ListBody
          role={role}
          state={state}
          keyword={keyword}
          selectedId={selectedId}
          returnFocusId={returnFocusId}
          returnFocusRef={returnFocusRef}
          onSelect={onSelect}
          onRetry={onRetry}
        />
        {state.status === 'ready' && state.data.next !== null && (
          <button
            type="button"
            disabled={loadingMore}
            onClick={onLoadMore}
            className="mt-2 min-h-11 w-full rounded-xl border border-gray-300 text-sm font-medium disabled:opacity-60"
          >
            {loadingMore ? 'Đang tải…' : 'Xem thêm'}
          </button>
        )}
        {moreError !== null && (
          <ErrorState error={moreError} onRetry={onLoadMore} />
        )}
      </div>
    </div>
  );
}

function ListBody({
  role,
  state,
  keyword,
  selectedId,
  returnFocusId,
  returnFocusRef,
  onSelect,
  onRetry,
}: Pick<
  ConversationListProps,
  | 'role'
  | 'state'
  | 'keyword'
  | 'selectedId'
  | 'returnFocusId'
  | 'returnFocusRef'
  | 'onSelect'
  | 'onRetry'
>) {
  if (state.status === 'loading')
    return <LoadingState message="Đang tải danh sách hội thoại…" />;
  if (state.status === 'error') {
    if (
      state.error instanceof ApiError &&
      state.error.maLoi === 'TU_KHOA_KHONG_HOP_LE'
    )
      return (
        <p role="alert" className="my-2 text-sm text-danger-strong">
          {KEYWORD_INVALID_MESSAGE}
        </p>
      );
    return <ErrorState error={state.error} onRetry={onRetry} />;
  }
  const { items, loadedAt } = state.data;
  if (items.length === 0)
    return (
      <EmptyState
        message={
          keyword
            ? 'Không có hội thoại nào khớp từ khoá.'
            : 'Chưa có hội thoại nào.'
        }
      />
    );
  return (
    <ul aria-label="Danh sách hội thoại" className="flex flex-col gap-1">
      {items.map((item) => (
        <li key={item.id}>
          <ConversationRow
            role={role}
            item={item}
            now={loadedAt}
            selected={item.id === selectedId}
            buttonRef={item.id === returnFocusId ? returnFocusRef : undefined}
            onSelect={onSelect}
          />
        </li>
      ))}
    </ul>
  );
}

function ConversationRow({
  role,
  item,
  now,
  selected,
  buttonRef,
  onSelect,
}: {
  role: ChatRole;
  item: ConversationListItem;
  now: number;
  selected: boolean;
  buttonRef: RefObject<HTMLButtonElement | null> | undefined;
  onSelect: (id: string) => void;
}) {
  const badge = unreadText(item.soTinChuaDoc);
  const reply = replyLabel(item);
  // Nhãn phụ: Bệnh nhân thấy loại (Bác sĩ, Lễ tân); Lễ tân thấy nhãn trả lời; hội thoại bác sĩ có thêm quan hệ khám (Q16)
  const tags = [
    role === 'BenhNhan' ? KIND_LABELS[item.loai] : null,
    reply,
    item.quanHe ? RELATIONSHIP_LABELS[item.quanHe] : null,
  ].filter((tag): tag is string => tag !== null);
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={rowLabel(item)}
      aria-current={selected ? 'true' : undefined}
      onClick={() => onSelect(item.id)}
      className={`flex w-full min-w-0 flex-col gap-1 rounded-xl px-3 py-2 text-left ${
        selected ? 'bg-brand-soft' : 'hover:bg-gray-50'
      }`}
    >
      <span className="flex w-full min-w-0 items-center gap-2">
        <span
          className={`min-w-0 flex-1 truncate text-sm ${badge ? 'font-semibold' : 'font-medium'} text-gray-900`}
        >
          {item.doiTac.tenHienThi}
          {item.doiTac.soDienThoai && (
            <span className="font-normal text-gray-500">
              {' '}
              · {item.doiTac.soDienThoai}
            </span>
          )}
        </span>
        <span className="shrink-0 text-xs text-gray-500">
          {listTimeLabel(item.tinCuoi.thoiDiemGui, now)}
        </span>
      </span>
      <span className="flex w-full min-w-0 items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm text-gray-600">
          {item.tinCuoi.nguoiGuiHienThi}: {item.tinCuoi.trichDan}
        </span>
        {badge && (
          <span
            aria-hidden="true"
            className="shrink-0 rounded-full bg-danger px-2 text-xs font-semibold text-white"
          >
            {badge}
          </span>
        )}
      </span>
      {tags.length > 0 && (
        <span className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-gray-100 px-2 text-xs text-gray-700"
            >
              {tag}
            </span>
          ))}
        </span>
      )}
    </button>
  );
}
