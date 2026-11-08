import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { fakeMatchMedia } from '../../../test/fake-match-media';
import { BranchPicker } from './branch-picker';
import { PublicShell } from './public-shell';

afterEach(() => vi.unstubAllGlobals());

function setup(width = 390, loggedIn = false) {
  const media = fakeMatchMedia(width);
  const select = vi.fn();
  const logout = vi.fn();
  const router = createMemoryRouter([
    {
      path: '*',
      element: (
        <PublicShell
          navItems={[
            { label: 'Trang chủ', to: '/', end: true },
            { label: 'Bác sĩ', to: '/bac-si' },
            { label: 'Dịch vụ', hasMenu: true, to: '/dich-vu-kham' },
            { label: 'Liên hệ' },
          ]}
          serviceGroups={[
            { id: '1', label: 'Khám tổng quát', to: '/dich-vu-kham/1' },
          ]}
          bookingItem={{ label: 'Đặt lịch khám', to: '/dich-vu-kham' }}
          loginPath="/dang-nhap"
          user={
            loggedIn
              ? {
                  name: 'Người mẫu',
                  homePath: '/benh-nhan',
                  logout: {
                    onLogout: logout,
                    pending: false,
                    failed: false,
                    failedMessage: 'Thử lại',
                  },
                }
              : null
          }
          branchPicker={
            <BranchPicker
              branches={[]}
              loaded
              selectedId={null}
              locating={false}
              notice={null}
              canLocate
              onSelect={select}
              onLocate={vi.fn()}
              allBranchesTo="/chi-nhanh"
            />
          }
        >
          <main>
            <button>Nội dung trang</button>
          </main>
          <footer>Chân trang</footer>
        </PublicShell>
      ),
    },
  ]);
  const view = render(<RouterProvider router={router} />);
  const open = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Mở menu' }));
    return screen.getByRole('dialog');
  };
  return { media, router, open, select, logout, ...view };
}

it('KC-08: 1024px có điều hướng đầy đủ; 1023px thu thành nút menu', () => {
  const { media } = setup(1024);
  expect(screen.getByRole('navigation')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Mở menu' })).toBeNull();
  act(() => media.resize(1023));
  expect(screen.queryByRole('navigation')).toBeNull();
  expect(screen.getByRole('button', { name: 'Mở menu' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
});

it('KC-08/KC-09: focus đầu, bẫy Tab hai chiều, nền inert, Esc trả focus và nhả cuộn', () => {
  const { open } = setup();
  document.body.style.overflow = 'auto';
  const trigger = screen.getByRole('button', { name: 'Mở menu' });
  const dialog = open();
  const close = within(dialog).getByRole('button', { name: 'Đóng menu' });
  const last = within(dialog).getByRole('link', { name: 'Đăng nhập' });
  expect(close).toHaveFocus();
  expect(screen.getByRole('main').closest('[inert]')).not.toBeNull();
  expect(screen.getByRole('banner').closest('[inert]')).not.toBeNull();
  expect(document.body.style.overflow).toBe('hidden');
  fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
  expect(last).toHaveFocus();
  fireEvent.keyDown(last, { key: 'Tab' });
  expect(close).toHaveFocus();
  fireEvent.keyDown(close, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(trigger).toHaveFocus();
  expect(document.body.style.overflow).toBe('auto');
  document.body.style.overflow = '';
});

it('KC-08: chọn chi nhánh giữ ngăn kéo, chọn liên kết chi nhánh đóng', async () => {
  const { open, select, router } = setup();
  const dialog = open();
  fireEvent.click(
    within(dialog).getByRole('button', { name: /Chi nhánh đang chọn/ }),
  );
  fireEvent.click(within(dialog).getByRole('button', { name: 'Toàn quốc' }));
  expect(select).toHaveBeenCalledWith(null);
  expect(dialog).toBeInTheDocument();
  fireEvent.click(
    within(dialog).getByRole('button', { name: /Chi nhánh đang chọn/ }),
  );
  await act(async () =>
    fireEvent.click(
      within(dialog).getByRole('link', { name: 'Xem tất cả chi nhánh' }),
    ),
  );
  expect(router.state.location.pathname).toBe('/chi-nhanh');
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('KC-01/KC-08: chọn lại trang hiện tại đóng; mục vô hiệu giữ nguyên; nhóm dịch vụ điều hướng và đóng', async () => {
  const { open, router } = setup();
  let dialog = open();
  expect(
    within(dialog).getByRole('button', { name: /Liên hệ/ }),
  ).toBeDisabled();
  expect(
    within(dialog).getByRole('link', { name: 'Trang chủ' }),
  ).toHaveAttribute('aria-current', 'page');
  await act(async () =>
    fireEvent.click(within(dialog).getByRole('link', { name: 'Trang chủ' })),
  );
  expect(screen.queryByRole('dialog')).toBeNull();
  dialog = open();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Dịch vụ' }));
  await act(async () =>
    fireEvent.click(
      within(dialog).getByRole('link', { name: 'Khám tổng quát' }),
    ),
  );
  expect(router.state.location.pathname).toBe('/dich-vu-kham/1');
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('KC-08: đổi route, mở rộng rồi thu hẹp và unmount đều nhả modal, không tự mở lại', async () => {
  const { open, media, router, unmount } = setup();
  open();
  await act(async () => router.navigate('/bac-si'));
  expect(screen.queryByRole('dialog')).toBeNull();
  open();
  act(() => media.resize(1024));
  expect(document.body.style.overflow).toBe('');
  act(() => media.resize(320));
  expect(screen.queryByRole('dialog')).toBeNull();
  open();
  unmount();
  expect(document.body.style.overflow).toBe('');
});

it('KC-02/KC-08: menu tài khoản trong ngăn kéo dùng callback đăng xuất chung', () => {
  const { open, logout } = setup(390, true);
  const dialog = open();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Người mẫu' }));
  expect(
    within(dialog).getByRole('link', { name: 'Trang của tôi' }),
  ).toHaveAttribute('href', '/benh-nhan');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Đăng xuất' }));
  expect(logout).toHaveBeenCalledTimes(1);
});
