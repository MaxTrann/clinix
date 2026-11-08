import { useEffect, useRef, useState } from 'react';
import { useMediaQuery } from '../../../shared/hooks/use-media-query';
import { LoadingState } from '../../../shared/ui/loading-state';
import { LookupDetailPanel } from '../lookup/lookup-detail-panel';
import { LookupError } from '../lookup/lookup-error';
import { resultCountLabel, LOOKUP_TEXT } from '../lookup/lookup-messages';
import { LookupPagination } from '../lookup/lookup-pagination';
import { LookupPane } from '../lookup/lookup-pane';
import { LookupResultList } from '../lookup/lookup-result-list';
import { LookupSearchBox } from '../lookup/lookup-search-box';
import { usePatientDetail } from '../lookup/use-patient-detail';
import { usePatientSearch } from '../lookup/use-patient-search';

// Cùng ngưỡng với ngăn kéo của khung (`WIDE_QUERY` ở `shared/ui/role-shell.tsx`, F11): từ đây trở lên hai cột, dưới đây một cột.
// JS quyết định, không dùng biến thể `lg:` của Tailwind (Vitest chạy `css: false`, và `lg` tính theo rem nên không phải 1024 px).
const WIDE_QUERY = '(min-width: 1024px)';

// Chỗ cần chuyển focus sau lần render kế tiếp (chỉ đặt khi người dùng vừa làm một thao tác, không bao giờ lúc mới mở trang)
type FocusTarget = 'detail' | 'list' | 'results';

// Trang "Tra cứu bệnh nhân" của Lễ tân (patient F8; Figma `483:2`, `484:2`, `485:2`, `505:2`; TRACKING F8-A đến F8-L).
// Hai cột (trái: danh sách, 360 px; phải: hồ sơ, co giãn); dưới 1024 px MỘT cột: chọn một mục thì hiện hồ sơ và ẩn danh sách bằng
// thuộc tính `hidden` (vẫn nằm trong DOM nên chữ đã gõ, kết quả, vị trí cuộn không mất).
// Riêng tư (H4, H5; F8-H): từ khoá, họ tên, id bệnh nhân chỉ nằm trong bộ nhớ của trang. Không route con, không URL, không kho trình duyệt:
// tải lại trang mất kết quả (chấp nhận được).
// Dải đầu là `div`, không phải `header`: dom-testing-library coi mọi `header` là landmark `banner`, trùng với thanh trên của khung (PL-11, PL-19 dùng getByRole('banner')).
// Màn rộng: trang kéo dài hết chiều cao khung như Figma (900 − thanh trên 52,5 − đệm 45 = 6,5rem ở gốc 15 px); màn hẹp theo nội dung.
// Khi mới mở trang KHÔNG gọi API, KHÔNG có `alert`, nút hay liên kết nào (PL-12, PL-15, PL-19 của khung Lễ tân đang đếm chúng).
export function ReceptionLookupPage() {
  const search = usePatientSearch();
  const wide = useMediaQuery(WIDE_QUERY);
  // Hồ sơ đang chọn nhớ từ khoá lúc chọn: chỉ hợp lệ khi từ khoá đang áp dụng còn đúng như thế. Từ khoá mới BẮT ĐẦU TÌM (hoặc ô xuống dưới
  // 2 ký tự) thì tự bỏ chọn; đổi trang hay Enter làm mới thì giữ. Suy ra từ state, không dùng effect đặt state.
  const [selection, setSelection] = useState<{
    id: string;
    keyword: string;
  } | null>(null);
  const [view, setView] = useState<'list' | 'detail'>('list');
  const selectedId =
    selection !== null && selection.keyword === search.keyword
      ? selection.id
      : null;
  const detail = usePatientDetail(selectedId);

  const resultsRegion = useRef<HTMLElement>(null);
  const detailRegion = useRef<HTMLElement>(null);
  const pendingFocus = useRef<FocusTarget | null>(null);

  // Màn hẹp: một cột, hiện hồ sơ khi đã chọn và đang ở chế độ xem hồ sơ
  const showDetailOnly = !wide && view === 'detail' && selectedId !== null;
  const showListOnly = !wide && !showDetailOnly;

  useEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    pendingFocus.current = null;
    if (target === 'detail') detailRegion.current?.focus();
    else if (target === 'results') resultsRegion.current?.focus();
    else {
      resultsRegion.current
        ?.querySelector<HTMLElement>('[aria-current="true"]')
        ?.focus();
    }
  });

  function select(id: string) {
    if (search.keyword === null) return;
    setSelection({ id, keyword: search.keyword });
    setView('detail');
    if (!wide) pendingFocus.current = 'detail';
  }

  function back() {
    setView('list');
    pendingFocus.current = 'list';
  }

  function changePage(page: number) {
    search.goToPage(page);
    // Nút "Sau" có thể vừa bị vô hiệu ở trang cuối và focus sẽ rơi về `body`: đưa focus vào vùng danh sách
    pendingFocus.current = 'results';
  }

  const { state } = search;
  const ready = state.status === 'ready' ? state.data : null;

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-xl bg-gray-50 ${wide ? 'min-h-[calc(100dvh-6.5rem)]' : ''}`}
    >
      <div className="border-b border-gray-100 bg-white px-[1.5rem] py-[1rem]">
        <h1 className="text-lg leading-[1.75rem] font-bold text-gray-900">
          Tra cứu bệnh nhân
        </h1>
        <div className="pt-[0.75rem]" hidden={showDetailOnly}>
          <LookupSearchBox
            value={search.input}
            hint={search.hint}
            onChange={search.changeInput}
            onSubmit={search.submit}
            onClear={search.clear}
            onComposingChange={search.setComposing}
          />
        </div>
      </div>

      <div className="flex min-h-[28rem] flex-1">
        <section
          ref={resultsRegion}
          tabIndex={-1}
          aria-label={LOOKUP_TEXT.resultsRegion}
          hidden={showDetailOnly}
          className={`flex shrink-0 flex-col border-r border-gray-100 bg-white ${wide ? 'w-[24rem]' : 'w-full'}`}
        >
          {state.status === 'idle' && <LookupPane kind="idle" />}
          {state.status === 'loading' && (
            <div className="px-[1rem] py-[0.5rem]">
              <LoadingState message={LOOKUP_TEXT.searching} />
            </div>
          )}
          {state.status === 'error' && (
            <div className="px-[1rem] py-[0.5rem]">
              <LookupError error={state.error} onRetry={search.retry} />
            </div>
          )}
          {ready !== null && ready.items.length === 0 && (
            <LookupPane kind="not-found" />
          )}
          {ready !== null && ready.items.length > 0 && (
            <div className="flex-1">
              <LookupResultList
                items={ready.items}
                selectedId={selectedId}
                onSelect={select}
              />
            </div>
          )}
          {/* Phần tử `aria-live` có mặt từ đầu để đọc màn hình nghe được số kết quả khi nó đổi; chỉ chứa chữ đếm, không chứa nút phân trang */}
          <div
            className={`flex flex-wrap items-center justify-between gap-x-[0.75rem] gap-y-[0.5rem] px-[1rem] py-[0.5rem] ${ready !== null && ready.total > 0 ? 'border-t border-gray-100' : ''}`}
          >
            <p
              aria-live="polite"
              aria-atomic="true"
              className="text-xs text-gray-500"
            >
              {ready !== null && ready.total > 0
                ? resultCountLabel(ready.total)
                : ''}
            </p>
            {ready !== null && ready.total > ready.pageSize && (
              <LookupPagination
                page={ready.page}
                pageSize={ready.pageSize}
                total={ready.total}
                onPageChange={changePage}
              />
            )}
          </div>
        </section>

        <section
          ref={detailRegion}
          tabIndex={-1}
          aria-label={LOOKUP_TEXT.detailRegion}
          aria-busy={detail.state.status === 'loading'}
          hidden={showListOnly}
          className="flex min-w-0 flex-1 flex-col"
        >
          <LookupDetailPanel
            state={detail.state}
            onRetry={detail.retry}
            onBack={showDetailOnly ? back : undefined}
          />
        </section>
      </div>
    </div>
  );
}
