import { useEffect, useId, useRef } from 'react';
import { useAdminDialogFocus } from '../hooks/use-admin-dialog-focus';
import { useFocusFirstInvalid } from '../hooks/use-focus-first-invalid';
import { REASON_MAX_LENGTH, type ChangeLine } from './system-config-validation';

// Hộp "Xác nhận lưu thay đổi" (Figma 663:2): danh sách "nhãn: trước → sau" và ô "Lý do thay đổi" bắt buộc (Q38). Ô lý do nằm TRONG hộp (như mã
// Figma Make, Đại chọn 19/11/2026) nên không dùng được `AdminConfirmationDialog` (chỉ có chữ, không có ô nhập); dùng lại hook focus của F1.
// `lyDo` là chữ tự do: chỉ đi vào `value` của ô nhập và vào thân `PUT`, không ghi ra log.

interface SaveDialogProps {
  open: boolean;
  creating: boolean;
  lines: ChangeLine[];
  reason: string;
  reasonError: string;
  // Tăng mỗi lần ô lý do bị báo lỗi: đưa focus về ô lý do, không cướp focus lúc đang gõ
  reasonTick: number;
  // Lỗi chung của lần lưu vừa rồi (mạng, 500...): hộp vẫn mở để bấm lại
  banner: string;
  saving: boolean;
  onReasonChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function SaveDialog({
  open,
  creating,
  lines,
  reason,
  reasonError,
  reasonTick,
  banner,
  saving,
  onReasonChange,
  onConfirm,
  onCancel,
}: SaveDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const reasonId = useId();
  // Đang lưu thì không cho Esc đóng hộp (lời gọi đã đi, đóng hộp chỉ làm người dùng mất dấu kết quả)
  useAdminDialogFocus(open, dialogRef, saving ? noop : onCancel);
  // Hook trên đưa focus vào khung hộp; ô lý do là việc đầu tiên cần làm nên nhận focus ngay sau đó (effect chạy theo thứ tự khai báo)
  useEffect(() => {
    if (open) reasonRef.current?.focus();
  }, [open]);
  useFocusFirstInvalid(dialogRef, reasonTick);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1000] grid place-items-center bg-black/50 p-5">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white text-gray-700 shadow-xl"
      >
        <div className="border-b border-gray-100 px-5 pt-5 pb-3">
          <h2 id={titleId} className="text-lg font-semibold text-gray-900">
            {creating
              ? 'Xác nhận tạo cấu hình hệ thống'
              : 'Xác nhận lưu thay đổi'}
          </h2>
          <p id={descriptionId} className="mt-1 text-sm text-gray-600">
            Thay đổi được ghi vào lịch sử cấu hình kèm lý do và người thực hiện.
          </p>
        </div>

        <ul
          aria-label="Các thay đổi sẽ lưu"
          className="min-h-0 flex-1 overflow-y-auto px-5 py-2"
        >
          {lines.map((line) => (
            <li
              key={line.key}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-gray-100 py-2 text-sm last:border-b-0"
            >
              <span className="text-gray-700">{line.label}</span>
              <span className="text-gray-500">
                <span className="sr-only">từ </span>
                {line.before}
                <span aria-hidden="true"> → </span>
                <span className="sr-only"> đổi thành </span>
                <strong className="font-semibold text-gray-900">
                  {line.after}
                </strong>
              </span>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-3 border-t border-gray-100 px-5 py-4">
          <div>
            <label
              htmlFor={reasonId}
              className="text-sm font-medium text-gray-900"
            >
              Lý do thay đổi{' '}
              <span aria-hidden="true" className="text-danger">
                *
              </span>
            </label>
            <textarea
              ref={reasonRef}
              id={reasonId}
              rows={3}
              autoComplete="off"
              className={`mt-1 w-full resize-y rounded-xl border bg-white px-3 py-2 text-sm text-slate-900 ${reasonError === '' ? 'border-gray-300' : 'border-danger'}`}
              value={reason}
              disabled={saving}
              aria-required="true"
              aria-invalid={reasonError !== ''}
              aria-describedby={
                reasonError === ''
                  ? `${reasonId}-count`
                  : `${reasonId}-count ${reasonId}-error`
              }
              onChange={(event) => onReasonChange(event.currentTarget.value)}
            />
            <div className="mt-1 flex items-start justify-between gap-3">
              <p
                id={`${reasonId}-error`}
                role={reasonError === '' ? undefined : 'alert'}
                className="text-xs text-danger"
              >
                {reasonError}
              </p>
              <p
                id={`${reasonId}-count`}
                className="ml-auto text-xs whitespace-nowrap text-gray-500"
              >
                {reason.trim().length}/{REASON_MAX_LENGTH}
              </p>
            </div>
          </div>

          {banner !== '' && (
            <p
              role="alert"
              className="rounded-xl border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-strong"
            >
              {banner}
            </p>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              className="h-[39px] flex-1 rounded-[13.375px] border border-gray-200 bg-white text-sm font-medium text-gray-600 disabled:opacity-60"
              disabled={saving}
              onClick={onCancel}
            >
              Hủy
            </button>
            <button
              type="button"
              className="h-[39px] flex-1 rounded-[13.375px] bg-brand-strong text-sm font-medium text-white disabled:opacity-70"
              disabled={saving}
              aria-busy={saving}
              onClick={onConfirm}
            >
              {saving ? 'Đang lưu…' : 'Xác nhận lưu'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function noop() {
  // Không làm gì: Esc bị bỏ qua khi đang lưu
}
