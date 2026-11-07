import { CircleAlert, CircleCheck, Plus } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { EmptyState } from '../../../shared/ui/empty-state';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import { isSessionEnded } from '../profile/profile-errors';
import { ADDED_MESSAGE, UPDATED_MESSAGE } from './relative-errors';
import { RelativeCard } from './relative-card';
import { RelativeForm } from './relative-form';
import { summarize } from './relative-rules';
import type { Relative } from './relatives-types';
import { useRelatives } from './use-relatives';

const SECTION_HEADING = 'text-base font-semibold text-gray-600';
// Chữ success trên success-soft đạt 4,72:1, danger-strong trên danger-soft 5,87:1 (ADR 0004)
const NOTICE_BOX = 'mt-3 flex items-start gap-2 rounded-xl border p-3 text-sm';
const NOTICE_TONE = {
  success: 'border-success-line bg-success-soft text-success',
  error: 'border-danger-line bg-danger-soft text-danger-strong',
};

interface Notice {
  tone: keyof typeof NOTICE_TONE;
  text: string;
}

// Khối "Người thân" của trang "Hồ sơ người khám" (patient F6; frame `416:2`, `433:2`, `434:2`): tiêu đề, dòng đếm, nút "Thêm người thân",
// danh sách thẻ, form thêm dưới danh sách. Tải độc lập và song song với khối Bản thân: lỗi tải chỉ hiện trong khối này (TRACKING F6-C).
// Mỗi form (thêm, sửa từng thẻ) độc lập, không "một lúc một form" (F6-G).
export function RelativesSection() {
  const { state, retry, refresh, upsert } = useRelatives();
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  // Sau khi lưu hoặc "Hủy" nút "Thêm người thân" được bật lại, rồi mới focus được
  const refocusAdd = useRef(false);
  const headingId = useId();

  useEffect(() => {
    if (!adding && refocusAdd.current) {
      refocusAdd.current = false;
      addButton.current?.focus();
    }
  }, [adding]);

  function startAdding() {
    setNotice(null);
    setAdding(true);
  }

  function handleAdded(saved: Relative) {
    upsert(saved);
    setNotice({ tone: 'success', text: ADDED_MESSAGE });
    refocusAdd.current = true;
    setAdding(false);
  }

  function handleCancelAdd() {
    refocusAdd.current = true;
    setAdding(false);
  }

  function handleSaved(saved: Relative) {
    upsert(saved);
    setNotice({ tone: 'success', text: UPDATED_MESSAGE });
  }

  // 404 hoặc 409 khi sửa (kèm câu thông báo) và nút "Tải lại danh sách" sau POST không rõ kết quả (không có câu)
  function handleReload(text?: string) {
    if (text !== undefined) setNotice({ tone: 'error', text });
    refresh();
  }

  const ready = state.status === 'ready';
  const counts = state.status === 'ready' ? summarize(state.items) : null;

  return (
    <section aria-labelledby={headingId} className="mt-[2.1333rem]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id={headingId} className={SECTION_HEADING}>
            Người thân
          </h2>
          {counts !== null && (
            <p className="pt-[0.1333rem] text-[0.8rem] leading-[1.2rem] text-gray-500">
              {counts.total} hồ sơ người thân ·{' '}
              <strong className="font-bold text-brand-strong">
                {counts.active}
              </strong>{' '}
              đang sử dụng
            </p>
          )}
        </div>
        {/* Vô hiệu tới khi danh sách tải xong (thêm vào danh sách chưa có thì hồ sơ mới không hiện) và khi form thêm đang mở */}
        <button
          ref={addButton}
          type="button"
          disabled={!ready || adding}
          onClick={startAdding}
          className="flex min-h-[2.6667rem] items-center justify-center gap-[0.4rem] rounded-lg border border-transparent bg-brand-strong px-[1.2rem] text-sm leading-normal font-semibold text-white transition-colors hover:bg-cyan-800 disabled:opacity-50 disabled:hover:bg-brand-strong"
        >
          <Plus className="size-4" aria-hidden="true" />
          Thêm người thân
        </button>
      </div>

      {/* Vùng thông báo có sẵn trong DOM để người đọc màn hẹp nghe được câu mới; ở lại tới khi có thông báo khác, mở form thêm hoặc rời trang */}
      <div role="status">
        {notice !== null && (
          <p className={`${NOTICE_BOX} ${NOTICE_TONE[notice.tone]}`}>
            {notice.tone === 'success' ? (
              <CircleCheck
                className="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
            ) : (
              <CircleAlert
                className="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
            )}
            <span>{notice.text}</span>
          </p>
        )}
      </div>

      <div className="mt-[1.0667rem]">
        {state.status === 'loading' && <LoadingState />}
        {state.status === 'error' && !isSessionEnded(state.error) && (
          <ErrorState error={state.error} onRetry={retry} />
        )}
        {state.status === 'ready' && (
          <>
            {state.refreshError !== null && (
              <ErrorState error={state.refreshError.error} onRetry={refresh} />
            )}
            {state.items.length === 0 ? (
              <EmptyState message='Chưa có hồ sơ người thân. Bấm "Thêm người thân" để tạo hồ sơ.' />
            ) : (
              <ul className="flex flex-col gap-[1.0667rem]">
                {state.items.map((relative) => (
                  <li key={relative.hoSoNguoiThanId}>
                    <RelativeCard
                      relative={relative}
                      onSaved={handleSaved}
                      onReload={handleReload}
                    />
                  </li>
                ))}
              </ul>
            )}
            {adding && (
              <div className="mt-[1.0667rem] rounded-xl border border-gray-200 bg-white px-[1.6rem] py-[1.3333rem]">
                <h3 className="text-base font-bold text-gray-900">
                  Thêm người thân mới
                </h3>
                <div className="mt-4">
                  <RelativeForm
                    relative={null}
                    onSaved={handleAdded}
                    onCancel={handleCancelAdd}
                    onReload={handleReload}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
