import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { useStatusAction } from '../../common/use-status-action';
import { overrideAppointmentStatus } from '../api/admin-override-api';
import type {
  OverrideBody,
  OverrideResult,
  OverrideTarget,
} from '../api/admin-appointment-types';
import { describeOverrideFailure } from './override-failure';

// Ghép thao tác override vào trang chi tiết của Quản trị viên (booking F10; TRACKING 3.35 F10-F), cùng nếp `use-reception-actions.ts` của F9: trang gọi hook này và nhận lại hộp đang mở,
// trạng thái của máy chung `useStatusAction`, các ref và hàm để vẽ hộp và thông báo.
//  - Bấm một nút đích mở HỘP (modal duy nhất của trang); `submit` gửi MỘT POST `{ trangThai, lyDo }`, không bao giờ tự gửi lại.
//  - Thành công: hộp đóng, trang báo kết quả, TẢI LẠI chi tiết (`reload`: nút theo `chuyenDuoc[]` mới và panel có mục `OverrideLichHen` mới); tiêu điểm vào vùng thông báo.
//  - Lỗi làm dữ liệu lệch (409, 404): tải lại chi tiết; hộp vẫn hiện câu lỗi tới khi đóng. 503: bấm lại được, không tải lại.
//  - Đóng hộp KHÔNG thành công (`Đóng`, Esc, lớp phủ): tiêu điểm về ĐÚNG nút đã mở (phần tử nhận từ nút); nút đã biến mất thì về `fallbackFocusRef` (`Quay lại danh sách`).
//  - Đang gửi thì không đóng gì cả (`isSending`): đóng giữa chừng làm mất kết quả và chi tiết không được tải lại.
interface UseOverrideOptions {
  maLichHen: string;
  // Chi tiết đang tải lại (giữ bản cũ): nút cũ vẫn hiện nên phải vô hiệu tới khi bản mới về
  detailRefreshing: boolean;
  reload: () => void;
  fallbackFocusRef: RefObject<HTMLElement | null>;
}

interface OpenDialog {
  target: OverrideTarget;
  trigger: HTMLElement;
  // Trạng thái hiện tại, chụp lúc mở: chi tiết có thể đang tải lại (hay lỗi) khi hộp còn hiện
  fromState: string;
}

export function useOverride({
  maLichHen,
  detailRefreshing,
  reload,
  fallbackFocusRef,
}: UseOverrideOptions) {
  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  // Phần tử của hộp, dùng làm vùng bẫy Tab
  const panelRef = useRef<HTMLDivElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const focusAfterClose = useRef<HTMLElement | null>(null);

  const action = useStatusAction<OverrideBody, OverrideResult>({
    maLichHen,
    perform: overrideAppointmentStatus,
    describe: (error, body) => describeOverrideFailure(error, body.trangThai),
    onSucceeded: () => {
      // Hộp đóng KHÔNG trả tiêu điểm về nút mở (nút có thể biến mất theo `chuyenDuoc[]` mới): tiêu điểm vào vùng thông báo (effect dưới)
      setDialog(null);
      reload();
    },
    // Trang chỉ có chi tiết (không có danh sách): cả hai phạm vi tải lại chi tiết
    onStale: () => reload(),
  });
  const { state, submit, reset, isSending } = action;

  // Sau khi hộp đóng không thành công thì tiêu điểm về nút đã mở. Chạy SAU khi hộp đã gỡ (cleanup của khung gỡ `inert` trước), nên nút nhận được tiêu điểm.
  useEffect(() => {
    if (dialog !== null || focusAfterClose.current === null) return;
    const target = focusAfterClose.current;
    focusAfterClose.current = null;
    (target.isConnected ? target : fallbackFocusRef.current)?.focus();
  }, [dialog, fallbackFocusRef]);

  // Có kết quả hay lỗi ở vùng thông báo (hộp không mở): tiêu điểm vào đó
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

  const open = (
    target: OverrideTarget,
    trigger: HTMLElement,
    fromState: string,
  ) => {
    reset();
    setDialog({ target, trigger, fromState });
  };

  return {
    state,
    dialog,
    panelRef,
    noticeRef,
    submit,
    isSending,
    open,
    closeDialog,
    reloadAndClose,
    // Vô hiệu cả nhóm nút khi đang gửi hay chi tiết đang tải lại
    busy: state.kind === 'submitting' || detailRefreshing,
    // `Tải lại chi tiết` ở vùng thông báo (kết quả chưa rõ): xoá thông báo rồi tải lại chi tiết
    reloadFromNotice: () => {
      reset();
      reload();
    },
  };
}
