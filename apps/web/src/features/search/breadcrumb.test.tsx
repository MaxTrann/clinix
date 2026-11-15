import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { Breadcrumb } from './breadcrumb';

// search F14, nhóm G5 (K2): đường dẫn có chevron 15 px thay chữ " / " (Figma 217:52, 259:52). Mã UIS-09 là [đề xuất] (PLAN search F14).
// Mức W (`css: false`): khoá LỚP CSS và ngữ nghĩa; gốc `html` 15 px nên `size-4` = 15 px, `gap-1.5` = 5,625 px, `text-sm` = 13,125 px.
function renderBreadcrumb(items: Parameters<typeof Breadcrumb>[0]['items']) {
  return render(
    <MemoryRouter>
      <Breadcrumb items={items} />
    </MemoryRouter>,
  );
}

describe('Breadcrumb theo Figma 259:52 (UIS-09)', () => {
  it('UIS-09 ba mục: hai liên kết, mục cuối là trang hiện tại (không phải liên kết); chữ 13,125 px, khe 5,625 px', () => {
    renderBreadcrumb([
      { label: 'Trang chủ', to: '/' },
      { label: 'Chuyên khoa', to: '/chuyen-khoa' },
      { label: 'Tim mạch' },
    ]);
    const nav = screen.getByRole('navigation', { name: 'Đường dẫn' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/',
      '/chuyen-khoa',
    ]);
    const current = within(nav).getByText('Tim mạch');
    expect(current).toHaveAttribute('aria-current', 'page');
    expect(current.closest('a')).toBeNull();
    const list = within(nav).getByRole('list');
    expect(list).toHaveClass('gap-1.5', 'text-sm', 'items-center');
  });

  it('UIS-09 ngăn cách bằng chevron 15 px (n − 1 biểu tượng, ẩn với trình đọc màn hình), không còn chữ " / "', () => {
    renderBreadcrumb([
      { label: 'Trang chủ', to: '/' },
      { label: 'Chuyên khoa', to: '/chuyen-khoa' },
      { label: 'Tim mạch' },
    ]);
    const nav = screen.getByRole('navigation', { name: 'Đường dẫn' });
    const chevrons = nav.querySelectorAll('svg');
    expect(chevrons).toHaveLength(2);
    for (const chevron of chevrons) {
      expect(chevron).toHaveClass('size-4');
      expect(chevron).toHaveAttribute('aria-hidden', 'true');
    }
    expect(nav.textContent).not.toContain('/');
  });

  it('UIS-09 một mục (mục đầu là trang hiện tại): không chevron, không liên kết', () => {
    renderBreadcrumb([{ label: 'Chuyên khoa' }]);
    const nav = screen.getByRole('navigation', { name: 'Đường dẫn' });
    expect(nav.querySelectorAll('svg')).toHaveLength(0);
    expect(within(nav).queryByRole('link')).toBeNull();
    expect(within(nav).getByText('Chuyên khoa')).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('UIS-09 mục cuối CÓ đường dẫn (chi tiết đang tải, chưa có tên): vẫn là liên kết, chưa đánh dấu trang hiện tại', () => {
    renderBreadcrumb([
      { label: 'Trang chủ', to: '/' },
      { label: 'Chuyên khoa', to: '/chuyen-khoa' },
    ]);
    const nav = screen.getByRole('navigation', { name: 'Đường dẫn' });
    expect(
      within(nav).getByRole('link', { name: 'Chuyên khoa' }),
    ).toHaveAttribute('href', '/chuyen-khoa');
    expect(nav.querySelector('[aria-current]')).toBeNull();
  });

  it('UIS-09 mục giữa không có đường dẫn: chữ thường, không liên kết và không đánh dấu trang hiện tại', () => {
    renderBreadcrumb([
      { label: 'Trang chủ', to: '/' },
      { label: 'Chưa có trang' },
      { label: 'Cuối' },
    ]);
    const nav = screen.getByRole('navigation', { name: 'Đường dẫn' });
    const middle = within(nav).getByText('Chưa có trang');
    expect(middle.closest('a')).toBeNull();
    expect(middle).not.toHaveAttribute('aria-current');
    expect(within(nav).getAllByRole('link')).toHaveLength(1);
  });
});
