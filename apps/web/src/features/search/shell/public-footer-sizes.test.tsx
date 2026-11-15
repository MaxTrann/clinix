import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { PublicFooter, type PublicFooterProps } from './public-footer';

// search F14, nhóm G4: chân trang theo Figma `257:1008`. Mã ca UIS-nn là [đề xuất] (PLAN search F14). Mức W (`css: false`): khoá LỚP CSS.
// Gốc `html` là 15 px: `py-12` = 45 px, `gap-8` = 30 px, `mt-8` = 30 px, `pt-6` = 22,5 px, `size-8` = 30 px, `size-5` = 18,75 px.
const PROPS: PublicFooterProps = {
  links: [
    { label: 'Trang chủ', to: '/', end: true },
    { label: 'Chuyên khoa', to: '/chuyen-khoa' },
    { label: 'Cẩm nang sức khỏe' },
  ],
  legalLinks: [{ label: 'Chính sách bảo mật' }],
  clinicInfo: {
    tenThuongHieu: 'CLINIX',
    diaChiTruSo: '12 Đường Mẫu',
    duongDayNong: '19001234',
    email: 'support@example.com',
  },
  specialties: Array.from({ length: 8 }, (_, index) => ({
    chuyenKhoaId: String(index + 1),
    ten: `Chuyên khoa mẫu ${index + 1}`,
  })),
};

function renderFooter(props: Partial<PublicFooterProps> = {}) {
  return render(
    <MemoryRouter>
      <PublicFooter {...PROPS} {...props} />
    </MemoryRouter>,
  );
}

describe('kích thước chân trang công khai theo Figma 257:1008 (UIS-08)', () => {
  it('UIS-08 khung 1200 px đệm 30 px, đệm dọc 45 px, bốn cột khe 30 px; không còn khung 1125 px', () => {
    renderFooter();
    const frame = screen.getByRole('contentinfo').firstElementChild;
    expect(frame).toHaveClass('max-w-320', 'px-8', 'py-12');
    expect(frame).not.toHaveClass('max-w-300');
    expect(frame).not.toHaveClass('px-7.5');
    expect(frame).not.toHaveClass('py-11');
    const grid = frame?.firstElementChild;
    expect(grid).toHaveClass('grid', 'gap-8', 'lg:grid-cols-4');
    expect(grid).not.toHaveClass('gap-7.5');
    expect(grid).not.toHaveClass('md:grid-cols-3');
  });

  it('UIS-08 logo 30 px, biểu tượng 18,75 px, chữ 18,75 px; đường phân cách cách trên 30 px, đệm 22,5 px', () => {
    renderFooter();
    const footer = screen.getByRole('contentinfo');
    const brand = within(footer).getByText('CLINIX');
    expect(brand).toHaveClass('text-xl');
    const logo = brand.previousElementSibling;
    expect(logo).toHaveClass('size-8');
    expect(logo?.querySelector('svg')).toHaveClass('size-5');
    const legal = within(footer).getByText(/Bảo lưu mọi quyền/).parentElement;
    expect(legal).toHaveClass('mt-8', 'pt-6', 'border-t');
    expect(legal).not.toHaveClass('mt-7.5');
    expect(legal).not.toHaveClass('pt-5.5');
  });

  it('UIS-08 cột theo thứ tự Figma: Liên kết nhanh, Chuyên khoa (8 tên có liên kết), Thông tin liên hệ', () => {
    renderFooter();
    const footer = within(screen.getByRole('contentinfo'));
    const headings = footer
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual([
      'Liên kết nhanh',
      'Chuyên khoa',
      'Thông tin liên hệ',
    ]);
    const column = footer.getByRole('heading', { name: 'Chuyên khoa' })
      .parentElement as HTMLElement;
    const links = within(column).getAllByRole('link');
    expect(links).toHaveLength(8);
    expect(links.map((link) => link.getAttribute('href'))).toEqual(
      Array.from({ length: 8 }, (_, index) => `/chuyen-khoa/${index + 1}`),
    );
    expect(links[0]).toHaveTextContent('Chuyên khoa mẫu 1');
  });

  it('UIS-08 dòng liên kết cao 19 px (Figma 257:1038): ba danh sách đặt `text-sm`, không để `li` lấy cỡ chữ gốc 15 px (cao 22,5 px)', () => {
    renderFooter();
    const footer = within(screen.getByRole('contentinfo'));
    const lists = [
      footer.getByRole('link', { name: 'Trang chủ' }).closest('ul'),
      footer.getByRole('link', { name: 'Chuyên khoa mẫu 1' }).closest('ul'),
      footer.getByText('Chính sách bảo mật').closest('ul'),
    ];
    for (const list of lists) {
      expect(list).toHaveClass('text-sm');
    }
    expect(lists[0]).toHaveClass('space-y-2', 'pt-4');
    expect(lists[1]).toHaveClass('space-y-2', 'pt-4');
  });

  it('UIS-08 chưa có chuyên khoa (đang tải, lỗi hoặc rỗng) ⇒ không có cột "Chuyên khoa"', () => {
    renderFooter({ specialties: [] });
    expect(screen.queryByRole('heading', { name: 'Chuyên khoa' })).toBeNull();
    expect(
      screen.getByRole('heading', { name: 'Liên kết nhanh' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Thông tin liên hệ' }),
    ).toBeInTheDocument();
  });
});
