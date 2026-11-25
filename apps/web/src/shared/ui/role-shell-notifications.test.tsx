import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { Bell, Calendar, Users } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { fakeMatchMedia } from '../../test/fake-match-media';
import {
  RoleShell,
  type RoleNavItem,
  type RoleShellNotifications,
} from './role-shell';
import { unreadBadgeText, unreadLabel } from './unread-badge';

// notification F1 (PLAN 5.10, TECH_DEBT 62): chuông và số đếm của RoleShell khi nơi dùng truyền `notifications`. Khung không truyền prop giữ nguyên như cũ
// (RS-05 ở role-shell.test.tsx không đổi). Mã ca RSN-nn là [đề xuất]; mỗi ca ghi mã WTB của PLAN mục 7.10.
const ITEMS: RoleNavItem[] = [
  { label: 'Lịch hẹn', icon: Calendar, to: '/khu/lich-hen' },
  {
    label: 'Thông báo',
    icon: Bell,
    to: '/khu/thong-bao',
    badge: 'notifications',
  },
  { label: 'Hồ sơ', icon: Users, to: '/khu/ho-so' },
];

// Giá trị `notifications` hiện tại; đổi qua `update` mà không dựng lại router (như router thăm dò rồi truyền số mới)
let current: RoleShellNotifications | undefined;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

function Harness() {
  const notifications = useSyncExternalStore(subscribe, () => current);
  return (
    <RoleShell
      navLabel="Điều hướng Thử"
      userName="Nguyễn Văn A"
      userSubtitle="Bệnh nhân"
      items={ITEMS}
      notifications={notifications}
      logout={{
        onLogout: vi.fn(),
        pending: false,
        failed: false,
        failedMessage: 'x',
      }}
    >
      <p>Nội dung trang</p>
    </RoleShell>
  );
}

function renderShell(
  notifications: RoleShellNotifications | undefined,
  path = '/khu/lich-hen',
) {
  current = notifications;
  const router = createMemoryRouter(
    [{ path: '/khu/*', element: <Harness /> }],
    {
      initialEntries: [path],
    },
  );
  render(<RouterProvider router={router} />);
  const update = (next: RoleShellNotifications) => {
    current = next;
    for (const listener of listeners) listener();
  };
  return { router, update };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const of = (unread: number, announce = false): RoleShellNotifications => ({
  unread,
  announce,
  to: '/khu/thong-bao',
});
const banner = () => screen.getByRole('banner');
const menu = () => screen.getByRole('navigation', { name: 'Menu chính' });

describe('số trên chuông (hàm thuần)', () => {
  it('WTB-01 RSN-01 ẩn khi 0 (và âm), đúng số tới 99, `99+` khi quá 99; tên truy cập kèm số', () => {
    expect(unreadBadgeText(0)).toBeNull();
    expect(unreadBadgeText(-3)).toBeNull();
    expect(unreadBadgeText(1)).toBe('1');
    expect(unreadBadgeText(99)).toBe('99');
    expect(unreadBadgeText(100)).toBe('99+');
    expect(unreadBadgeText(12345)).toBe('99+');
    expect(unreadLabel(0)).toBe('Thông báo, 0 chưa đọc');
    expect(unreadLabel(150)).toBe('Thông báo, 150 chưa đọc');
  });
});

describe('chuông ở thanh trên', () => {
  it('WTB-01 RSN-02 chuông là LIÊN KẾT tới trang Thông báo (không phải nút, không hộp thả xuống), tên "Thông báo, N chưa đọc", hiện số', () => {
    renderShell(of(7));
    const bell = within(banner()).getByRole('link', {
      name: 'Thông báo, 7 chưa đọc',
    });
    expect(bell).toHaveAttribute('href', '/khu/thong-bao');
    expect(bell).toHaveTextContent('7');
    expect(bell).not.toHaveAttribute('aria-haspopup');
    // Thanh trên vẫn chỉ một nút (Đăng xuất): chuông không phải nút
    expect(within(banner()).getAllByRole('button')).toHaveLength(1);
  });

  it('WTB-01 RSN-03 số 0 ⇒ chuông vẫn có, không hiện chữ số; quá 99 ⇒ `99+`, tên truy cập vẫn đọc số thật', () => {
    const { update } = renderShell(of(0));
    const bell = within(banner()).getByRole('link', {
      name: 'Thông báo, 0 chưa đọc',
    });
    expect(bell.textContent).toBe('');
    act(() => update(of(250)));
    const big = within(banner()).getByRole('link', {
      name: 'Thông báo, 250 chưa đọc',
    });
    expect(big).toHaveTextContent('99+');
  });

  it('WTB-01 RSN-04 bấm chuông ⇒ sang trang Thông báo', async () => {
    const { router } = renderShell(of(2));
    await act(async () => {
      fireEvent.click(
        within(banner()).getByRole('link', { name: /^Thông báo/ }),
      );
    });
    expect(router.state.location.pathname).toBe('/khu/thong-bao');
  });

  it('WTB-01 RSN-05 màn hẹp (390px): chuông vẫn ở thanh trên, cạnh nút Đăng xuất', () => {
    fakeMatchMedia(390);
    renderShell(of(4));
    expect(
      within(banner()).getByRole('link', { name: 'Thông báo, 4 chưa đọc' }),
    ).toBeInTheDocument();
    expect(
      within(banner()).getByRole('button', { name: 'Mở menu' }),
    ).toBeInTheDocument();
  });

  it('RSN-06 không truyền `notifications` ⇒ không chuông, không vùng live, mục menu không có số (khung cũ)', () => {
    renderShell(undefined);
    expect(within(banner()).queryByRole('link')).toBeNull();
    expect(document.querySelector('[aria-live]')).toBeNull();
    expect(
      within(menu()).getByRole('link', { name: 'Thông báo' }),
    ).toHaveTextContent(/^Thông báo$/);
  });
});

describe('số trên mục menu "Thông báo"', () => {
  it('WTB-05 RSN-07 chỉ mục có `badge` hiện số; tên của liên kết đọc "Thông báo, N chưa đọc"; số 0 thì không có số', () => {
    const { update } = renderShell(of(12));
    const item = within(menu()).getByRole('link', {
      name: 'Thông báo, 12 chưa đọc',
    });
    expect(item).toHaveAttribute('href', '/khu/thong-bao');
    expect(
      within(menu()).getByRole('link', { name: 'Lịch hẹn' }),
    ).toHaveTextContent(/^Lịch hẹn$/);
    act(() => update(of(0)));
    expect(
      within(menu()).getByRole('link', { name: 'Thông báo' }),
    ).toHaveTextContent(/^Thông báo$/);
    act(() => update(of(100)));
    expect(
      within(menu()).getByRole('link', { name: /^Thông báo/ }),
    ).toHaveTextContent('99+');
  });

  it('WTB-05 RSN-08 mục "Thông báo" đang mở: vẫn có số và mũi tên, sáng (`aria-current`)', () => {
    renderShell(of(3), '/khu/thong-bao');
    const item = within(menu()).getByRole('link', { name: /^Thông báo/ });
    expect(item).toHaveAttribute('aria-current', 'page');
    expect(item).toHaveTextContent('3');
    // Biểu tượng mục + mũi tên
    expect(item.querySelectorAll('svg')).toHaveLength(2);
  });
});

describe('vùng đọc khi có thông báo mới', () => {
  it('WTB-03 RSN-09 một vùng `aria-live="polite"`, rỗng khi không tăng; `announce` ⇒ "Bạn có thông báo mới"; hết tăng ⇒ rỗng lại', () => {
    const { update } = renderShell(of(1));
    const regions = document.querySelectorAll('[aria-live]');
    expect(regions).toHaveLength(1);
    const region = regions[0]!;
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region.textContent).toBe('');
    act(() => update(of(2, true)));
    expect(region.textContent).toBe('Bạn có thông báo mới');
    act(() => update(of(1)));
    expect(region.textContent).toBe('');
  });
});
