import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { AdminConfirmationDialog } from './admin-confirmation-dialog';
import { AdminDetailPanel } from './admin-detail-panel';
import { AdminSearchInput } from './admin-search-input';
import { AdminTable } from './admin-table';

interface Person {
  id: string;
  name: string;
}

const COLUMNS = [
  { id: 'name', header: 'Tên', cell: (person: Person) => person.name },
];

describe('Admin controls', () => {
  it('AF1-07 bảng hiển thị dữ liệu, tổng và chặn lùi/tiến ở biên', () => {
    const onPageChange = vi.fn();
    render(
      <AdminTable
        label="Nhân sự"
        columns={COLUMNS}
        rows={[{ id: '1', name: 'Nguyễn An' }]}
        getRowKey={(person) => person.id}
        page={1}
        pageSize={10}
        total={11}
        onPageChange={onPageChange}
      />,
    );

    expect(screen.getByRole('table', { name: 'Nhân sự' })).toBeInTheDocument();
    expect(screen.getByText('Nguyễn An')).toBeInTheDocument();
    expect(screen.getByText('1–10 / 11')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trang trước' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('AF1-07 bảng có trạng thái rỗng, trang cuối không đi tiếp', () => {
    render(
      <AdminTable
        label="Nhân sự"
        columns={COLUMNS}
        rows={[]}
        getRowKey={(person) => person.id}
        page={2}
        pageSize={10}
        total={11}
        onPageChange={() => undefined}
        emptyMessage="Chưa có nhân sự."
      />,
    );

    expect(screen.getByText('Chưa có nhân sự.')).toBeInTheDocument();
    expect(screen.getByText('11–11 / 11')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trang sau' })).toBeDisabled();
  });

  it('AF1-08 ô tìm kiếm controlled và gửi giá trị nhập/xoá qua onChange', () => {
    const onChange = vi.fn();
    render(
      <AdminSearchInput label="Tìm bác sĩ" value="" onChange={onChange} />,
    );

    const input = screen.getByRole('searchbox', { name: 'Tìm bác sĩ' });
    fireEvent.change(input, { target: { value: 'Nguyễn' } });
    expect(onChange).toHaveBeenCalledWith('Nguyễn');
  });

  it('AF1-09 dialog chỉ gọi callback tương ứng và vô hiệu khi pending', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <AdminConfirmationDialog
        open
        title="Xác nhận khoá"
        message="Khoá tài khoản này?"
        pending
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Xác nhận khoá' })).toHaveAttribute(
      'aria-modal',
      'true',
    );
    expect(
      screen.getByRole('button', { name: 'Đang xử lý…' }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Huỷ' })).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('AF1-09 nút Xác nhận và Huỷ gọi đúng callback', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <AdminConfirmationDialog
        open
        title="Xác nhận"
        message="Tiếp tục?"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('AF1-09 Esc đóng dialog và focus quay về nút mở', () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Mở xác nhận
          </button>
          <AdminConfirmationDialog
            open={open}
            title="Xác nhận"
            message="Tiếp tục?"
            onConfirm={() => setOpen(false)}
            onCancel={() => setOpen(false)}
          />
        </>
      );
    }

    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Mở xác nhận' });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Xác nhận' });
    expect(dialog).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.getByRole('button', { name: 'Huỷ' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(
      screen.getByRole('button', { name: 'Xác nhận' }),
    ).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.getByRole('button', { name: 'Huỷ' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('AF1-10 panel hiển thị nội dung và đóng bằng nút', () => {
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <AdminDetailPanel
          open={open}
          title="Chi tiết bác sĩ"
          onClose={() => setOpen(false)}
        >
          <p>Họ tên: Nguyễn An</p>
        </AdminDetailPanel>
      );
    }

    render(<Harness />);
    expect(screen.getByRole('dialog', { name: 'Chi tiết bác sĩ' })).toHaveFocus();
    expect(screen.getByText('Họ tên: Nguyễn An')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Đóng chi tiết' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('AF1-10 panel đóng bằng Escape', () => {
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <AdminDetailPanel
          open={open}
          title="Chi tiết bác sĩ"
          onClose={() => setOpen(false)}
        >
          <p>Hồ sơ</p>
        </AdminDetailPanel>
      );
    }

    render(<Harness />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
