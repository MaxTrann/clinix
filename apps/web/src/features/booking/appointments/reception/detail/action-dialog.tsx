import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { useInertBackground } from '../../common/use-inert-background';
import { ACTION_TEXT } from './detail-messages';
import type { StatusActionState } from './use-status-action';

// Khung của hộp thoại thao tác của Lễ tân (booking F9; Figma `490:2`, `489:2`): lớp phủ đen 45%, hộp trắng căn giữa rộng 360 px, tiêu đề, thân, hàng hai nút. Dùng chung cho hộp
// `Hủy lịch hẹn` và hộp `Đánh dấu vắng mặt` (hai hộp chỉ khác thân và chữ nút) nên lỗi, đang gửi, nút đóng chỉ viết MỘT lần.
//
// Đây là modal THỨ HAI chồng lên ngăn chi tiết (TRACKING 3.30 F9-K). Khung KHÔNG gọi `useModalDialog`: hook đó nghe `keydown` ở `document`, nên hai hook lồng nhau làm Esc đóng cả hai
// lớp và hai bẫy Tab giằng co. Ngăn giữ MỘT hook duy nhất và đổi phần tử bẫy sang `panelRef` của khung này khi hộp mở (`reception-drawer.tsx`). Khung chỉ lo phần của mình:
//  - nền `inert` (`useInertBackground`: ngăn chi tiết, và mọi thứ chưa `inert`; gỡ ĐÚNG phần đã đặt khi hộp đóng);
//  - tiêu điểm đầu tiên khi mở (`focusRef` của thân, hoặc nút đóng: nút an toàn như `Giữ lịch` của F2);
//  - lỗi chung hiện trong `role="alert"` và nhận tiêu điểm (nút vừa bấm có thể đã biến mất); lỗi của ô lý do do hộp huỷ tự hiện dưới ô.
// Không đóng khi đang gửi: nút vô hiệu, bấm lớp phủ không làm gì, Esc do ngăn chặn (`isSending`).
interface ActionDialogProps {
  title: string;
  state: StatusActionState;
  // Ngăn đọc phần tử này làm vùng bẫy Tab khi hộp mở
  panelRef: RefObject<HTMLDivElement | null>;
  // Phần tử trong thân nhận tiêu điểm khi mở; vắng thì nút đóng
  focusRef?: RefObject<HTMLElement | null>;
  dismissLabel: string;
  confirm: { label: string; busyLabel: string; className: string };
  onConfirm: () => void;
  onDismiss: () => void;
  // `Tải lại chi tiết` khi kết quả chưa rõ
  onReload: () => void;
  children: ReactNode;
}

// Viền điều khiển ≥ 3:1 (nếp F8, TECH_DEBT 116): Figma `#e5e7eb` 1,24:1 ⇒ `gray-500`
export const DIALOG_FIELD_BORDER = 'border border-gray-500';
const BUTTON =
  'min-h-11 flex-1 rounded-xl px-5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50';

export function ActionDialog({
  title,
  state,
  panelRef,
  focusRef,
  dismissLabel,
  confirm,
  onConfirm,
  onDismiss,
  onReload,
  children,
}: ActionDialogProps) {
  const titleId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const dismissRef = useRef<HTMLButtonElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  useInertBackground(overlayRef);

  // Hộp chỉ được dựng khi MỞ nên effect này chạy đúng một lần cho mỗi lần mở
  useEffect(() => {
    (focusRef?.current ?? dismissRef.current)?.focus();
  }, [focusRef]);

  const failure =
    state.kind === 'failed' || state.kind === 'stopped' ? state.failure : null;
  // Lỗi thuộc ô lý do (400 `LY_DO_BAT_BUOC` từ máy chủ) do hộp huỷ hiện dưới ô, không hiện ở khung chung
  const general =
    failure !== null && failure.field === undefined ? failure : null;
  useEffect(() => {
    if (general !== null) alertRef.current?.focus();
  }, [general]);

  const busy = state.kind === 'submitting';
  const stopped = state.kind === 'stopped';

  return createPortal(
    <div
      ref={overlayRef}
      onClick={(event) => {
        if (event.target === event.currentTarget) onDismiss();
      }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={busy}
        className="w-full max-w-[22.5rem] rounded-2xl bg-white p-5.5 shadow-xl"
      >
        <h2 id={titleId} className="text-sm font-bold text-gray-900">
          {title}
        </h2>
        {children}

        {general !== null && (
          <div
            ref={alertRef}
            tabIndex={-1}
            role="alert"
            className="mt-3 rounded-xl border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-strong"
          >
            <p>{general.message}</p>
            {general.kind === 'uncertain' && (
              <button
                type="button"
                onClick={onReload}
                className="mt-2 block font-medium underline"
              >
                {ACTION_TEXT.reload}
              </button>
            )}
          </div>
        )}

        <div className="flex gap-2 pt-4">
          <button
            ref={dismissRef}
            type="button"
            disabled={busy}
            onClick={onDismiss}
            className={`${BUTTON} ${DIALOG_FIELD_BORDER} bg-white text-gray-600 hover:bg-gray-50`}
          >
            {stopped ? ACTION_TEXT.close : dismissLabel}
          </button>
          {!stopped && (
            <button
              type="button"
              disabled={busy}
              onClick={onConfirm}
              className={`${BUTTON} text-white ${confirm.className}`}
            >
              {busy ? confirm.busyLabel : confirm.label}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
