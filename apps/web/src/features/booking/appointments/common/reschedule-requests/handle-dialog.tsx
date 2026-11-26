import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { useModalDialog } from '../../../../../shared/hooks/use-modal-dialog';
import { ActionDialog } from '../action-dialog';
import { ReasonField } from '../reason-field';
import type { StatusActionState } from '../use-status-action';
import { HANDLE_TEXT } from './request-handle-text';
import { checkRequestNote } from './request-note-rules';
import type { HandleTarget } from './use-handle-request';

// Hộp "Duyệt" và hộp "Từ chối" yêu cầu đổi lịch (reschedule F4 Pha B1; PLAN reschedule 5.12, 2.4.31 b4, A1; Q10). MỘT thành phần cho cả hai (chỉ khác chữ, màu nút và dòng giờ): tiêu đề, dòng giải thích, giờ (khi duyệt),
// ô `Ghi chú xử lý *` BẮT BUỘC 1 đến 255 đơn vị UTF-16 kèm dòng nhắc "Bệnh nhân sẽ đọc ghi chú này" (đi NGUYÊN VĂN tới bệnh nhân), `Đóng` và nút xác nhận. Khung `ActionDialog` dùng chung với hộp Huỷ: lỗi chung trong
// `role="alert"` và nhận tiêu điểm, đang gửi thì khoá, không đóng được. Ô ghi chú rỗng, quá dài hay có ký tự điều khiển thì CHẶN ở client (lời báo dưới ô, KHÔNG gọi API, nút vẫn bật); máy chủ vẫn từ chối được (400 ở
// trường `ghiChu`: báo cạnh ô, GIỮ chữ). Hộp là modal DUY NHẤT của trang nên gọi MỘT `useModalDialog` (Esc, bẫy Tab, khoá cuộn); trả tiêu điểm về nút đã mở do `use-handle-request.ts` làm SAU khi hộp gỡ, nên hook ở đây
// nhận một ref rỗng. Ghi chú chỉ ở bộ nhớ của trang: không kho trình duyệt, URL, log.
interface HandleDialogProps {
  target: HandleTarget;
  note: string;
  onNoteChange: (value: string) => void;
  state: StatusActionState<unknown>;
  panelRef: RefObject<HTMLDivElement | null>;
  // Gửi đi với ghi chú ĐÃ cắt khoảng trắng và đã qua kiểm
  onSubmit: (note: string) => void;
  onDismiss: () => void;
  onReload: () => void;
  // Câu giải thích thay cho câu mặc định (B2: đã chọn khung giờ thay thế thì không còn nói "khung giờ mong muốn")
  intro?: string;
  // Dòng giờ của hộp Duyệt (nhãn và giờ Việt Nam đã định dạng); B2 đổi thành "Khung giờ mới" khi đã chọn khung giờ thay thế
  slot?: { label: string; value: string };
  // Chỗ cắm thêm (B2: nút "Chọn khung giờ khác"), đứng giữa dòng giờ và ô ghi chú
  extra?: ReactNode;
}

const TEXT = {
  approve: {
    title: HANDLE_TEXT.approveTitle,
    intro: HANDLE_TEXT.approveIntro,
    confirm: HANDLE_TEXT.approveConfirm,
    busy: HANDLE_TEXT.approving,
    // Nền `brand-strong` chữ trắng 5,28:1 (ADR 0004)
    className: 'bg-brand-strong hover:opacity-90',
  },
  reject: {
    title: HANDLE_TEXT.rejectTitle,
    intro: HANDLE_TEXT.rejectIntro,
    confirm: HANDLE_TEXT.rejectConfirm,
    busy: HANDLE_TEXT.rejecting,
    // Nền `danger-strong` (red-700) chữ trắng 6,42:1 (ADR 0004)
    className: 'bg-danger-strong hover:bg-red-800',
  },
} as const;

const NOTE_ERRORS = {
  required: HANDLE_TEXT.noteRequired,
  tooLong: HANDLE_TEXT.noteTooLong,
  control: HANDLE_TEXT.noteControl,
} as const;

export function HandleDialog({
  target,
  note,
  onNoteChange,
  state,
  panelRef,
  onSubmit,
  onDismiss,
  onReload,
  intro,
  slot,
  extra,
}: HandleDialogProps) {
  const text = TEXT[target];
  // Lời báo của kiểm tra ở client; xoá khi người dùng sửa ô
  const [clientError, setClientError] = useState<string | null>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  // Ref rỗng: hook không trả tiêu điểm (xem chú thích đầu file)
  const noReturnFocusRef = useRef<HTMLElement | null>(null);
  useModalDialog({
    open: true,
    dialogRef: panelRef,
    initialFocusRef: fieldRef,
    returnFocusRef: noReturnFocusRef,
    onClose: onDismiss,
  });

  // Máy chủ từ chối ghi chú (400 ở trường `ghiChu`) dù client cho qua: cùng chỗ hiện với lời báo của client
  const serverError =
    state.kind === 'failed' && state.failure.field === 'reason'
      ? state.failure.message
      : null;
  const locked = state.kind === 'submitting' || state.kind === 'stopped';
  // Máy chủ vừa từ chối ghi chú: tiêu điểm về ô (như lời báo của client), giữ nguyên chữ để người dùng sửa
  useEffect(() => {
    if (serverError !== null) fieldRef.current?.focus();
  }, [serverError]);

  function confirm() {
    const checked = checkRequestNote(note);
    if (!checked.ok) {
      setClientError(NOTE_ERRORS[checked.error]);
      fieldRef.current?.focus();
      return;
    }
    setClientError(null);
    onSubmit(checked.value);
  }

  return (
    <ActionDialog
      title={text.title}
      state={state}
      panelRef={panelRef}
      focusRef={fieldRef}
      dismissLabel={HANDLE_TEXT.close}
      confirm={{
        label: text.confirm,
        busyLabel: text.busy,
        className: text.className,
      }}
      onConfirm={confirm}
      onDismiss={onDismiss}
      onReload={onReload}
    >
      <p className="pt-2 text-sm text-gray-600">{intro ?? text.intro}</p>
      {slot !== undefined && (
        <p className="pt-2 text-sm text-gray-900">
          <span className="text-gray-600">{slot.label}: </span>
          <span className="font-semibold">{slot.value}</span>
        </p>
      )}
      {extra}
      <ReasonField
        label={HANDLE_TEXT.noteLabel}
        hint={HANDLE_TEXT.noteHint}
        value={note}
        onChange={(value) => {
          onNoteChange(value);
          setClientError(null);
        }}
        error={clientError ?? serverError}
        locked={locked}
        fieldRef={fieldRef}
      />
    </ActionDialog>
  );
}
