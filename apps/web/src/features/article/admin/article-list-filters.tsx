import { X } from 'lucide-react';
import { useId, useState } from 'react';
import type { ArticleStatus, ArticleStatusCounts } from '../api/article-types';
import { ARTICLE_ERROR, articleErrorText } from '../common/article-errors';
import { normalizeHashtag } from '../common/hashtag-name';
import type { ArticleListFilters } from './article-list-query';
import {
  CONTROL_CLASS,
  FIELD_ERROR_CLASS,
  LABEL_CLASS,
} from './article-styles';
import { chipLabel, LIST_TEXT, STATUS_LABEL } from './article-text';

const CHIP_BASE =
  'inline-flex min-h-[44px] items-center rounded-full border px-4 text-sm font-medium';
const CHIP_ON = `${CHIP_BASE} border-brand-strong bg-brand-strong text-white`;
const CHIP_OFF = `${CHIP_BASE} border-gray-300 bg-white text-gray-700`;

// Lọc theo thẻ: gõ tên thẻ rồi Enter (chuẩn hoá như khi gắn thẻ); đang lọc thì hiện thẻ kèm nút bỏ. Đại duyệt 28/11/2026 (ô gõ + Enter).
function TagFilter({
  value,
  onApply,
}: {
  value: string;
  onApply: (tag: string) => void;
}) {
  const id = useId();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  function apply() {
    const result = normalizeHashtag(text);
    if (!result.ok && result.reason === 'INVALID') {
      setError(articleErrorText(ARTICLE_ERROR.tagInvalid) ?? null);
      return;
    }
    setError(null);
    setText('');
    if (result.ok) onApply(result.name);
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className={LABEL_CLASS}>
        {LIST_TEXT.tagFilterLabel}
      </label>
      <input
        id={id}
        type="text"
        value={text}
        placeholder={LIST_TEXT.tagFilterPlaceholder}
        aria-invalid={error === null ? undefined : true}
        aria-describedby={error === null ? undefined : `${id}-error`}
        className={CONTROL_CLASS}
        onChange={(event) => {
          setText(event.currentTarget.value);
          setError(null);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          apply();
        }}
      />
      {error !== null && (
        <p id={`${id}-error`} className={FIELD_ERROR_CLASS}>
          {error}
        </p>
      )}
      {value !== '' && (
        <span className="inline-flex w-fit items-center gap-1 rounded-full bg-brand-soft py-0.5 pr-0.5 pl-3 text-sm text-brand-strong">
          #{value}
          <button
            type="button"
            aria-label={LIST_TEXT.clearTagFilter}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full"
            onClick={() => onApply('')}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </span>
      )}
    </div>
  );
}

interface ArticleFilterBarProps {
  filters: ArticleListFilters;
  // Số đếm theo trạng thái từ máy chủ; null (chưa có hay đang lỗi) ⇒ chip không kèm số
  counts: ArticleStatusCounts | null;
  search: { value: string; onChange: (value: string) => void };
  onStatus: (status: ArticleStatus | null) => void;
  // '' ⇒ bỏ lọc thẻ
  onTag: (tag: string) => void;
}

export function ArticleFilterBar({
  filters,
  counts,
  search,
  onStatus,
  onTag,
}: ArticleFilterBarProps) {
  const searchId = useId();
  const chips: {
    status: ArticleStatus | null;
    label: string;
    count: number | null;
  }[] = [
    {
      status: null,
      label: LIST_TEXT.chipAll,
      count:
        counts === null
          ? null
          : counts.BanNhap + counts.DaXuatBan + counts.LuuTruAn,
    },
    {
      status: 'BanNhap',
      label: STATUS_LABEL.BanNhap,
      count: counts?.BanNhap ?? null,
    },
    {
      status: 'DaXuatBan',
      label: STATUS_LABEL.DaXuatBan,
      count: counts?.DaXuatBan ?? null,
    },
    {
      status: 'LuuTruAn',
      label: STATUS_LABEL.LuuTruAn,
      count: counts?.LuuTruAn ?? null,
    },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div
        role="group"
        aria-label={LIST_TEXT.chipGroupLabel}
        className="flex flex-wrap gap-2"
      >
        {chips.map((chip) => (
          <button
            key={chip.status ?? 'all'}
            type="button"
            aria-pressed={filters.trangThai === chip.status}
            className={filters.trangThai === chip.status ? CHIP_ON : CHIP_OFF}
            onClick={() => onStatus(chip.status)}
          >
            {chipLabel(chip.label, chip.count)}
          </button>
        ))}
      </div>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={searchId} className={LABEL_CLASS}>
            {LIST_TEXT.searchLabel}
          </label>
          <input
            id={searchId}
            type="search"
            value={search.value}
            placeholder={LIST_TEXT.searchPlaceholder}
            className={CONTROL_CLASS}
            onChange={(event) => search.onChange(event.currentTarget.value)}
          />
        </div>
        <TagFilter value={filters.the} onApply={onTag} />
      </div>
    </div>
  );
}
