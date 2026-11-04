import { fireEvent, render, screen, within } from '@testing-library/react';
import { Bell, Calendar, House, LayoutDashboard, Users } from 'lucide-react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import {
  RoleShell,
  type RoleNavItem,
  type RoleShellLogout,
} from './role-shell';

// patient F1 (TRACKING F1-H). Mã ca RS-nn là [đề xuất]; mỗi ca ghi mã KG của PLAN mục 7.5 mà nó phủ.
const ITEMS: RoleNavItem[] = [
  // Mục trỏ về gốc của khung (như "Tổng quan" sau này): cần `end` để không sáng ở mọi trang con
  { label: 'Tổng quan', icon: LayoutDashboard, to: '/khu', end: true },
  { label: 'Lịch hẹn của tôi', icon: Calendar },
  { label: 'Thông báo', icon: Bell },
  { label: 'Hồ sơ người khám', icon: Users, to: '/khu/ho-so' },
  { label: 'Trang khác', icon: Users, to: '/khu/khac' },
];
const FOOTER: RoleNavItem[] = [{ label: 'Về trang chủ', icon: House, to: '/' }];

function logoutOf(next: Partial<RoleShellLogout> = {}): RoleShellLogout {
  return {
    onLogout: vi.fn(),
    pending: false,
    failed: false,
    failedMessage: 'Câu lỗi đăng xuất',
    ...next,
  };
}

function renderShell({
  path = '/khu/ho-so',
  footerItems = FOOTER,
  logout = logoutOf(),
}: {
  path?: string;
  footerItems?: RoleNavItem[];
  logout?: RoleShellLogout;
} = {}) {
  const element = (
    <RoleShell
      navLabel="Điều hướng Thử"
      userName="Nguyễn Văn A"
      userSubtitle="Bệnh nhân"
      items={ITEMS}
      footerItems={footerItems}
      logout={logout}
    >
      <p>Nội dung trang</p>
    </RoleShell>
  );
  const router = createMemoryRouter(
    [
      { path: '/khu/*', element },
      { path: '/', element: <p>Trang chủ</p> },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return { router, logout };
}

const nav = () => screen.getByRole('navigation', { name: 'Menu chính' });

it('RS-01 KG-06 chỉ mục đang mở có aria-current="page", có mũi tên', () => {
  renderShell();
  const current = within(nav()).getByRole('link', {
    name: 'Hồ sơ người khám',
  });
  expect(current).toHaveAttribute('aria-current', 'page');
  // Biểu tượng của mục + mũi tên phải chỉ ở mục đang mở (Figma `416:112`)
  expect(current.querySelectorAll('svg')).toHaveLength(2);
  const other = within(nav()).getByRole('link', { name: 'Trang khác' });
  expect(other).not.toHaveAttribute('aria-current');
  expect(other.querySelectorAll('svg')).toHaveLength(1);
  // Mục gốc có `end` và "Về trang chủ" (`/`) không sáng ở trang con
  expect(
    within(nav()).getByRole('link', { name: 'Tổng quan' }),
  ).not.toHaveAttribute('aria-current');
  expect(
    screen.getByRole('link', { name: 'Về trang chủ' }),
  ).not.toHaveAttribute('aria-current');
});

it('RS-01b KG-06 ở đúng gốc khung thì mục `end` sáng, mục con không sáng', () => {
  renderShell({ path: '/khu' });
  expect(
    within(nav()).getByRole('link', { name: 'Tổng quan' }),
  ).toHaveAttribute('aria-current', 'page');
  expect(
    within(nav()).getByRole('link', { name: 'Hồ sơ người khám' }),
  ).not.toHaveAttribute('aria-current');
});

it('RS-02 KG-04 mục không có `to` là nút vô hiệu "Chưa được triển khai", bấm không điều hướng', () => {
  const { router } = renderShell();
  const button = within(nav()).getByRole('button', {
    name: /Lịch hẹn của tôi/,
  });
  expect(button).toBeDisabled();
  expect(button).toHaveAccessibleName(
    'Lịch hẹn của tôi (chưa được triển khai)',
  );
  expect(button).toHaveAttribute('title', 'Chưa được triển khai');
  expect(within(nav()).queryByRole('link', { name: /Lịch hẹn/ })).toBeNull();
  fireEvent.click(button);
  expect(router.state.location.pathname).toBe('/khu/ho-so');
});

it('RS-03 mục có `to` là liên kết đúng href; bấm thì đổi trang và đổi mục đang mở', async () => {
  const { router } = renderShell();
  const other = within(nav()).getByRole('link', { name: 'Trang khác' });
  expect(other).toHaveAttribute('href', '/khu/khac');
  fireEvent.click(other);
  await vi.waitFor(() =>
    expect(router.state.location.pathname).toBe('/khu/khac'),
  );
  expect(other).toHaveAttribute('aria-current', 'page');
  expect(
    within(nav()).getByRole('link', { name: 'Hồ sơ người khám' }),
  ).not.toHaveAttribute('aria-current');
});

it('RS-04 KG-09 landmark: thanh bên, menu, thanh trên, vùng nội dung; thẻ người dùng; logo về trang chủ', () => {
  renderShell();
  const aside = screen.getByRole('complementary', { name: 'Điều hướng Thử' });
  expect(within(aside).getByRole('navigation')).toBe(nav());
  expect(within(aside).getByText('Nguyễn Văn A')).toBeInTheDocument();
  expect(within(aside).getByText('Bệnh nhân')).toBeInTheDocument();
  expect(screen.getByRole('banner')).toBeInTheDocument();
  expect(screen.getByRole('main')).toHaveTextContent('Nội dung trang');
  expect(
    screen.getByRole('link', { name: 'CLINIX – Trang chủ' }),
  ).toHaveAttribute('href', '/');
});

it('RS-05 Q21b không có chuông, không có số đếm', () => {
  renderShell();
  expect(screen.queryByRole('button', { name: /Thông báo/ })).toBeDisabled();
  expect(screen.queryByRole('link', { name: /Thông báo/ })).toBeNull();
  expect(
    within(screen.getByRole('banner')).getAllByRole('button'),
  ).toHaveLength(1);
  expect(screen.queryByText(/^\d+$/)).toBeNull();
});

it('RS-06 KG-05 hai nút Đăng xuất cùng gọi onLogout; đang chờ thì khoá cả hai', () => {
  const { logout } = renderShell();
  const [sidebar, topbar] = screen.getAllByRole('button', {
    name: 'Đăng xuất',
  });
  expect(screen.getByRole('complementary')).toContainElement(sidebar);
  expect(screen.getByRole('banner')).toContainElement(topbar);
  fireEvent.click(sidebar);
  fireEvent.click(topbar);
  expect(logout.onLogout).toHaveBeenCalledTimes(2);
});

it('RS-06b KG-05 pending: cả hai nút Đăng xuất bị khoá', () => {
  renderShell({ logout: logoutOf({ pending: true }) });
  for (const button of screen.getAllByRole('button', { name: 'Đăng xuất' })) {
    expect(button).toBeDisabled();
  }
});

it('RS-07 KG-05 failed: câu lỗi role="alert" ở thanh bên kèm "Thử lại" gọi onLogout', () => {
  const { logout } = renderShell({ logout: logoutOf({ failed: true }) });
  const alert = screen.getByRole('alert');
  expect(alert).toHaveTextContent('Câu lỗi đăng xuất');
  expect(screen.getByRole('complementary')).toContainElement(alert);
  fireEvent.click(within(alert).getByRole('button', { name: 'Thử lại' }));
  expect(logout.onLogout).toHaveBeenCalledTimes(1);
});

it('RS-07b không failed thì không có hộp lỗi', () => {
  renderShell();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
});

it('RS-08 không có mục cuối (khung Lễ tân F2) thì không có "Về trang chủ", vẫn có Đăng xuất', () => {
  renderShell({ footerItems: [] });
  expect(screen.queryByRole('link', { name: 'Về trang chủ' })).toBeNull();
  expect(screen.getAllByRole('button', { name: 'Đăng xuất' })).toHaveLength(2);
});

it('RS-09 KG-09 thứ tự Tab theo Figma; mục vô hiệu không nhận focus; mọi nút có tên', () => {
  renderShell();
  const focusable = Array.from(
    document.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
  ).map((element) => element.textContent?.trim() || element.ariaLabel);
  expect(focusable).toEqual([
    'CLINIX',
    'Tổng quan',
    'Hồ sơ người khám',
    'Trang khác',
    'Về trang chủ',
    'Đăng xuất',
    'Đăng xuất',
  ]);
  for (const button of screen.getAllByRole('button')) {
    expect(button).toHaveAccessibleName();
  }
});
