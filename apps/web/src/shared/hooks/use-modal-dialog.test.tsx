import { fireEvent, render } from '@testing-library/react';
import { useRef } from 'react';
import { useModalDialog } from './use-modal-dialog';

// patient F11 (TRACKING F11-G). Mã ca MD-nn là [đề xuất]: chỉ hai nhánh phòng thủ mà RS-10…RS-21 (qua RoleShell) không chạm tới.
function Probe({
  withDialog,
  onClose,
}: {
  withDialog: boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const focusRef = useRef<HTMLParagraphElement>(null);
  useModalDialog({
    open: true,
    dialogRef,
    initialFocusRef: focusRef,
    returnFocusRef: focusRef,
    onClose,
  });
  // Hộp thoại không có phần tử nào nhận Tab
  return withDialog ? (
    <div ref={dialogRef}>
      <p ref={focusRef}>Chỉ có chữ</p>
    </div>
  ) : null;
}

it('MD-01 KG-08 hộp thoại không có phần tử nhận Tab: Tab không bị chặn, không lỗi; Esc vẫn đóng', () => {
  const onClose = vi.fn();
  render(<Probe withDialog onClose={onClose} />);
  expect(fireEvent.keyDown(document.body, { key: 'Tab' })).toBe(true);
  fireEvent.keyDown(document.body, { key: 'Escape' });
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('MD-02 KG-08 chưa gắn được hộp thoại (ref rỗng): Tab bỏ qua, Esc vẫn đóng', () => {
  const onClose = vi.fn();
  render(<Probe withDialog={false} onClose={onClose} />);
  expect(fireEvent.keyDown(document.body, { key: 'Tab' })).toBe(true);
  fireEvent.keyDown(document.body, { key: 'Escape' });
  expect(onClose).toHaveBeenCalledTimes(1);
});
