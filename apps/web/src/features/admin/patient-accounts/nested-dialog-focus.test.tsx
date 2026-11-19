import { fireEvent, render, screen, within } from '@testing-library/react';
import { AdminConfirmationDialog } from '../components/admin-confirmation-dialog';
import { AdminDetailPanel } from '../components/admin-detail-panel';

// admin F9, BẰNG CHỨNG cho thiết kế "panel tạm ẩn khi hộp xác nhận mở" (mã TKF9-36 là [đề xuất]; TRACKING admin 9A.12 mục 1.5 và 10).
// Test này mô tả hành vi HIỆN TẠI của `useAdminDialogFocus` (F1, dùng chung) khi hai hộp CÙNG MỞ: đây là lý do màn F9 không bao giờ để hai hộp cùng mở.
// Nó KHÔNG phải mong muốn: nếu F1 sửa hook để hỗ trợ hộp lồng nhau thì test này đỏ, và khi đó bỏ cả test lẫn cách tránh ở `patient-accounts-page.tsx`.

function Both({
  onPanelClose,
  onDialogCancel,
}: {
  onPanelClose: () => void;
  onDialogCancel: () => void;
}) {
  return (
    <>
      <AdminDetailPanel open title="Chi tiết" onClose={onPanelClose}>
        <button type="button">Khoá tài khoản</button>
      </AdminDetailPanel>
      <AdminConfirmationDialog
        open
        title="Xác nhận khoá"
        message="Khoá tài khoản này?"
        onConfirm={() => undefined}
        onCancel={onDialogCancel}
      />
    </>
  );
}

describe('TKF9-36 (bằng chứng) hai hộp cùng mở tranh nhau phím', () => {
  it('TKF9-36 Esc trong hộp xác nhận đóng CẢ panel lẫn hộp (một lần bấm, hai lần đóng)', () => {
    const onPanelClose = vi.fn();
    const onDialogCancel = vi.fn();
    render(
      <Both onPanelClose={onPanelClose} onDialogCancel={onDialogCancel} />,
    );

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onDialogCancel).toHaveBeenCalledTimes(1);
    expect(onPanelClose).toHaveBeenCalledTimes(1);
  });

  it('TKF9-36 Tab ở nút ĐẦU của hộp bị chặn (focus bị kéo về nút đầu thay vì sang nút thứ hai): người dùng bàn phím không tới được nút xác nhận', () => {
    render(
      <Both onPanelClose={() => undefined} onDialogCancel={() => undefined} />,
    );
    const dialog = screen.getByRole('dialog', { name: 'Xác nhận khoá' });
    const cancel = within(dialog).getByRole('button', { name: 'Huỷ' });
    cancel.focus();

    // Với MỘT hộp, Tab ở nút đầu không bị chặn (xem TKF9-36 ở patient-detail-panel.test.tsx). Với hai hộp thì bị chặn: `false` = đã `preventDefault`.
    expect(fireEvent.keyDown(cancel, { key: 'Tab' })).toBe(false);
    expect(cancel).toHaveFocus();
  });
});
