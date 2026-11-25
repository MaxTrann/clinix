import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { useStatusAction } from '../use-status-action';
import {
  approveBody,
  rejectBody,
  type ApproveResult,
  type RejectResult,
} from './request-handle-readers';
import { describeHandleFailure } from './request-handle-failure';
import type { RescheduleRequestHandlers } from './request-handle-types';

// Ghép hai thao tác Duyệt, Từ chối vào trang chi tiết yêu cầu đổi lịch (reschedule F4 Pha B1; nếp `use-reception-actions.ts` của F12b): trang gọi hook này và nhận lại hộp đang mở, ghi chú, trạng thái của máy chung
// `useStatusAction` (CHUNG với hộp Huỷ: chốt `useRef` chống gửi đúp, "chưa rõ" cho mạng, quá giờ và 200 sai hình dạng, KHÔNG BAO GIỜ tự gửi lại) và các hàm để vẽ hộp. `useStatusAction` đặt tên tham số là `maLichHen`
// nhưng chỉ là chuỗi định danh: ở đây là id yêu cầu.
//  - Hai nút mở HỘP (modal duy nhất của trang: `useModalDialog` ở `handle-dialog.tsx`). Ghi chú nằm ở ĐÂY (không ở hộp) để B2 đóng hộp khi chọn khung giờ thay thế mà không mất chữ đã gõ.
//  - Thành công: đóng hộp rồi `onDone(target)` (trang về danh sách kèm thông báo một lần; không cần tải lại chi tiết vì rời trang).
//  - Lỗi làm dữ liệu đang hiện lệch máy chủ (409 đã xử lý, 404, lịch không còn duyệt được, khung giờ vừa bị chiếm): tải lại chi tiết; hộp vẫn hiện câu lỗi tới khi đóng; yêu cầu VẪN `ChoDuyet` thì giữ hộp và chữ.
//  - Đóng hộp KHÔNG thành công: tiêu điểm về ĐÚNG nút đã mở; nút đã biến mất (yêu cầu đã xử lý) thì về `fallbackFocusRef` (h1 của trang). Đang gửi thì không đóng gì cả (đóng giữa chừng làm mất kết quả).
export type HandleTarget = 'approve' | 'reject';

interface HandleBody {
  target: HandleTarget;
  ghiChu: string;
}

interface OpenDialog {
  target: HandleTarget;
  trigger: HTMLElement;
}

interface UseHandleRequestOptions {
  yeuCauId: string;
  handlers: RescheduleRequestHandlers;
  reload: () => void;
  fallbackFocusRef: RefObject<HTMLElement | null>;
  // Thành công (200): trang điều hướng về danh sách
  onDone: (target: HandleTarget) => void;
  // Hộp Duyệt có nút "Chọn khung giờ khác" chưa (B2): quyết định câu của lỗi khung giờ
  canPickAnother?: boolean;
}

export function useHandleRequest({
  yeuCauId,
  handlers,
  reload,
  fallbackFocusRef,
  onDone,
  canPickAnother = false,
}: UseHandleRequestOptions) {
  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  const [note, setNote] = useState('');
  // Phần tử của hộp, dùng làm vùng bẫy Tab của `useModalDialog`
  const panelRef = useRef<HTMLDivElement>(null);
  const focusAfterClose = useRef<HTMLElement | null>(null);

  const action = useStatusAction<HandleBody, ApproveResult | RejectResult>({
    maLichHen: yeuCauId,
    perform: (id, body) =>
      body.target === 'approve'
        ? handlers.approve(id, approveBody(body.ghiChu))
        : handlers.reject(id, rejectBody(body.ghiChu)),
    describe: (error) => describeHandleFailure(error, { canPickAnother }),
    onSucceeded: () => {
      const target = dialog?.target;
      setDialog(null);
      setNote('');
      if (target !== undefined) onDone(target);
    },
    onStale: () => reload(),
  });
  const { state, submit, reset, isSending } = action;

  // Tiêu điểm: sau khi hộp đóng không thành công thì về nút đã mở. Chạy SAU khi hộp đã gỡ (nền `inert` gỡ trước), nên nút nhận được tiêu điểm.
  useEffect(() => {
    if (dialog !== null || focusAfterClose.current === null) return;
    const target = focusAfterClose.current;
    focusAfterClose.current = null;
    (target.isConnected ? target : fallbackFocusRef.current)?.focus();
  }, [dialog, fallbackFocusRef]);

  const open = useCallback(
    (target: HandleTarget, trigger: HTMLElement) => {
      reset();
      setNote('');
      setDialog({ target, trigger });
    },
    [reset],
  );

  const close = useCallback(() => {
    if (isSending() || dialog === null) return;
    focusAfterClose.current = dialog.trigger;
    setDialog(null);
    setNote('');
    reset();
  }, [isSending, dialog, reset]);

  // `Tải lại chi tiết` ở hộp khi kết quả chưa rõ: đóng hộp rồi tải lại chi tiết để biết trạng thái thật
  const reloadAndClose = useCallback(() => {
    close();
    reload();
  }, [close, reload]);

  return {
    dialog,
    note,
    setNote,
    state,
    panelRef,
    open,
    close,
    reloadAndClose,
    // `ghiChu` đã qua `checkRequestNote` (chữ ĐÃ cắt); đúng một lần gọi mỗi cú bấm
    send: (ghiChu: string) => {
      if (dialog !== null) void submit({ target: dialog.target, ghiChu });
    },
    isSending,
    busy: state.kind === 'submitting',
  };
}

export type HandleRequestController = ReturnType<typeof useHandleRequest>;
