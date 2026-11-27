import { useId } from 'react';
import { Link } from 'react-router';
import type { ChuyenKhoaGoiY } from '../api/chatbot-types';
import { CHATBOT_TEXT } from '../widget/chatbot-text';
import { entityPath } from '../widget/entity-paths';
import {
  CHIP_CLASS,
  CHIP_ON_CLASS,
  LINK_CLASS,
  PILL_CLASS,
} from './suggest-styles';
import type { UseSuggestion } from './use-suggestion';

const TEXT = CHATBOT_TEXT.suggest;
// Gợi ý tối đa 3 chuyên khoa (MH4): máy chủ đã cắt, đây là lớp phòng thủ
const MAX_SUGGESTED = 3;

function SpecialtyName({ id, name }: { id: string; name: string }) {
  const path = entityPath('ChuyenKhoa', id);
  if (path === null) return <span className="font-medium">{name}</span>;
  return (
    <Link to={path} className={LINK_CLASS}>
      {name}
    </Link>
  );
}

// Chọn chuyên khoa (2.4.7 b8): thẻ cho từng chuyên khoa máy chủ gợi ý và nút mở danh sách chuyên khoa công khai. Chọn là NGƯỜI DÙNG bấm;
// thẻ vừa hiện thì không gọi mạng (kể cả khi chỉ có một chuyên khoa).
export function SpecialtyPicker({
  suggestions,
  suggestion,
}: {
  suggestions: readonly ChuyenKhoaGoiY[];
  suggestion: UseSuggestion;
}) {
  const { selection, list, choose, toggleList, retryList } = suggestion;
  const groupId = useId();
  const listId = useId();
  const selectId = useId();
  const shown = suggestions.slice(0, MAX_SUGGESTED);

  return (
    <div className="mt-2">
      {shown.length > 0 && (
        <>
          <p id={groupId} className="font-medium">
            {TEXT.specialtyGroup}
          </p>
          <ul aria-labelledby={groupId} className="mt-1 flex flex-col gap-1.5">
            {shown.map((item) => {
              const chosen = selection.chuyenKhoaId === item.chuyenKhoaId;
              const nameId = `${groupId}-${item.chuyenKhoaId}`;
              return (
                <li
                  key={item.chuyenKhoaId}
                  className="flex flex-wrap items-center justify-between gap-2"
                >
                  <span id={nameId}>
                    <SpecialtyName id={item.chuyenKhoaId} name={item.ten} />
                  </span>
                  <button
                    type="button"
                    aria-pressed={chosen}
                    aria-describedby={nameId}
                    onClick={() => choose(item.chuyenKhoaId)}
                    className={chosen ? CHIP_ON_CLASS : CHIP_CLASS}
                  >
                    {chosen ? TEXT.specialtyChosen : TEXT.chooseSpecialty}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <button
        type="button"
        aria-expanded={list.open}
        aria-controls={listId}
        onClick={toggleList}
        className={`mt-2 ${PILL_CLASS}`}
      >
        {TEXT.otherSpecialty}
      </button>
      <div id={listId} className="mt-2">
        {list.open && list.status === 'loading' && (
          <p role="status" className="text-gray-700">
            {TEXT.specialtiesLoading}
          </p>
        )}
        {list.open && list.status === 'error' && list.error !== null && (
          <div className="flex flex-col items-start gap-1.5">
            <p className="text-danger-strong">{list.error.text}</p>
            <button type="button" onClick={retryList} className={PILL_CLASS}>
              {TEXT.retry}
            </button>
          </div>
        )}
        {list.open && list.status === 'ready' && list.items.length === 0 && (
          <p className="text-gray-700">{TEXT.specialtiesEmpty}</p>
        )}
        {list.open && list.status === 'ready' && list.items.length > 0 && (
          <div className="flex flex-col gap-1">
            <label htmlFor={selectId} className="font-medium">
              {TEXT.specialtySelectLabel}
            </label>
            <select
              id={selectId}
              value={selection.chuyenKhoaId ?? ''}
              onChange={(event) => {
                if (event.target.value !== '') choose(event.target.value);
              }}
              className="min-h-9 rounded-xl border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900"
            >
              <option value="" disabled>
                {TEXT.specialtySelectPlaceholder}
              </option>
              {list.items.map((item) => (
                <option key={item.chuyenKhoaId} value={item.chuyenKhoaId}>
                  {item.ten}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
