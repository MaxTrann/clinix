import { fireEvent, render, screen } from '@testing-library/react';
import { AdminPagination } from './admin-pagination';

// AF1-11 (PR1 mục 6): một component phân trang cho AdminTable và hai tab của Loại dịch vụ khám; chữ "Hiển thị a–b trên c"
// [đề xuất], trang vượt biên được kẹp lại, nút ở biên bị vô hiệu.

function renderPagination(page: number, pageSize: number, total: number) {
  const onPageChange = vi.fn();
  render(
    <AdminPagination
      page={page}
      pageSize={pageSize}
      total={total}
      onPageChange={onPageChange}
    />,
  );
  return onPageChange;
}

describe('AdminPagination (AF1-11)', () => {
  it('trang đầu: chữ "Hiển thị 1 – 10 trên 11", Trước bị vô hiệu, Sau gọi trang 2', () => {
    const onPageChange = renderPagination(1, 10, 11);

    expect(screen.getByText('Hiển thị 1 – 10 trên 11')).toBeInTheDocument();
    expect(screen.getByText('Trang 1 / 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trang trước' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    expect(onPageChange).toHaveBeenCalledExactlyOnceWith(2);
  });

  it('trang cuối chỉ có một dòng: "Hiển thị 11 – 11 trên 11", Sau bị vô hiệu, Trước gọi trang 1', () => {
    const onPageChange = renderPagination(2, 10, 11);

    expect(screen.getByText('Hiển thị 11 – 11 trên 11')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trang sau' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Trang trước' }));
    expect(onPageChange).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('trang giữa của ba trang: cả hai nút bấm được', () => {
    renderPagination(2, 10, 25);

    expect(screen.getByText('Hiển thị 11 – 20 trên 25')).toBeInTheDocument();
    expect(screen.getByText('Trang 2 / 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trang trước' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Trang sau' })).toBeEnabled();
  });

  it('không có dữ liệu: "Hiển thị 0 trên 0", Trang 1 / 1, cả hai nút bị vô hiệu', () => {
    renderPagination(1, 10, 0);

    expect(screen.getByText('Hiển thị 0 trên 0')).toBeInTheDocument();
    expect(screen.getByText('Trang 1 / 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trang trước' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Trang sau' })).toBeDisabled();
  });

  it('trang vượt biên (người khác xóa dữ liệu) được kẹp về trang cuối, Trước gọi trang kề', () => {
    const onPageChange = renderPagination(5, 10, 11);

    expect(screen.getByText('Hiển thị 11 – 11 trên 11')).toBeInTheDocument();
    expect(screen.getByText('Trang 2 / 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trang sau' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Trang trước' }));
    expect(onPageChange).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('kích thước trang 0 hoặc tổng âm không chia cho 0 và không in số âm', () => {
    renderPagination(1, 0, -3);

    expect(screen.getByText('Hiển thị 0 trên 0')).toBeInTheDocument();
    expect(screen.getByText('Trang 1 / 1')).toBeInTheDocument();
  });

  it('dòng "Hiển thị" nằm trong vùng aria-live lịch sự để đọc lại khi đổi trang', () => {
    renderPagination(1, 10, 11);

    expect(screen.getByText('Hiển thị 1 – 10 trên 11')).toHaveAttribute(
      'aria-live',
      'polite',
    );
  });
});
