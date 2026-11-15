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

// Ghép ba thao tác của Lễ tân vào trang chi tiết (booking F9 viết cho NGĂN; TRACKING 3.30 F9-G, F9-K; F12b: TRANG, TRACKING 3.44 F12b-C, F12b-D, cùng nếp `use-override.ts` của Quản trị viên). Trang gọi
// hook này và nhận lại: `handlers` cho `ReceptionActions`, hộp đang mở, trạng thái của máy chung `useStatusAction` và các ref/hàm để vẽ hộp và thông báo.
//  - `Hủy lịch` và `Vắng mặt` mở HỘP (modal duy nhất của trang: mỗi hộp gọi MỘT `useModalDialog`); `Tiếp đón` gọi THẲNG (Figma không có hộp xác nhận) và báo kết quả ở vùng thông báo của trang.
//  - Thành công: hộp đóng, trang báo kết quả, TẢI LẠI chi tiết (`reload`) cho khớp máy chủ; tiêu điểm vào vùng thông báo. Danh sách KHÔNG còn mount cùng trang nên không có gì để tải lại:
//    khi quay lại danh sách, trang danh sách dựng lại và tự tải (F12b bỏ `onReloadList` của F9).
//  - Lỗi làm dữ liệu lệch (409, 404): tải lại chi tiết; hộp vẫn hiện câu lỗi tới khi đóng.
//  - Đóng hộp KHÔNG thành công (`Đóng`, `Hủy`, Esc, lớp phủ): tiêu điểm về ĐÚNG nút đã mở (phần tử nhận từ handler); nút đã biến mất thì về `fallbackFocusRef` (h1 của trang).
//  - Đang gửi thì không đóng gì cả (`isSending`): đóng giữa chừng làm mất kết quả và chi tiết không được tải lại.
interface UseReceptionActionsOptions {
  maLichHen: string;
  // Họ tên người khám ở chi tiết đang hiện, để ghi vào câu của hộp vắng mặt
  patientName: string;
  // Chi tiết đang tải lại (giữ bản cũ): nút cũ vẫn hiện nên phải vô hiệu tới khi bản mới về
  detailRefreshing: boolean;
  reload: () => void;
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
  fallbackFocusRef,
}: UseReceptionActionsOptions) {
  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  // Phần tử của hộp, dùng làm vùng bẫy Tab của `useModalDialog` trong hộp
  const dialogPanelRef = useRef<HTMLDivElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const focusAfterClose = useRef<HTMLElement | null>(null);

  const action = useStatusAction({
    maLichHen,
    onSucceeded: () => {
      // Hộp đóng KHÔNG trả tiêu điểm về nút mở (nút sẽ biến mất theo `chuyenDuoc[]` mới): tiêu điểm vào vùng thông báo (effect dưới)
      setDialog(null);
      reload();
    },
    // Trang chỉ có chi tiết (không có danh sách): cả hai phạm vi tải lại chi tiết
    onStale: () => reload(),
  });
  const { state, submit, reset, isSending } = action;

  // Tiêu điểm: sau khi hộp đóng không thành công thì về nút đã mở. Chạy SAU khi hộp đã gỡ (cleanup của hộp gỡ `inert` trước), nên nút nhận được tiêu điểm.
  useEffect(() => {
    if (dialog !== null || focusAfterClose.current === null) return;
    const target = focusAfterClose.current;
    focusAfterClose.current = null;
    (target.isConnected ? target : fallbackFocusRef.current)?.focus();
  }, [dialog, fallbackFocusRef]);

  // Có kết quả hay lỗi ở vùng thông báo của trang (hộp không mở): tiêu điểm vào đó
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
    reload();
  }, [closeDialog, reload]);

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
    // `Tải lại chi tiết` ở vùng thông báo (kết quả chưa rõ): xoá thông báo rồi tải lại chi tiết
    reloadFromNotice: () => {
      reset();
      reload();
    },
  };
}

export type ReceptionActionsController = ReturnType<typeof useReceptionActions>;
