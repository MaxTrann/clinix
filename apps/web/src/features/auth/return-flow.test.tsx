import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { createAppRoutes } from '../../router/routes';
import { createFakeAuthApi } from '../../test/fake-auth-api';
import { createFakeBookingApi } from '../booking/testing/fake-booking-api';
import { createFakeProfileApi } from '../patient/testing/fake-profile-api';
import { resetAuthForTest } from './auth-session';
import { setAuthState } from './auth-store';
import { LOGIN_PATH, type VaiTro } from './roles';

// booking F3 (`[ĐỤNG auth]`, Q39, M10): đăng nhập rồi quay lại đúng URL. Mã ca BRT-06…BRT-10 là [đề xuất] (PLAN booking mục 7.27).
// Đi qua cả ứng dụng (`createAppRoutes`) với API giả; test auth cũ của các trang không đổi.
const BOOKING_URL = '/dat-lich/thong-tin?khungGioId=5';

let auth: ReturnType<typeof createFakeAuthApi>;
let booking: ReturnType<typeof createFakeBookingApi>;

function useApi(vaiTro: VaiTro = 'BenhNhan') {
  auth = createFakeAuthApi({
    vaiTro,
    hoTen: 'Người mẫu',
    daXacMinhEmail: true,
  });
  // Khung công khai gọi /public/* khi gắn: trả 500 để không đi ra mạng thật (chân trang chịu được lỗi)
  const profile = createFakeProfileApi(auth.fetch);
  booking = createFakeBookingApi(profile.fetch);
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      String(input).includes('/public/')
        ? Promise.resolve(new Response('{}', { status: 500 }))
        : booking.fetch(input, init),
    ),
  );
}

function renderAt(entries: Parameters<typeof createMemoryRouter>[1]) {
  const router = createMemoryRouter(createAppRoutes(), entries);
  render(<RouterProvider router={router} />);
  return router;
}

const here = (router: ReturnType<typeof renderAt>) => {
  const { pathname, search, hash } = router.state.location;
  return pathname + search + hash;
};
const bookingBody = () => screen.findByTestId('booking-step-4-body');

// Trang chủ của vai là route lazy: đợi nó dựng xong (Bệnh nhân còn gọi GET /api/profile) để lời gọi chạy khi fetch giả còn gắn,
// nếu không test kết thúc, gỡ fetch giả rồi lời gọi đi ra localhost thật (cùng lý do với login-page.test).
async function findRoleHome(vaiTro: 'BenhNhan' | 'LeTan') {
  await screen.findByRole('complementary', {
    name: vaiTro === 'BenhNhan' ? 'Điều hướng Bệnh nhân' : 'Điều hướng Lễ tân',
  });
  if (vaiTro === 'BenhNhan') {
    await screen.findByRole('button', { name: 'Chỉnh sửa' });
  }
}

async function logIn(email = 'a@b.vn') {
  fireEvent.change(await screen.findByLabelText('Email'), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText('Mật khẩu'), {
    target: { value: 'Matkhau@1' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
}

beforeEach(() => {
  resetAuthForTest();
  setAuthState({ status: 'unauthenticated' });
  useApi();
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: undefined,
  });
});

afterEach(() => {
  resetAuthForTest();
  vi.unstubAllGlobals();
});

describe('booking F3 — quay lại đúng URL sau đăng nhập', () => {
  it('BRT-06 RequireAuth chưa đăng nhập ⇒ /dang-nhap với state.from đủ đường dẫn, query, hash; thay mục lịch sử', async () => {
    const router = renderAt({
      initialEntries: ['/', `${BOOKING_URL}#x`],
      initialIndex: 1,
    });
    await screen.findByRole('heading', { name: 'Đăng nhập' });
    expect(router.state.location.pathname).toBe(LOGIN_PATH);
    expect(router.state.location.state).toEqual({ from: `${BOOKING_URL}#x` });
    expect(router.state.historyAction).toBe('REPLACE');
    // Chưa đăng nhập thì cổng chặn TRƯỚC khi tới wizard: không gọi `eligibility`
    expect(booking.count('GET', '/booking/eligibility')).toBe(0);
  });

  it('BRT-07, WZ-08 đăng nhập Bệnh nhân ⇒ về đúng from (cả query), không giữ chỗ; Back không rơi lại trang đăng nhập', async () => {
    const router = renderAt({
      initialEntries: ['/', BOOKING_URL],
      initialIndex: 1,
    });
    await logIn();
    const body = await bookingBody();
    expect(body).toHaveAttribute('data-reference', '5');
    expect(here(router)).toBe(BOOKING_URL);
    // WZ-08: sau khi quay lại chỉ có một lời gọi booking là GET cổng, KHÔNG giữ chỗ
    expect(booking.count('GET', '/booking/eligibility')).toBe(1);
    expect(booking.bookingWrites()).toEqual([]);

    // `replace` ở cả hai bước chuyển hướng: lùi một bước là về trang trước đó, không phải /dang-nhap
    await act(async () => {
      await router.navigate(-1);
    });
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('BRT-08 from thù địch hay sai vai ⇒ trang chủ của vai (hành vi cũ); không có from ⇒ trang chủ của vai', async () => {
    // from thù địch đặt thẳng vào state
    const router = renderAt({
      initialEntries: [{ pathname: LOGIN_PATH, state: { from: '//evil.com' } }],
    });
    await logIn();
    await findRoleHome('BenhNhan');
    expect(router.state.location.pathname.startsWith('/benh-nhan')).toBe(true);
    expect(here(router)).not.toContain('evil');
  });

  it('BRT-08 vai Lễ tân có from hợp lệ vẫn về trang chủ Lễ tân', async () => {
    useApi('LeTan');
    const router = renderAt({
      initialEntries: [{ pathname: LOGIN_PATH, state: { from: BOOKING_URL } }],
    });
    await logIn();
    await findRoleHome('LeTan');
    expect(router.state.location.pathname.startsWith('/le-tan')).toBe(true);
    expect(booking.count('GET', '/booking/eligibility')).toBe(0);
  });

  it('BRT-08 đăng nhập không có from ⇒ trang chủ của Bệnh nhân như trước', async () => {
    const router = renderAt({ initialEntries: [LOGIN_PATH] });
    await logIn();
    await findRoleHome('BenhNhan');
    expect(router.state.location.pathname.startsWith('/benh-nhan')).toBe(true);
  });

  it('BRT-09 from sống qua đăng nhập → đăng ký → xác minh OTP → đăng nhập → về đúng URL', async () => {
    const router = renderAt({
      initialEntries: ['/', BOOKING_URL],
      initialIndex: 1,
    });
    // 1) bị chuyển tới đăng nhập, bấm "Đăng ký ngay"
    fireEvent.click(await screen.findByRole('link', { name: 'Đăng ký ngay' }));
    await screen.findByRole('heading', { name: 'Tạo tài khoản' });
    expect(router.state.location.state).toEqual({ from: BOOKING_URL });

    // 2) đăng ký
    const field = (label: string) =>
      screen.getByLabelText<HTMLInputElement>(label, { exact: true });
    fireEvent.change(field('Họ và tên'), { target: { value: 'Nguyễn Văn A' } });
    fireEvent.change(field('Email'), { target: { value: 'a@b.vn' } });
    fireEvent.change(field('Số điện thoại'), {
      target: { value: '0901234567' },
    });
    fireEvent.change(field('Mật khẩu'), { target: { value: 'Matkhau@1' } });
    fireEvent.change(field('Xác nhận mật khẩu'), {
      target: { value: 'Matkhau@1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));

    // 3) nhập mã OTP ngay trên trang (không có liên kết trong thư nên không rời SPA)
    await screen.findByRole('heading', { name: 'Xác minh email' });
    expect(router.state.location.state).toMatchObject({ from: BOOKING_URL });
    fireEvent.paste(screen.getByLabelText('Chữ số thứ 1 trong 6'), {
      clipboardData: { getData: () => '012345' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Xác minh' }));
    await screen.findByRole('heading', { name: 'Xác minh thành công' });
    expect(router.state.location.state).toMatchObject({ from: BOOKING_URL });

    // 4) về đăng nhập (email điền sẵn), đăng nhập ⇒ đúng URL ban đầu
    fireEvent.click(screen.getByRole('link', { name: /Đăng nhập/ }));
    await screen.findByRole('heading', { name: 'Đăng nhập' });
    expect(screen.getByLabelText<HTMLInputElement>('Email').value).toBe(
      'a@b.vn',
    );
    fireEvent.change(screen.getByLabelText('Mật khẩu'), {
      target: { value: 'Matkhau@1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    await bookingBody();
    expect(here(router)).toBe(BOOKING_URL);
  });

  it('BRT-10 đã đăng nhập mà mở đăng ký, xác minh hay quên mật khẩu ⇒ trang chủ của vai như trước; quên mật khẩu không chuyển tiếp from', async () => {
    setAuthState({
      status: 'authenticated',
      user: { vaiTro: 'BenhNhan', hoTen: 'Người mẫu', daXacMinhEmail: true },
    });
    for (const path of ['/dang-ky', '/dang-ky/xac-minh', '/quen-mat-khau']) {
      const state = { from: BOOKING_URL };
      const router = renderAt({ initialEntries: [{ pathname: path, state }] });
      await findRoleHome('BenhNhan');
      expect(router.state.location.pathname.startsWith('/benh-nhan')).toBe(
        true,
      );
      expect(here(router)).not.toBe(BOOKING_URL);
      cleanup();
    }
  });
});
