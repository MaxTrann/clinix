import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { Bell, Calendar, House, LayoutDashboard, Users } from 'lucide-react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { fakeMatchMedia } from '../../test/fake-match-media';
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
  // `unmount` cho RS-19 (patient F11)
  const { unmount } = render(<RouterProvider router={router} />);
  return { router, logout, unmount };
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

// patient F11 (TRACKING F11-G): ngăn kéo màn hẹp. Các ca trên chạy ở chế độ rộng vì happy-dom mặc định rộng 1024px (F11-B);
// các ca dưới tự giả `matchMedia`. Mã ca RS-nn tiếp nối là [đề xuất]; mỗi ca ghi mã KG.
describe('màn hẹp (dưới 1024px)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.style.overflow = '';
  });

  const menuButton = () => screen.getByRole('button', { name: 'Mở menu' });
  // Cột chứa thanh trên và vùng nội dung: phần nền của ngăn kéo
  const content = () => screen.getByRole('banner').parentElement as HTMLElement;
  const drawerElement = () =>
    document.getElementById(
      menuButton().getAttribute('aria-controls') ?? '',
    ) as HTMLElement;
  const openDrawer = () => {
    fireEvent.click(menuButton());
    return screen.getByRole('dialog', { name: 'Điều hướng Thử' });
  };
  // Phần tử nhận Tab được thật sự: bỏ phần nằm trong vùng `hidden` hoặc `inert`
  const tabStops = () =>
    Array.from(
      document.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
    )
      .filter((element) => !element.closest('[hidden], [inert]'))
      .map(
        (element) =>
          element.textContent?.trim() || element.getAttribute('aria-label'),
      );
  const pressKey = (key: string, shiftKey = false) =>
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key,
      shiftKey,
    });

  it('RS-10 KG-08 từ 1024px là màn rộng: không có nút menu, không có ngăn kéo, không khoá cuộn', () => {
    fakeMatchMedia(1024);
    renderShell();
    expect(screen.queryByRole('button', { name: 'Mở menu' })).toBeNull();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    // Màn rộng giữ DOM của F1, F2: `aside` chỉ có tên và class, cột nội dung chỉ có class (thêm sau đột biến M28)
    expect(
      screen
        .getByRole('complementary', { name: 'Điều hướng Thử' })
        .getAttributeNames()
        .sort(),
    ).toEqual(['aria-label', 'class']);
    expect(content().getAttributeNames()).toEqual(['class']);
    expect(document.body.style.overflow).toBe('');
  });

  it('RS-11 KG-08 1023px, ngăn kéo đóng: thanh bên khỏi cây trợ năng và thứ tự Tab, có nút "Mở menu"', () => {
    fakeMatchMedia(1023);
    renderShell();
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(menuButton()).toHaveAttribute('aria-expanded', 'false');
    // `aria-controls` trỏ đúng phần tử ngăn kéo, có trong DOM nhưng `hidden`
    const drawer = drawerElement();
    expect(drawer).toHaveAttribute('role', 'dialog');
    expect(drawer).toHaveAttribute('hidden');
    expect(drawer).toHaveTextContent('Nguyễn Văn A');
    // Chỉ còn nút Đăng xuất ở thanh trên
    expect(screen.getAllByRole('button', { name: 'Đăng xuất' })).toHaveLength(
      1,
    );
    expect(tabStops()).toEqual(['Mở menu', 'Đăng xuất']);
    expect(content()).not.toHaveAttribute('inert');
    expect(document.body.style.overflow).toBe('');
  });

  it('RS-12 KG-08 bấm "Mở menu": hộp thoại modal tên theo navLabel, focus vào "Đóng menu", nền inert, khoá cuộn', () => {
    fakeMatchMedia(390);
    renderShell();
    const dialog = openDrawer();
    expect(dialog).toBe(drawerElement());
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).not.toHaveAttribute('hidden');
    expect(menuButton()).toHaveAttribute('aria-expanded', 'true');
    expect(document.activeElement).toBe(
      within(dialog).getByRole('button', { name: 'Đóng menu' }),
    );
    expect(within(dialog).getByText('Nguyễn Văn A')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('navigation', { name: 'Menu chính' }),
    ).toBeInTheDocument();
    expect(content()).toHaveAttribute('inert');
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('RS-13 KG-08 Esc đóng, trả focus về nút mở, bỏ inert, trả đúng kiểu cuộn cũ', () => {
    fakeMatchMedia(390);
    document.body.style.overflow = 'scroll';
    renderShell();
    openDrawer();
    pressKey('Escape');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(drawerElement()).toHaveAttribute('hidden');
    expect(menuButton()).toHaveAttribute('aria-expanded', 'false');
    expect(document.activeElement).toBe(menuButton());
    expect(content()).not.toHaveAttribute('inert');
    expect(document.body.style.overflow).toBe('scroll');
  });

  it('RS-14 KG-08 nút "Đóng menu" đóng và trả focus', () => {
    fakeMatchMedia(390);
    renderShell();
    const dialog = openDrawer();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Đóng menu' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(menuButton());
    expect(document.body.style.overflow).toBe('');
  });

  it('RS-15 KG-08 bấm nền mờ thì đóng; bấm trong ngăn kéo thì không', () => {
    fakeMatchMedia(390);
    renderShell();
    const dialog = openDrawer();
    fireEvent.click(within(dialog).getByText('Nguyễn Văn A'));
    expect(screen.getByRole('dialog')).toBe(dialog);
    const backdrop = dialog.previousElementSibling as HTMLElement;
    expect(backdrop).toHaveAttribute('aria-hidden', 'true');
    fireEvent.click(backdrop);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(dialog.previousElementSibling).toBeNull();
  });

  it('RS-16 KG-08 KG-09 bẫy focus: thứ tự Tab trong ngăn kéo, Tab ở cuối về đầu, Shift+Tab ở đầu về cuối, focus ở ngoài thì kéo vào', () => {
    fakeMatchMedia(390);
    renderShell();
    const dialog = openDrawer();
    expect(tabStops()).toEqual([
      'CLINIX',
      'Đóng menu',
      'Tổng quan',
      'Hồ sơ người khám',
      'Trang khác',
      'Về trang chủ',
      'Đăng xuất',
    ]);
    const logo = within(dialog).getByRole('link', {
      name: 'CLINIX – Trang chủ',
    });
    const logoutInDrawer = within(dialog).getByRole('button', {
      name: 'Đăng xuất',
    });
    logoutInDrawer.focus();
    expect(pressKey('Tab')).toBe(false);
    expect(document.activeElement).toBe(logo);
    expect(pressKey('Tab', true)).toBe(false);
    expect(document.activeElement).toBe(logoutInDrawer);
    // Ở giữa danh sách: để trình duyệt tự chuyển (không chặn)
    within(dialog).getByRole('link', { name: 'Trang khác' }).focus();
    expect(pressKey('Tab')).toBe(true);
    (document.activeElement as HTMLElement).blur();
    expect(pressKey('Tab')).toBe(false);
    expect(document.activeElement).toBe(logo);
    (document.activeElement as HTMLElement).blur();
    expect(pressKey('Tab', true)).toBe(false);
    expect(document.activeElement).toBe(logoutInDrawer);
  });

  it('RS-17 KG-08 chọn mục có `to` thì đổi trang và đóng (kể cả mục đang mở); mục vô hiệu không đóng, không đổi trang', async () => {
    fakeMatchMedia(390);
    const { router } = renderShell();
    let dialog = openDrawer();
    fireEvent.click(within(dialog).getByRole('link', { name: 'Trang khác' }));
    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe('/khu/khac'),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(menuButton());

    dialog = openDrawer();
    fireEvent.click(within(dialog).getByRole('link', { name: 'Trang khác' }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(router.state.location.pathname).toBe('/khu/khac');

    dialog = openDrawer();
    fireEvent.click(
      within(dialog).getByRole('button', { name: /Lịch hẹn của tôi/ }),
    );
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(router.state.location.pathname).toBe('/khu/khac');
  });

  it('RS-17b KG-08 mở ở A, chọn mục sang B, bấm Back về A: ngăn kéo vẫn đóng (khoá cũ không mở lại)', async () => {
    fakeMatchMedia(390);
    const { router } = renderShell();
    fireEvent.click(
      within(openDrawer()).getByRole('link', { name: 'Trang khác' }),
    );
    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe('/khu/khac'),
    );
    await act(async () => {
      await router.navigate(-1);
    });
    expect(router.state.location.pathname).toBe('/khu/ho-so');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(menuButton()).toHaveAttribute('aria-expanded', 'false');
    expect(document.body.style.overflow).toBe('');
  });

  it('RS-18 KG-08 đang mở mà kéo sang màn rộng: đóng, về thanh bên, nhả khoá; thu hẹp lại không tự mở', () => {
    const media = fakeMatchMedia(390);
    document.body.style.overflow = 'scroll';
    renderShell();
    openDrawer();
    act(() => media.resize(1440));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(
      screen.getByRole('complementary', { name: 'Điều hướng Thử' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mở menu' })).toBeNull();
    expect(content()).not.toHaveAttribute('inert');
    expect(document.body.style.overflow).toBe('scroll');
    act(() => media.resize(390));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(menuButton()).toHaveAttribute('aria-expanded', 'false');
    expect(document.body.style.overflow).toBe('scroll');
  });

  it('RS-19 KG-08 gỡ khung khi đang mở (đăng xuất thành công): nhả khoá cuộn, gỡ bộ nghe phím', () => {
    const media = fakeMatchMedia(390);
    document.body.style.overflow = 'scroll';
    const { unmount } = renderShell();
    openDrawer();
    unmount();
    expect(document.body.style.overflow).toBe('scroll');
    expect(media.listenerCount()).toBe(0);
    // true = không ai gọi preventDefault: bộ nghe phím đã gỡ
    expect(fireEvent.keyDown(document.body, { key: 'Escape' })).toBe(true);
  });

  it('RS-20 KG-05 F11-E lỗi đăng xuất khi ngăn kéo đóng: dải lỗi dưới thanh trên; mở ngăn kéo thì hộp về ngăn kéo; luôn một hộp', () => {
    fakeMatchMedia(390);
    const { logout } = renderShell({ logout: logoutOf({ failed: true }) });
    const strip = screen.getByRole('alert');
    expect(strip).toHaveTextContent('Câu lỗi đăng xuất');
    expect(content()).toContainElement(strip);
    expect(strip.closest('[hidden]')).toBeNull();
    expect(document.querySelectorAll('[role="alert"]')).toHaveLength(1);
    fireEvent.click(within(strip).getByRole('button', { name: 'Thử lại' }));
    expect(logout.onLogout).toHaveBeenCalledTimes(1);

    const dialog = openDrawer();
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'Câu lỗi đăng xuất',
    );
    expect(document.querySelectorAll('[role="alert"]')).toHaveLength(1);
    pressKey('Escape');
    expect(content()).toContainElement(screen.getByRole('alert'));
    expect(document.querySelectorAll('[role="alert"]')).toHaveLength(1);
  });

  it('RS-21 KG-05 đang chờ đăng xuất: nút trong ngăn kéo và nút thanh trên đều khoá', () => {
    fakeMatchMedia(390);
    renderShell({ logout: logoutOf({ pending: true }) });
    openDrawer();
    const buttons = screen.getAllByRole('button', { name: 'Đăng xuất' });
    expect(buttons).toHaveLength(2);
    for (const button of buttons) expect(button).toBeDisabled();
  });

  it('RS-21b KG-08 KG-09 đang chờ đăng xuất: nút Đăng xuất bị khoá không tính vào bẫy focus, Tab ở mục cuối còn nhận focus thì về logo', () => {
    fakeMatchMedia(390);
    renderShell({ logout: logoutOf({ pending: true }) });
    const dialog = openDrawer();
    const lastStop = within(dialog).getByRole('link', { name: 'Về trang chủ' });
    lastStop.focus();
    expect(pressKey('Tab')).toBe(false);
    expect(document.activeElement).toBe(
      within(dialog).getByRole('link', { name: 'CLINIX – Trang chủ' }),
    );
    expect(pressKey('Tab', true)).toBe(false);
    expect(document.activeElement).toBe(lastStop);
  });
});
