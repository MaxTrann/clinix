import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { BranchPicker } from './branch-picker';
import { PublicHeader, type PublicHeaderProps } from './public-header';

// search F14, nhóm G1: kích thước thanh menu theo Figma `257:6`. Mã ca UIS-nn là [đề xuất] (PLAN search F14).
// Mức W (`css: false`): khoá LỚP CSS, không đo bố cục; số đo thật (getBoundingClientRect) ghi ở TRACKING mục 6.
// Gốc `html` là 15 px nên `h-16` = 60 px, `size-8` = 30 px, `size-5` = 18,75 px, `text-xl` = 18,75 px, `gap-2.5` = 9,375 px.
const PROPS: PublicHeaderProps = {
  navItems: [
    { label: 'Trang chủ', to: '/', end: true },
    { label: 'Dịch vụ khám', to: '/dat-lich', hasMenu: true },
    { label: 'Chuyên khoa', to: '/chuyen-khoa' },
    { label: 'Cẩm nang' },
  ],
  bookingItem: { label: 'Đặt lịch khám', to: '/dat-lich' },
  loginPath: '/dang-nhap',
  user: null,
};

function renderHeader(props: Partial<PublicHeaderProps> = {}) {
  return render(
    <MemoryRouter>
      <PublicHeader {...PROPS} {...props} />
    </MemoryRouter>,
  );
}

describe('kích thước thanh menu công khai theo Figma 257:6 (UIS-02)', () => {
  it('UIS-02 khung 1200 px đệm 30 px, cao 60 px; không còn khung 1125 px (`max-w-300`)', () => {
    renderHeader();
    const frame = screen.getByRole('banner').firstElementChild;
    expect(frame).toHaveClass('max-w-320', 'px-8', 'h-16', 'justify-between');
    expect(frame).not.toHaveClass('max-w-300', 'px-7.5', 'h-15');
  });

  it('UIS-02 logo: ô 30 px, biểu tượng 18,75 px, chữ 18,75 px, khe 9,375 px', () => {
    renderHeader();
    const logo = screen.getByRole('link', { name: 'CLINIX' });
    expect(logo).toHaveClass('gap-2.5');
    const box = logo.firstElementChild;
    expect(box).toHaveClass('size-8');
    expect(box?.querySelector('svg')).toHaveClass('size-5');
    expect(within(logo).getByText('CLINIX')).toHaveClass('text-xl');
  });

  it('UIS-02 mọi mục menu (liên kết, nút Dịch vụ khám, nút vô hiệu) một dòng và không co lại', () => {
    renderHeader();
    const nav = within(
      screen.getByRole('navigation', { name: 'Điều hướng chính' }),
    );
    const entries = [
      nav.getByRole('link', { name: 'Trang chủ' }),
      nav.getByRole('button', { name: 'Dịch vụ khám' }),
      nav.getByRole('link', { name: 'Chuyên khoa' }),
      nav.getByRole('button', { name: /Cẩm nang/ }),
    ];
    for (const entry of entries) {
      expect(entry).toHaveClass(
        'whitespace-nowrap',
        'shrink-0',
        'px-3',
        'py-2',
      );
    }
  });

  it('UIS-02 đã đăng nhập vẫn giữ khung và mục một dòng (nút tài khoản thay "Đăng nhập")', () => {
    renderHeader({
      user: {
        name: 'Bệnh nhân mẫu',
        homePath: '/benh-nhan',
        logout: {
          onLogout: () => undefined,
          pending: false,
          failed: false,
          failedMessage: '',
        },
      },
    });
    expect(screen.getByRole('banner').firstElementChild).toHaveClass(
      'max-w-320',
      'px-8',
    );
    expect(
      within(
        screen.getByRole('navigation', { name: 'Điều hướng chính' }),
      ).getByRole('link', { name: 'Chuyên khoa' }),
    ).toHaveClass('whitespace-nowrap');
  });

  it('UIS-02 nút "Đặt lịch khám" và "Đăng nhập" một dòng, không co (đo 1036 px: xuống 3 và 2 dòng)', () => {
    renderHeader();
    for (const name of ['Đặt lịch khám', 'Đăng nhập']) {
      expect(screen.getByRole('link', { name })).toHaveClass(
        'whitespace-nowrap',
        'shrink-0',
      );
    }
  });

  it('UIS-02 hàng hành động: khe 11,25 px, co lại được (`min-w-0`) để nhãn dài bị cắt thay vì tràn khung', () => {
    renderHeader();
    const row = screen.getByRole('link', {
      name: 'Đặt lịch khám',
    }).parentElement;
    expect(row).toHaveClass('min-w-0', 'gap-3', 'items-center');
    expect(row).not.toHaveClass('gap-4');
  });

  it('UIS-02 đã đăng nhập: hộp bọc nút tài khoản co lại được (`min-w-0`), tên dài bị cắt bằng `truncate`', () => {
    renderHeader({
      user: {
        name: 'Nguyễn Thị Phương Thảo Vy',
        homePath: '/benh-nhan',
        logout: {
          onLogout: () => undefined,
          pending: false,
          failed: false,
          failedMessage: '',
        },
      },
    });
    const trigger = screen.getByRole('button', {
      name: 'Nguyễn Thị Phương Thảo Vy',
    });
    expect(trigger.parentElement).toHaveClass('min-w-0', 'max-w-56');
    expect(trigger).toHaveClass('max-w-full');
    expect(within(trigger).getByText('Nguyễn Thị Phương Thảo Vy')).toHaveClass(
      'truncate',
    );
  });

  it('UIS-02 bộ chọn chi nhánh tối đa 150 px (`max-w-40` ở hộp bọc), không còn 210 px (`max-w-56`)', () => {
    render(
      <MemoryRouter>
        <BranchPicker
          branches={[]}
          loaded
          selectedId={null}
          locating={false}
          notice={null}
          canLocate
          onSelect={() => undefined}
          onLocate={() => undefined}
          allBranchesTo="/chi-nhanh"
        />
      </MemoryRouter>,
    );
    const trigger = screen.getByRole('button', {
      name: /Chi nhánh đang chọn/,
    });
    expect(trigger.parentElement).toHaveClass('max-w-40', 'min-w-0');
    expect(trigger.parentElement).not.toHaveClass('max-w-56');
    expect(trigger).toHaveClass('max-w-full');
  });
});
