import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import type { ReceptionActionHandlers } from './reception-actions';
import { ACTION_TEXT } from './detail-messages';
import { useStatusAction } from './use-status-action';

// Ghép ba thao tác của Lễ tân vào ngăn chi tiết (booking F9; TRACKING 3.30 F9-G, F9-K). Ngăn gọi hook này và nhận lại: `handlers` cho `ReceptionActions` (thay hằng rỗng của F8), hộp
// đang mở, trạng thái của máy chung `useStatusAction` và các ref/hàm để vẽ hộp và thông báo.
//  - `Hủy lịch` và `Vắng mặt` mở HỘP (modal thứ hai); `Tiếp đón` gọi THẲNG (Figma không có hộp xác nhận) và báo kết quả ở vùng thông báo của ngăn.
//  - Thành công: hộp đóng, ngăn báo kết quả, TẢI LẠI chi tiết (`reload`) và danh sách (`onReloadList`) cho khớp máy chủ; tiêu điểm vào vùng thông báo.
//  - Lỗi làm dữ liệu lệch (409, 404): tải lại chi tiết (và danh sách khi trạng thái hay sự tồn tại đổi); hộp vẫn hiện câu lỗi tới khi đóng.
//  - Đóng hộp KHÔNG thành công (`Đóng`, `Hủy`, Esc, lớp phủ): tiêu điểm về ĐÚNG nút đã mở (phần tử nhận từ handler); nút đã biến mất thì về `fallbackFocusRef` (`Danh sách`).
//  - Đang gửi thì không đóng gì cả (`isSending`): đóng giữa chừng làm mất kết quả và danh sách không được tải lại.
interface UseReceptionActionsOptions {
  maLichHen: string;
  // Họ tên người khám ở chi tiết đang hiện, để ghi vào câu của hộp vắng mặt
  patientName: string;
  // Chi tiết đang tải lại (giữ bản cũ): nút cũ vẫn hiện nên phải vô hiệu tới khi bản mới về
  detailRefreshing: boolean;
  reload: () => void;
  onReloadList: () => void;
  fallbackFocusRef: RefObject<HTMLElement | null>;
}

interface OpenDialog {
  target: 'DaHuy' | 'VangMat';
  trigger: HTMLElement;
  // Chụp lúc mở: chi tiết có thể đang tải lại (hay lỗi) khi hộp còn hiện
  patientName: string;
}

export function useReceptionActions({
  maLichHen,
  patientName,
  detailRefreshing,
  reload,
  onReloadList,
  fallbackFocusRef,
}: UseReceptionActionsOptions) {
  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  // Phần tử của hộp mà ngăn dùng làm vùng bẫy Tab khi hộp mở
  const dialogPanelRef = useRef<HTMLDivElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const focusAfterClose = useRef<HTMLElement | null>(null);

  const refreshDetail = useCallback(() => reload(), [reload]);
  const refreshDetailAndList = useCallback(() => {
    reload();
    onReloadList();
  }, [reload, onReloadList]);

  const action = useStatusAction({
    maLichHen,
    onSucceeded: () => {
      // Hộp đóng KHÔNG trả tiêu điểm về nút mở (nút sẽ biến mất theo `chuyenDuoc[]` mới): tiêu điểm vào vùng thông báo (effect dưới)
      setDialog(null);
      refreshDetailAndList();
    },
    onStale: (scope) =>
      scope === 'detailAndList' ? refreshDetailAndList() : refreshDetail(),
  });
  const { state, submit, reset, isSending } = action;

  // Tiêu điểm: sau khi hộp đóng không thành công thì về nút đã mở. Chạy SAU khi hộp đã gỡ (cleanup của hộp gỡ `inert` trước), nên nút nhận được tiêu điểm.
  useEffect(() => {
    if (dialog !== null || focusAfterClose.current === null) return;
    const target = focusAfterClose.current;
    focusAfterClose.current = null;
    (target.isConnected ? target : fallbackFocusRef.current)?.focus();
  }, [dialog, fallbackFocusRef]);

  // Có kết quả hay lỗi ở vùng thông báo của ngăn (hộp không mở): tiêu điểm vào đó
  useEffect(() => {
    if (dialog !== null) return;
    if (
      state.kind === 'done' ||
      state.kind === 'failed' ||
      state.kind === 'stopped'
    ) {
      noticeRef.current?.focus();
    }
  }, [state, dialog]);

  const closeDialog = useCallback(() => {
    if (isSending() || dialog === null) return;
    focusAfterClose.current = dialog.trigger;
    setDialog(null);
    reset();
  }, [isSending, dialog, reset]);

  const reloadAndClose = useCallback(() => {
    closeDialog();
    refreshDetailAndList();
  }, [closeDialog, refreshDetailAndList]);

  const open = (target: OpenDialog['target'], trigger: HTMLElement) => {
    reset();
    setDialog({ target, trigger, patientName });
  };
  const handlers: ReceptionActionHandlers = {
    DaHuy: (trigger) => open('DaHuy', trigger),
    VangMat: (trigger) => open('VangMat', trigger),
    DaTiepDon: () => {
      reset();
      void submit({ trangThai: 'DaTiepDon' });
    },
  };

  return {
    handlers,
    state,
    dialog,
    dialogPanelRef,
    noticeRef,
    submit,
    isSending,
    closeDialog,
    reloadAndClose,
    // Vô hiệu cả nhóm nút khi đang gửi hay chi tiết đang tải lại
    busy: state.kind === 'submitting' || detailRefreshing,
    // `Tiếp đón` đang gửi (không có hộp): nút đó đổi chữ
    sendingCheckIn:
      state.kind === 'submitting' && dialog === null
        ? {
            target: 'DaTiepDon' as const,
            label: ACTION_TEXT.checkIn.confirming,
          }
        : null,
    // `Tải lại chi tiết` ở vùng thông báo (kết quả chưa rõ): xoá thông báo rồi tải lại cả chi tiết và danh sách
    reloadFromNotice: () => {
      reset();
      refreshDetailAndList();
    },
  };
}

export type ReceptionActionsController = ReturnType<typeof useReceptionActions>;
