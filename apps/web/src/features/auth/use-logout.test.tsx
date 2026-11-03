import { act, fireEvent, render, screen } from '@testing-library/react';
import {
  apiError,
  createFakeAuthApi,
  createFakeLocks,
} from '../../test/fake-auth-api';
import { login, resetAuthForTest } from './auth-session';
import { getAuthState } from './auth-store';
import { LOGOUT_FAILED_MESSAGE, useLogout } from './index';

// Task F5 (TRACKING auth F5-F). Mã ca LO-nn là [đề xuất]; ca phủ test case của PLAN ghi kèm mã đó.
let api: ReturnType<typeof createFakeAuthApi>;

// Một nút Đăng xuất tối giản như các khung sẽ dựng
function Probe() {
  const { run, pending, failed } = useLogout();
  return (
    <div>
      <button type="button" disabled={pending} onClick={() => void run()}>
        Đăng xuất
      </button>
      <span data-testid="pending">{String(pending)}</span>
      {failed && <p role="alert">{LOGOUT_FAILED_MESSAGE}</p>}
    </div>
  );
}

const button = () => screen.getByRole('button', { name: 'Đăng xuất' });
const pendingText = () => screen.getByTestId('pending').textContent;

beforeEach(async () => {
  resetAuthForTest();
  api = createFakeAuthApi();
  vi.stubGlobal('fetch', vi.fn(api.fetch));
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: createFakeLocks(),
  });
  await login('a@example.invalid', 'mat-khau');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('LO-01 DX-08 G5 bấm là đăng xuất ngay, không hộp xác nhận; đang chờ thì khoá nút', async () => {
  const confirmSpy = vi.fn(() => true);
  vi.stubGlobal('confirm', confirmSpy);
  const release = api.hold('/auth/logout');
  render(<Probe />);
  fireEvent.click(button());
  expect(pendingText()).toBe('true');
  expect(button()).toBeDisabled();
  await vi.waitFor(() => expect(api.logoutCalls).toBe(1));
  await act(async () => {
    release(204, null);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(confirmSpy).not.toHaveBeenCalled();
  expect(getAuthState().status).toBe('unauthenticated');
  expect(pendingText()).toBe('false');
});

it('LO-02 lỗi: câu G5, giữ đăng nhập, mở lại nút để thử lại', async () => {
  api.failNext('/auth/logout', () => apiError(500, 'LOI_HE_THONG'));
  render(<Probe />);
  fireEvent.click(button());
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Không đăng xuất được, vui lòng thử lại',
  );
  expect(button()).toBeEnabled();
  expect(getAuthState().status).toBe('authenticated');
});

it('LO-03 thử lại sau lỗi: ẩn câu lỗi trong lúc chờ, thành công thì đăng xuất', async () => {
  api.failNext('/auth/logout', () => Promise.reject(new TypeError('net')));
  render(<Probe />);
  fireEvent.click(button());
  await screen.findByRole('alert');
  const release = api.hold('/auth/logout');
  fireEvent.click(button());
  expect(screen.queryByRole('alert')).toBeNull();
  await vi.waitFor(() => expect(api.logoutCalls).toBe(2));
  await act(async () => {
    release(204, null);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(getAuthState().status).toBe('unauthenticated');
});

it('LO-04 hai nút (thanh bên + thanh trên) bấm cùng lúc: một request', async () => {
  const release = api.hold('/auth/logout');
  render(
    <>
      <Probe />
      <Probe />
    </>,
  );
  for (const each of screen.getAllByRole('button', { name: 'Đăng xuất' })) {
    fireEvent.click(each);
  }
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    release(204, null);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(api.logoutCalls).toBe(1);
});

it('LO-05 gỡ khung lúc đang chờ (lỗi về sau): không lỗi, không cảnh báo', async () => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  const release = api.hold('/auth/logout');
  const view = render(<Probe />);
  fireEvent.click(button());
  await vi.waitFor(() => expect(api.logoutCalls).toBe(1));
  view.unmount();
  await act(async () => {
    release(500, { maLoi: 'LOI_HE_THONG', thongBao: 'x' });
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(errors).not.toHaveBeenCalled();
  expect(getAuthState().status).toBe('authenticated');
});
