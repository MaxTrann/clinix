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
import {
  useReplacementSlot,
  type FindDoctor,
  type ReplacementSlot,
} from './use-replacement-slot';

// Ghép hai thao tác Duyệt, Từ chối vào trang chi tiết yêu cầu đổi lịch (reschedule F4 Pha B1; nếp `use-reception-actions.ts` của F12b): trang gọi hook này và nhận lại hộp đang mở, ghi chú, trạng thái của máy chung
// `useStatusAction` (CHUNG với hộp Huỷ: chốt `useRef` chống gửi đúp, "chưa rõ" cho mạng, quá giờ và 200 sai hình dạng, KHÔNG BAO GIỜ tự gửi lại) và các hàm để vẽ hộp. `useStatusAction` đặt tên tham số là `maLichHen`
// nhưng chỉ là chuỗi định danh: ở đây là id yêu cầu.
//  - Hai nút mở HỘP (modal duy nhất của trang: `useModalDialog` ở `handle-dialog.tsx`). Ghi chú nằm ở ĐÂY (không ở hộp) để B2 đóng hộp khi chọn khung giờ thay thế mà không mất chữ đã gõ.
//  - Thành công: đóng hộp rồi `onDone(target)` (trang về danh sách kèm thông báo một lần; không cần tải lại chi tiết vì rời trang).
//  - Lỗi làm dữ liệu đang hiện lệch máy chủ (409 đã xử lý, 404, lịch không còn duyệt được, khung giờ vừa bị chiếm): tải lại chi tiết; hộp vẫn hiện câu lỗi tới khi đóng; yêu cầu VẪN `ChoDuyet` thì giữ hộp và chữ.
//  - Đóng hộp KHÔNG thành công: tiêu điểm về ĐÚNG nút đã mở; nút đã biến mất (yêu cầu đã xử lý) thì về `fallbackFocusRef` (h1 của trang). Đang gửi thì không đóng gì cả (đóng giữa chừng làm mất kết quả).
//  - Khung giờ thay thế (Pha B2, chỉ hộp Duyệt và chỉ khi nơi gọi truyền `findDoctor`): bấm "Chọn khung giờ khác" ⇒ hỏi id bác sĩ ⇒ TẠM đóng hộp (giữ ghi chú, bỏ câu lỗi cũ) và mở bảng chọn (`picking`); chọn ô
//    hay quay lại ⇒ mở lại hộp. Khung giờ đã chọn đi trong thân `approve`; mở hộp mới, đóng hộp hay xong thì bỏ.
export type HandleTarget = 'approve' | 'reject';

interface HandleBody {
  target: HandleTarget;
  ghiChu: string;
  // Chỉ khi duyệt bằng khung giờ thay thế
  khungGioId?: string;
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
  // Hỏi id bác sĩ để vẽ lưới khung giờ thay thế; VẮNG ⇒ không có nút "Chọn khung giờ khác" (quyết định cả câu của lỗi khung giờ)
  findDoctor?: FindDoctor;
}

export function useHandleRequest({
  yeuCauId,
  handlers,
  reload,
  fallbackFocusRef,
  onDone,
  findDoctor,
}: UseHandleRequestOptions) {
  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  const [note, setNote] = useState('');
  // Bảng chọn khung giờ đang mở: giữ id bác sĩ và nút đã mở hộp để mở lại hộp Duyệt
  const [picking, setPicking] = useState<{
    bacSiId: string;
    trigger: HTMLElement;
  } | null>(null);
  const replacement = useReplacementSlot();
  const canPickAnother = findDoctor !== undefined;
  // Phần tử của hộp, dùng làm vùng bẫy Tab của `useModalDialog`
  const panelRef = useRef<HTMLDivElement>(null);
  const focusAfterClose = useRef<HTMLElement | null>(null);

  const action = useStatusAction<HandleBody, ApproveResult | RejectResult>({
    maLichHen: yeuCauId,
    perform: (id, body) =>
      body.target === 'approve'
        ? handlers.approve(id, approveBody(body.ghiChu, body.khungGioId))
        : handlers.reject(id, rejectBody(body.ghiChu)),
    describe: (error) => describeHandleFailure(error, { canPickAnother }),
    onSucceeded: () => {
      const target = dialog?.target;
      setDialog(null);
      setNote('');
      replacement.reset();
      if (target !== undefined) onDone(target);
    },
    onStale: () => reload(),
  });
  const { state, submit, reset, isSending } = action;
  const { reset: resetReplacement } = replacement;

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
      resetReplacement();
      setNote('');
      setDialog({ target, trigger });
    },
    [reset, resetReplacement],
  );

  const close = useCallback(() => {
    if (isSending() || dialog === null) return;
    focusAfterClose.current = dialog.trigger;
    setDialog(null);
    setNote('');
    reset();
    resetReplacement();
  }, [isSending, dialog, reset, resetReplacement]);

  // `Tải lại chi tiết` ở hộp khi kết quả chưa rõ: đóng hộp rồi tải lại chi tiết để biết trạng thái thật
  const reloadAndClose = useCallback(() => {
    close();
    reload();
  }, [close, reload]);

  // "Chọn khung giờ khác": hỏi id bác sĩ TRƯỚC, có rồi mới tạm đóng hộp. Đóng hộp hay gửi đi thì lời hỏi bị huỷ nên kết quả muộn không làm gì.
  const pickAnother = () => {
    if (dialog === null || findDoctor === undefined || isSending()) return;
    const { trigger } = dialog;
    void replacement.findDoctorId(findDoctor, (bacSiId) => {
      reset();
      setDialog(null);
      setPicking({ bacSiId, trigger });
    });
  };

  // Chọn xong (`slot`) hay quay lại (không `slot`, giữ lựa chọn cũ): mở lại hộp Duyệt với ghi chú đang gõ
  const finishPicking = (slot?: ReplacementSlot) => {
    if (picking === null) return;
    if (slot !== undefined) replacement.choose(slot);
    setDialog({ target: 'approve', trigger: picking.trigger });
    setPicking(null);
  };

  // "Dùng lại khung giờ mong muốn": bỏ lựa chọn và câu lỗi của khung giờ vừa thử
  const restoreDesiredSlot = () => {
    replacement.clearChoice();
    reset();
  };

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
      if (dialog === null) return;
      replacement.cancelLookup();
      void submit({
        target: dialog.target,
        ghiChu,
        khungGioId:
          dialog.target === 'approve'
            ? replacement.chosen?.khungGioId
            : undefined,
      });
    },
    isSending,
    busy: state.kind === 'submitting',
    canPickAnother,
    picking,
    chosen: replacement.chosen,
    lookup: replacement.lookup,
    pickAnother,
    finishPicking,
    restoreDesiredSlot,
  };
}

export type HandleRequestController = ReturnType<typeof useHandleRequest>;
