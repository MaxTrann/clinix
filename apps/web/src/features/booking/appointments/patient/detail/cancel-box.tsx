import { useEffect, useId, useRef, type KeyboardEvent } from 'react';
import { DetailRow } from './detail-card';
import { CANCEL_TEXT } from './detail-messages';
import { cutoffLine, refundLine, refundResultLine } from './refund-text';
import type { CancelBoxState } from './use-cancel-box';

const KEEP_BUTTON =
  'min-h-11 flex-1 rounded-xl border border-gray-300 bg-white px-5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50';
// Nền `danger-strong` (red-700) chữ trắng 6,42:1 (ADR 0004), nhất quán với hộp ngừng hồ sơ của patient F7; không chép màu Figma `#e7000b`
const CONFIRM_BUTTON =
  'min-h-11 flex-1 rounded-xl bg-danger-strong px-5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50';
const ALERT =
  'mt-3 rounded-xl border border-danger-line bg-white px-4 py-2.5 text-sm text-red-800';

interface CancelBoxProps {
  state: Exclude<CancelBoxState, { kind: 'closed' }>;
  // "Cọc đã thanh toán": số tiền đã định dạng, hoặc "Chưa có cọc"
  depositLabel: string;
  onDismiss: () => void;
  onConfirm: () => void;
  onRetryPreview: () => void;
  onReload: () => void;
}

// Hộp huỷ NỘI TUYẾN (booking F2; Figma `421:2`: khối nền đỏ nhạt thay cho nút `Hủy lịch hẹn`, không phải modal, Đại duyệt 12/11/2026 câu (e)). Vì không có bẫy
// tiêu điểm tự động nên tiêu điểm quản lý BẰNG TAY: mở ⇒ vào `Giữ lịch` (nút an toàn); có kết quả, lỗi hay dừng ⇒ vào vùng thông báo; đóng ⇒ trả về nút mở (do
// `CancelSection`). `Esc` = `Giữ lịch`. Đang gửi thì không đóng được. Không có ô lý do: Bệnh nhân không nhập lý do (Q27, L33).
export function CancelBox({
  state,
  depositLabel,
  onDismiss,
  onConfirm,
  onRetryPreview,
  onReload,
}: CancelBoxProps) {
  const titleId = useId();
  const keepRef = useRef<HTMLButtonElement>(null);
  const messageRef = useRef<HTMLDivElement>(null);

  // Mở hộp: tiêu điểm vào `Giữ lịch`. Hộp chỉ được dựng khi MỞ nên effect này chạy đúng một lần cho mỗi lần mở.
  useEffect(() => {
    keepRef.current?.focus();
  }, []);

  // Kết quả, lỗi hay dừng hẳn: tiêu điểm vào vùng thông báo (nút vừa bấm đã biến mất hay bị vô hiệu)
  const announces =
    state.kind === 'done' ||
    state.kind === 'stopped' ||
    state.kind === 'previewFailed' ||
    (state.kind === 'ready' && state.failure !== null);
  useEffect(() => {
    if (announces) messageRef.current?.focus();
  }, [announces, state]);

  const busy = state.kind === 'loadingPreview' || state.kind === 'submitting';
  const expected =
    state.kind === 'ready' || state.kind === 'submitting'
      ? state.expected
      : null;
  const showsActions =
    state.kind === 'loadingPreview' ||
    state.kind === 'previewFailed' ||
    state.kind === 'ready' ||
    state.kind === 'submitting';

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    // Đang gửi và đã huỷ xong thì không có gì để đóng
    if (state.kind === 'submitting' || state.kind === 'done') return;
    event.preventDefault();
    onDismiss();
  }

  return (
    <section
      aria-labelledby={titleId}
      aria-busy={busy}
      onKeyDown={handleKeyDown}
      className="rounded-2xl border border-danger-line bg-danger-soft p-4"
    >
      <h2 id={titleId} className="text-sm font-semibold text-red-900">
        {state.kind === 'done' ? CANCEL_TEXT.cancelled : CANCEL_TEXT.title}
      </h2>
      {state.kind !== 'done' && (
        <p className="pt-3 text-sm text-red-800">{CANCEL_TEXT.warning}</p>
      )}

      {/* Vùng đọc cho trình đọc màn hình: tải xong, kết quả, lỗi. Lỗi còn có `role="alert"` riêng. */}
      <div aria-live="polite">
        {state.kind === 'loadingPreview' && (
          <p className="pt-3 text-sm text-red-800">
            {CANCEL_TEXT.loadingPreview}
          </p>
        )}
        {state.kind === 'previewFailed' && (
          <div ref={messageRef} tabIndex={-1} role="alert" className={ALERT}>
            <p>{state.failure.message}</p>
            <button
              type="button"
              onClick={onRetryPreview}
              className="mt-2 block font-medium underline"
            >
              {CANCEL_TEXT.retry}
            </button>
          </div>
        )}
        {(state.kind === 'ready' || state.kind === 'submitting') && (
          <dl className="mt-3 rounded-xl border border-red-100 bg-white px-4 py-1">
            <DetailRow label={CANCEL_TEXT.paidDeposit}>
              {depositLabel}
            </DetailRow>
            <DetailRow
              label={CANCEL_TEXT.expectedRefund}
              note={cutoffLine(expected) ?? undefined}
            >
              {refundLine(expected) ?? CANCEL_TEXT.noRefund}
            </DetailRow>
          </dl>
        )}
        {state.kind === 'ready' && state.failure !== null && (
          <div ref={messageRef} tabIndex={-1} role="alert" className={ALERT}>
            <p>{state.failure.message}</p>
            {state.failure.kind === 'uncertain' && (
              <button
                type="button"
                onClick={onReload}
                className="mt-2 block font-medium underline"
              >
                {CANCEL_TEXT.reload}
              </button>
            )}
          </div>
        )}
        {state.kind === 'stopped' && (
          <div ref={messageRef} tabIndex={-1} role="alert" className={ALERT}>
            {state.message}
          </div>
        )}
        {state.kind === 'done' && (
          <div
            ref={messageRef}
            tabIndex={-1}
            className="pt-3 text-sm text-red-800"
          >
            <p className="font-medium">{refundResultLine(state.actual)}</p>
            {state.differs && <p className="pt-1">{CANCEL_TEXT.differs}</p>}
          </div>
        )}
      </div>

      {showsActions && (
        <div className="flex gap-2 pt-4">
          <button
            ref={keepRef}
            type="button"
            disabled={state.kind === 'submitting'}
            onClick={onDismiss}
            className={KEEP_BUTTON}
          >
            {CANCEL_TEXT.keep}
          </button>
          <button
            type="button"
            disabled={state.kind !== 'ready'}
            onClick={onConfirm}
            className={CONFIRM_BUTTON}
          >
            {state.kind === 'submitting'
              ? CANCEL_TEXT.confirming
              : CANCEL_TEXT.confirm}
          </button>
        </div>
      )}
      {state.kind === 'stopped' && (
        <div className="flex pt-4">
          <button type="button" onClick={onDismiss} className={KEEP_BUTTON}>
            {CANCEL_TEXT.close}
          </button>
        </div>
      )}
      {(state.kind === 'ready' || state.kind === 'submitting') && (
        <p className="pt-3 text-xs text-red-800">{CANCEL_TEXT.estimateNote}</p>
      )}
    </section>
  );
}
