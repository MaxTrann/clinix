import { useEffect, useId, useState } from 'react';
import { useNavigate } from 'react-router';
import { ErrorState } from '../../../shared/ui/error-state';
import { doctorTitleLabel } from '../format/doctor-title';
import { DOCTOR_TEAM_PATH, doctorDetailPath } from '../search-paths';
import { useSuggestions } from './use-suggestions';

export function GlobalSearch() {
  const navigate = useNavigate();
  const listId = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const { state, retry } = useSuggestions(query, open);
  const expanded = open && Boolean(query.trim());
  const data = state.status === 'ready' ? state.data : null;
  const groups = [
    {
      label: 'Chuyên khoa',
      items:
        data?.chuyenKhoa.map((item) => ({
          name: item.ten,
          path: `/chuyen-khoa/${encodeURIComponent(item.chuyenKhoaId)}`,
        })) ?? [],
    },
    {
      label: 'Dịch vụ khám',
      items:
        data?.dichVu.map((item) => ({
          name: item.ten,
          path: `${DOCTOR_TEAM_PATH}?${new URLSearchParams({ dichVuKhamId: item.dichVuKhamId })}`,
        })) ?? [],
    },
    {
      label: 'Bác sĩ',
      items:
        data?.bacSi.map((item) => ({
          name: `${doctorTitleLabel(item.chucDanh)} ${item.hoTen}`,
          path: doctorDetailPath(item.bacSiId),
        })) ?? [],
    },
  ];
  const options = groups.flatMap((group) => group.items);
  const activeId =
    expanded && options[active] ? `${listId}-${active}` : undefined;

  useEffect(() => {
    if (activeId)
      document.getElementById(activeId)?.scrollIntoView?.({ block: 'nearest' });
  }, [activeId]);

  function close() {
    setOpen(false);
    setActive(-1);
  }

  function choose(path: string) {
    close();
    void navigate(path);
  }

  let offset = 0;
  return (
    <form
      role="search"
      aria-label="Tìm kiếm trên trang chủ"
      className="relative z-10 mt-8 text-gray-900"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) close();
      }}
      onSubmit={(event) => {
        event.preventDefault();
        const q = query.trim();
        choose(
          q
            ? `${DOCTOR_TEAM_PATH}?${new URLSearchParams({ q })}`
            : DOCTOR_TEAM_PATH,
        );
      }}
    >
      <div className="flex overflow-hidden rounded-2xl bg-white shadow-xl">
        <label className="flex min-w-0 flex-1 items-center gap-3 px-4">
          <img src="/assets/search/home/search.svg" alt="" aria-hidden="true" />
          <span className="sr-only">Tìm bác sĩ, chuyên khoa, dịch vụ</span>
          <input
            type="search"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={expanded}
            aria-controls={expanded ? listId : undefined}
            aria-activedescendant={activeId}
            autoComplete="off"
            maxLength={100}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
              setActive(-1);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(event) => {
              // Không coi Enter xác nhận dấu của bộ gõ tiếng Việt là chọn gợi ý.
              if (event.nativeEvent.isComposing) {
                if (event.key === 'Enter') event.preventDefault();
                return;
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                close();
              }
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                setOpen(true);
                if (options.length)
                  setActive((current) =>
                    event.key === 'ArrowDown'
                      ? (current + 1) % options.length
                      : current <= 0
                        ? options.length - 1
                        : current - 1,
                  );
              }
              if (event.key === 'Enter' && activeId) {
                event.preventDefault();
                choose(options[active].path);
              }
            }}
            placeholder="Tìm bác sĩ, chuyên khoa, dịch vụ"
            className="min-w-0 flex-1 border-0 bg-white py-4 text-gray-900"
          />
        </label>
        <button
          type="submit"
          className="border-l border-gray-200 bg-brand-strong px-5 font-medium text-white"
        >
          Tìm kiếm
        </button>
      </div>
      {expanded && (
        <div className="absolute left-0 top-full mt-2 w-full rounded-2xl border border-gray-100 bg-white shadow-xl">
          <ul
            id={listId}
            role="listbox"
            aria-label="Gợi ý tìm kiếm"
            aria-busy={state.status === 'loading'}
            className="max-h-80 overflow-y-auto rounded-2xl"
          >
            {groups.map((group) => {
              const start = offset;
              offset += group.items.length;
              return (
                group.items.length > 0 && (
                  <li key={group.label} role="group" aria-label={group.label}>
                    <ul role="presentation">
                      {group.items.map((item, index) => {
                        const position = start + index;
                        return (
                          <li
                            key={item.path}
                            id={`${listId}-${position}`}
                            role="option"
                            aria-selected={active === position}
                            onMouseDown={(event) => event.preventDefault()}
                            onMouseMove={() => setActive(position)}
                            onClick={() => choose(item.path)}
                            className={`flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm ${active === position ? 'bg-brand-soft' : 'hover:bg-gray-50'}`}
                          >
                            <span className="min-w-0 break-words font-medium">
                              {item.name}
                            </span>
                            <span className="shrink-0 text-xs text-gray-500">
                              {group.label}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                )
              );
            })}
          </ul>
          {state.status === 'loading' && (
            <p role="status" className="px-4 py-3 text-sm text-gray-600">
              Đang tìm gợi ý…
            </p>
          )}
          {state.status === 'ready' && !options.length && (
            <p role="status" className="px-4 py-3 text-sm text-gray-600">
              Không tìm thấy kết quả phù hợp
            </p>
          )}
          {state.status === 'ready' && options.length > 0 && (
            <p role="status" className="sr-only">
              Có {options.length} gợi ý. Dùng phím lên xuống để chọn.
            </p>
          )}
          {state.status === 'error' && (
            <div className="px-4 py-2">
              <ErrorState error={state.error} onRetry={retry} />
            </div>
          )}
        </div>
      )}
    </form>
  );
}
