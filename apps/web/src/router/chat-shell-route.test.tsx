import { render, screen, within } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { type AuthUser, type VaiTro } from '../features/auth';
import { resetAuthForTest } from '../features/auth/auth-session';
import { setAuthState } from '../features/auth/auth-store';
import {
  DOCTOR_CHAT_PATH,
  PATIENT_CHAT_PATH,
  RECEPTION_CHAT_PATH,
} from '../shared/routes/chat-paths';
import { createFakeAuthApi } from '../test/fake-auth-api';
import { createAppRoutes } from './routes';

// chat F1 `[ĐỤNG router]`: mục "Tin nhắn", số hội thoại chưa đọc và route trang Tin nhắn của ba khung qua router thật (WCH-01, WCH-02; đúng/sai vai trò theo
// AGENTS mục 4). Số lấy từ API giả (`chatUnreadCount` của fake auth). Mã ca CSR-nn là [đề xuất] (nếp NSR-nn của notification).
const SHELLS = [
  ['BenhNhan', PATIENT_CHAT_PATH, 'Điều hướng Bệnh nhân'],
  ['LeTan', RECEPTION_CHAT_PATH, 'Điều hướng Lễ tân'],
  ['BacSi', DOCTOR_CHAT_PATH, 'Điều hướng Bác sĩ'],
] as const;

let api: ReturnType<typeof createFakeAuthApi>;

function signedInAs(vaiTro: VaiTro) {
  const user: AuthUser = {
    vaiTro,
    hoTen: `Họ tên ${vaiTro}`,
    daXacMinhEmail: true,
  };
  setAuthState({ status: 'authenticated', user });
}

function renderAt(path: string) {
  const router = createMemoryRouter(createAppRoutes(), {
    initialEntries: [path],
  });
  render(<RouterProvider router={router} />);
  return router;
}

const chatUnreadCalls = () =>
  api.requests.filter(({ path }) => path === '/chat/unread-count');
const menuOf = (navLabel: string) =>
  within(
    within(screen.getByRole('complementary', { name: navLabel })).getByRole(
      'navigation',
      { name: 'Menu chính' },
    ),
  );

beforeEach(() => {
  resetAuthForTest();
  api = createFakeAuthApi();
  vi.stubGlobal('fetch', vi.fn(api.fetch));
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: undefined,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('chat F1 — mục "Tin nhắn" và route của ba khung', () => {
  it.each(SHELLS)(
    'WCH-01 WCH-02 CSR-01 %s mở %s: trang Tin nhắn trong khung; mục menu có `to`, sáng, có số và nhãn truy cập theo hội thoại; MỘT lời gọi số chưa đọc',
    async (vaiTro, path, navLabel) => {
      api.chatUnreadCount = 7;
      signedInAs(vaiTro);
      const router = renderAt(path);
      expect(
        await screen.findByRole('heading', { level: 1, name: 'Tin nhắn' }),
      ).toBeInTheDocument();
      expect(router.state.location.pathname).toBe(path);
      const item = await menuOf(navLabel).findByRole('link', {
        name: 'Tin nhắn, 7 hội thoại chưa đọc',
      });
      expect(item).toHaveAttribute('href', path);
      expect(item).toHaveAttribute('aria-current', 'page');
      expect(item).toHaveTextContent('7');
      expect(chatUnreadCalls()).toHaveLength(1);
    },
  );

  it('WCH-01 CSR-02 hơn 99 hội thoại ⇒ "99+" (nhãn truy cập vẫn số thật)', async () => {
    api.chatUnreadCount = 100;
    signedInAs('BacSi');
    renderAt(DOCTOR_CHAT_PATH);
    await screen.findByRole('heading', { level: 1, name: 'Tin nhắn' });
    const item = await menuOf('Điều hướng Bác sĩ').findByRole('link', {
      name: 'Tin nhắn, 100 hội thoại chưa đọc',
    });
    expect(item).toHaveTextContent('99+');
  });

  it('WCH-01 CSR-03 số 0 ⇒ mục không có số; mục vẫn là liên kết tới trang Tin nhắn', async () => {
    signedInAs('LeTan');
    renderAt(RECEPTION_CHAT_PATH);
    await screen.findByRole('heading', { level: 1, name: 'Tin nhắn' });
    const item = menuOf('Điều hướng Lễ tân').getByRole('link', {
      name: 'Tin nhắn',
    });
    expect(item).toHaveTextContent(/^Tin nhắn$/);
    expect(item).toHaveAttribute('href', RECEPTION_CHAT_PATH);
  });

  it('WCH-02 CSR-04 `?hoiThoai=` (liên kết từ thông báo) vào đúng trang Tin nhắn, không bị chuyển hướng', async () => {
    signedInAs('BenhNhan');
    const router = renderAt(`${PATIENT_CHAT_PATH}?hoiThoai=42`);
    await screen.findByRole('heading', { level: 1, name: 'Tin nhắn' });
    expect(router.state.location.search).toBe('?hoiThoai=42');
  });

  it.each([
    ['BenhNhan', RECEPTION_CHAT_PATH],
    ['BenhNhan', DOCTOR_CHAT_PATH],
    ['LeTan', PATIENT_CHAT_PATH],
    ['BacSi', RECEPTION_CHAT_PATH],
    ['QuanTriVien', PATIENT_CHAT_PATH],
  ] as const)(
    'WCH-02 CSR-05 %s mở %s (trang Tin nhắn của vai khác): 404, không khung, không thăm dò số tin nhắn',
    async (vaiTro, path) => {
      signedInAs(vaiTro);
      renderAt(path);
      expect(
        await screen.findByRole('heading', { name: 'Không tìm thấy trang' }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('complementary')).toBeNull();
      expect(chatUnreadCalls()).toHaveLength(0);
    },
  );

  it('WCH-02 CSR-06 Quản trị viên không có trang Tin nhắn (`/admin/tin-nhan` không phải route) và khung Admin không thăm dò số tin nhắn', async () => {
    signedInAs('QuanTriVien');
    renderAt('/admin/tin-nhan');
    expect(
      await screen.findByRole('heading', { name: 'Không tìm thấy trang' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { level: 1, name: 'Tin nhắn' }),
    ).toBeNull();
    expect(chatUnreadCalls()).toHaveLength(0);
  });
});
