import { useId, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useInertBackground } from '../../../shared/hooks/use-inert-background';
import { useModalDialog } from '../../../shared/hooks/use-modal-dialog';
import { useRemote } from '../../../shared/hooks/use-remote';
import { getSelectedBranch } from '../../../shared/branch-selection';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import {
  loadPicker,
  preselectBranch,
  type PickerData,
} from './preselect-branch';

// Bộ chọn chi nhánh khi Bệnh nhân bấm "Nhắn lễ tân" (chat F4; PLAN chat 5.13, Q4, MH1, MH2; WCH-12). Chọn sẵn theo thứ tự:
//  1. chi nhánh máy chủ suy từ lịch hẹn (`GET /chat/default-branch`: lịch còn hiệu lực sắp tới, rồi lịch đã khám gần nhất);
//  2. không có thì chi nhánh đang chọn ở trình duyệt (`shared/branch-selection`);
//  3. "Toàn quốc" (chưa chọn chi nhánh nào) hay chi nhánh không còn trong danh sách ⇒ không chọn sẵn, người dùng PHẢI chọn.
// Người dùng đổi được; bấm "Nhắn lễ tân" mới vào khung (hội thoại chỉ tạo khi gửi tin đầu). Gợi ý chi nhánh mặc định lỗi thì vẫn cho chọn tay.

interface BranchPickerDialogProps {
  returnFocusRef: RefObject<HTMLElement | null>;
  onConfirm: (chiNhanhId: string) => void;
  onClose: () => void;
}

export function BranchPickerDialog(props: BranchPickerDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const { returnFocusRef, onClose } = props;
  // Thứ tự: `inert` trước, hook hộp thoại sau (chú thích của `useInertBackground`)
  useInertBackground(overlayRef);
  useModalDialog({
    open: true,
    dialogRef: panelRef,
    initialFocusRef: titleRef,
    returnFocusRef,
    onClose,
  });
  const { state, retry } = useRemote(loadPicker, []);

  return createPortal(
    <div
      ref={overlayRef}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl bg-white p-5"
      >
        <h2
          id={titleId}
          ref={titleRef}
          tabIndex={-1}
          className="text-lg font-semibold text-gray-900"
        >
          Nhắn lễ tân chi nhánh
        </h2>
        {state.status === 'loading' && (
          <LoadingState message="Đang tải danh sách chi nhánh…" />
        )}
        {state.status === 'error' && (
          <ErrorState error={state.error} onRetry={retry} />
        )}
        {state.status === 'ready' && (
          <PickerForm
            data={state.data}
            onConfirm={props.onConfirm}
            onClose={onClose}
          />
        )}
        {state.status !== 'ready' && (
          <button
            type="button"
            onClick={onClose}
            className="mt-3 min-h-11 rounded-xl border border-gray-300 px-4 text-sm font-medium"
          >
            Huỷ
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}

function PickerForm({
  data,
  onConfirm,
  onClose,
}: {
  data: PickerData;
  onConfirm: (chiNhanhId: string) => void;
  onClose: () => void;
}) {
  // Chọn sẵn tính MỘT lần lúc dữ liệu về (giá trị đầu của state); người dùng đổi tự do sau đó
  const [initial] = useState(() =>
    preselectBranch(data, getSelectedBranch()?.chiNhanhId ?? null),
  );
  const [chosen, setChosen] = useState<string | null>(
    initial?.chiNhanhId ?? null,
  );
  const hintId = useId();

  if (data.options.length === 0)
    return (
      <>
        <p className="my-3 text-sm text-gray-600">Chưa có chi nhánh nào.</p>
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 rounded-xl border border-gray-300 px-4 text-sm font-medium"
        >
          Đóng
        </button>
      </>
    );

  return (
    <form
      className="mt-3 flex min-h-0 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        if (chosen !== null) onConfirm(chosen);
      }}
    >
      <p id={hintId} className="text-sm text-gray-600">
        {initial ? initial.hint : 'Chọn chi nhánh bạn muốn nhắn.'}
      </p>
      <fieldset
        aria-describedby={hintId}
        className="mt-2 min-h-0 flex-1 overflow-y-auto"
      >
        <legend className="sr-only">Chi nhánh</legend>
        {data.options.map((option) => (
          <label
            key={option.chiNhanhId}
            className="flex cursor-pointer items-start gap-2 rounded-xl px-2 py-2 hover:bg-gray-50"
          >
            <input
              type="radio"
              name="chat-branch"
              value={option.chiNhanhId}
              checked={chosen === option.chiNhanhId}
              onChange={() => setChosen(option.chiNhanhId)}
              className="mt-1"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-gray-900">
                {option.ten}
              </span>
              <span className="block text-xs text-gray-500">
                {option.diaChi}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 flex-1 rounded-xl border border-gray-300 px-4 text-sm font-medium"
        >
          Huỷ
        </button>
        <button
          type="submit"
          disabled={chosen === null}
          className="min-h-11 flex-1 rounded-xl bg-brand-strong px-4 text-sm font-semibold text-white hover:bg-cyan-800 disabled:opacity-50"
        >
          Nhắn lễ tân
        </button>
      </div>
    </form>
  );
}
