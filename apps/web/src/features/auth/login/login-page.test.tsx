import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { createAppRoutes } from '../../../router/routes';
import { apiError, createFakeAuthApi } from '../../../test/fake-auth-api';
import { PATIENT_PATHS } from '../../patient';
import { resetAuthForTest } from '../auth-session';
import { getAuthState, setAuthState } from '../auth-store';
import {
  FORGOT_PASSWORD_PATH,
  REGISTER_PATH,
  ROLE_HOME_PATHS,
  ROLE_LABELS,
  VERIFY_EMAIL_PATH,
  type VaiTro,
} from '../roles';

// Task F3. Mã ca LP-nn là [đề xuất]; ca nào phủ test case của PLAN thì ghi kèm mã đó.
const ROLES = Object.keys(ROLE_HOME_PATHS) as VaiTro[];
const WRONG_LOGIN = 'Email hoặc mật khẩu không đúng.';

let api: ReturnType<typeof createFakeAuthApi>;
let loginBodies: unknown[];

function useApi(vaiTro: VaiTro = 'BenhNhan') {
  api = createFakeAuthApi({ vaiTro, hoTen: 'Người mẫu', daXacMinhEmail: true });
  loginBodies = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/auth/login')) {
        loginBodies.push(JSON.parse(String(init?.body)));
      }
      return api.fetch(input, init);
    }),
  );
}

const failLogin = (status: number, body: Record<string, unknown>) =>
  api.failNext(
    '/auth/login',
    () =>
      new Response(JSON.stringify({ thongBao: 'CÂU CỦA API', ...body }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
  );

// Quản trị viên vào khung Admin thật, Bệnh nhân vào khung Bệnh nhân (đổi có duyệt ở patient F1), hai vai trò còn lại vẫn là trang giữ chỗ
function findRoleHome(vaiTro: VaiTro) {
  if (vaiTro === 'QuanTriVien') {
    return screen.findByRole('complementary', { name: 'Điều hướng Admin' });
  }
  if (vaiTro === 'BenhNhan') {
    return screen.findByRole('complementary', {
      name: 'Điều hướng Bệnh nhân',
    });
  }
  return screen.findByRole('heading', { name: ROLE_LABELS[vaiTro] });
}

// Bệnh nhân vào `/benh-nhan` rồi được chuyển ngay tới trang mặc định của khung (Q21e của patient)
function landingPathFor(vaiTro: VaiTro) {
  return vaiTro === 'BenhNhan'
    ? PATIENT_PATHS.profile
    : ROLE_HOME_PATHS[vaiTro];
}

async function renderLogin() {
  const router = createMemoryRouter(createAppRoutes(), {
    initialEntries: ['/dang-nhap'],
  });
  render(<RouterProvider router={router} />);
  await screen.findByLabelText('Email');
  return router;
}

const emailInput = () => screen.getByLabelText<HTMLInputElement>('Email');
const passwordInput = () => screen.getByLabelText<HTMLInputElement>('Mật khẩu');
const submitButton = () => screen.getByRole('button', { name: 'Đăng nhập' });

function fill(email = 'a@b.vn', matKhau = 'Matkhau@1') {
  fireEvent.change(emailInput(), { target: { value: email } });
  fireEvent.change(passwordInput(), { target: { value: matKhau } });
}

async function submit(email?: string, matKhau?: string) {
  fill(email, matKhau);
  fireEvent.click(submitButton());
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
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('biểu mẫu', () => {
  it('LP-70 nhãn gắn ô, autocomplete đúng, không có chữ demo (G3)', async () => {
    await renderLogin();
    expect(emailInput()).toHaveAttribute('autocomplete', 'username');
    expect(passwordInput()).toHaveAttribute('autocomplete', 'current-password');
    expect(passwordInput()).toHaveAttribute('type', 'password');
    expect(document.body.textContent).not.toMatch(/demo|minh họa/i);
  });

  it('LP-71 liên kết dùng đúng hằng số đường dẫn', async () => {
    await renderLogin();
    expect(
      screen.getByRole('link', { name: 'Quên mật khẩu?' }),
    ).toHaveAttribute('href', FORGOT_PASSWORD_PATH);
    expect(screen.getByRole('link', { name: 'Đăng ký ngay' })).toHaveAttribute(
      'href',
      REGISTER_PATH,
    );
  });

  it('LP-72 trống: báo từng ô, focus ô đầu, không gọi API', async () => {
    await renderLogin();
    fireEvent.click(submitButton());
    expect(await screen.findByText('Vui lòng nhập email.')).toBeInTheDocument();
    expect(screen.getByText('Vui lòng nhập mật khẩu.')).toBeInTheDocument();
    expect(emailInput()).toHaveFocus();
    expect(emailInput()).toHaveAttribute('aria-invalid', 'true');
    expect(emailInput()).toHaveAccessibleDescription('Vui lòng nhập email.');
    expect(loginBodies).toHaveLength(0);
  });

  it('LP-73 thiếu mật khẩu: focus ô mật khẩu', async () => {
    await renderLogin();
    fireEvent.change(emailInput(), { target: { value: 'a@b.vn' } });
    fireEvent.click(submitButton());
    await screen.findByText('Vui lòng nhập mật khẩu.');
    expect(passwordInput()).toHaveFocus();
    expect(emailInput()).not.toHaveAttribute('aria-invalid');
  });

  it('LP-74 mật khẩu gửi nguyên văn, không trim', async () => {
    await renderLogin();
    await submit('a@b.vn', '  Mat khau@1  ');
    await waitFor(() => expect(loginBodies).toHaveLength(1));
    expect(loginBodies[0]).toEqual({
      email: 'a@b.vn',
      matKhau: '  Mat khau@1  ',
    });
  });

  it('LP-75 nút hiện ẩn mật khẩu', async () => {
    await renderLogin();
    const toggle = screen.getByRole('button', { name: 'Hiện mật khẩu' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);
    expect(passwordInput()).toHaveAttribute('type', 'text');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(toggle);
    expect(passwordInput()).toHaveAttribute('type', 'password');
  });

  it('LP-76 chống gửi đúp: Enter hai lần liền chỉ một POST, nút vô hiệu khi đang gửi', async () => {
    await renderLogin();
    let release = () => {};
    const gate = new Promise<Response>((resolve) => {
      release = () =>
        resolve(
          new Response('{"maLoi":"DANG_NHAP_SAI","thongBao":"x"}', {
            status: 401,
          }),
        );
    });
    api.failNext('/auth/login', () => gate);
    fill();
    const form = emailInput().closest('form') as HTMLFormElement;
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(submitButton()).toBeDisabled());
    expect(loginBodies).toHaveLength(1);
    await act(async () => {
      release();
      await gate;
    });
    await screen.findByText(WRONG_LOGIN);
    expect(submitButton()).toBeEnabled();
  });

  it('LP-77 gõ lại thì lỗi biến mất', async () => {
    failLogin(401, { maLoi: 'DANG_NHAP_SAI' });
    await renderLogin();
    await submit();
    await screen.findByText(WRONG_LOGIN);
    fireEvent.change(passwordInput(), { target: { value: 'x' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('DN-03 đăng nhập thành công', () => {
  it.each(ROLES)('LP-78 %s về đúng trang bằng replace', async (vaiTro) => {
    useApi(vaiTro);
    const router = await renderLogin();
    await submit();
    await findRoleHome(vaiTro);
    // Đổi có duyệt ở patient F1: đường dẫn cuối của Bệnh nhân là trang mặc định của khung
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(landingPathFor(vaiTro)),
    );
    expect(router.state.historyAction).toBe('REPLACE');
    expect(loginBodies).toHaveLength(1);
  });
});

describe('DN-24 từng frame lỗi', () => {
  it('LP-80 sai mật khẩu: câu chung, xoá ô mật khẩu, giữ email, focus ô mật khẩu, không "Còn"', async () => {
    failLogin(401, { maLoi: 'DANG_NHAP_SAI', thongBao: 'Còn 4 lần thử' });
    await renderLogin();
    await submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(WRONG_LOGIN);
    expect(document.body.textContent).not.toMatch(/Còn \d|lần thử/);
    expect(passwordInput().value).toBe('');
    expect(emailInput().value).toBe('a@b.vn');
    expect(passwordInput()).toHaveFocus();
    expect(submitButton()).toBeEnabled();
  });

  it('LP-81 ngưng', async () => {
    failLogin(403, { maLoi: 'TAI_KHOAN_NGUNG' });
    await renderLogin();
    await submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Tài khoản đã bị ngưng hoạt động. Vui lòng liên hệ quản trị viên.',
    );
    expect(passwordInput().value).toBe('');
  });

  it('LP-82 chưa kích hoạt', async () => {
    failLogin(403, { maLoi: 'TAI_KHOAN_CHUA_KICH_HOAT' });
    await renderLogin();
    await submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Tài khoản nhân sự này chưa được kích hoạt. Hãy dùng link kích hoạt trong email để thiết lập mật khẩu.',
    );
  });

  it.each([
    [
      'LP-83 5xx JSON',
      () => apiError(500, 'LOI_HE_THONG'),
      'Hệ thống đang gặp sự cố. Vui lòng thử lại sau.',
    ],
    [
      'LP-84 502 HTML',
      () => new Response('<html>Bad Gateway</html>', { status: 502 }),
      'Đã có lỗi xảy ra. Vui lòng thử lại sau.',
    ],
    [
      'LP-85 mất mạng',
      () => Promise.reject(new TypeError('Failed to fetch')),
      'Không có kết nối mạng. Vui lòng kiểm tra và thử lại.',
    ],
  ])('%s: giữ mật khẩu, focus hộp lỗi', async (_name, response, message) => {
    api.failNext('/auth/login', response);
    await renderLogin();
    await submit();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(message);
    expect(alert).toHaveFocus();
    expect(passwordInput().value).toBe('Matkhau@1');
  });

  it('LP-86 timeout: giữ mật khẩu', async () => {
    await renderLogin();
    vi.stubGlobal(
      'fetch',
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => api.hang(init)),
    );
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fill();
    fireEvent.click(submitButton());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    vi.useRealTimers();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Yêu cầu mất quá nhiều thời gian. Vui lòng thử lại.',
    );
    expect(passwordInput().value).toBe('Matkhau@1');
  });

  it('LP-87 lỗi theo ô từ loi[]: gán đúng ô và focus', async () => {
    failLogin(400, {
      maLoi: 'DU_LIEU_KHONG_HOP_LE',
      loi: [{ truong: 'email', ma: 'EMAIL_KHONG_HOP_LE' }],
    });
    await renderLogin();
    await submit('sai', 'Matkhau@1');
    expect(await screen.findByText('Email không hợp lệ.')).toBeInTheDocument();
    expect(emailInput()).toHaveFocus();
    expect(emailInput()).toHaveAccessibleDescription('Email không hợp lệ.');
    expect(passwordInput()).not.toHaveAttribute('aria-invalid');
  });
});

describe('DN-24 khoá tạm', () => {
  function lockResponse(soGiayConLai: number) {
    failLogin(429, {
      maLoi: 'TAI_KHOAN_BI_KHOA_TAM',
      chiTiet: { soGiayConLai, khoaDen: '2000-01-01T00:00:00.000Z' },
    });
  }

  async function lockedFor(seconds: number) {
    lockResponse(seconds);
    await renderLogin();
    vi.useFakeTimers({
      toFake: ['setInterval', 'clearInterval', 'performance'],
    });
    await submit();
    await screen.findByRole('alert');
    // Hẹn giờ phải có trước khi tua, nếu không `advance` tua trượt mà không báo gì
    expect(vi.getTimerCount()).toBeGreaterThan(0);
  }

  function advance(ms: number) {
    act(() => {
      vi.advanceTimersByTime(ms);
    });
  }

  it('LP-90 đếm ngược mm:ss, nút và ô vô hiệu, liên kết bấm được', async () => {
    await lockedFor(900);
    expect(screen.getByText('15:00')).toBeInTheDocument();
    advance(61_000);
    expect(screen.getByText('13:59')).toBeInTheDocument();
    expect(submitButton()).toBeDisabled();
    expect(emailInput()).toBeDisabled();
    expect(passwordInput()).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Hiện mật khẩu' }),
    ).toBeDisabled();
    const links = screen.getAllByRole('link', { name: 'Quên mật khẩu?' });
    expect(links).toHaveLength(2);
    links.forEach((link) => {
      expect(link).toHaveAttribute('href', FORGOT_PASSWORD_PATH);
      expect(link).not.toHaveAttribute('aria-disabled');
    });
    expect(
      screen.getByRole('link', { name: 'Đăng ký ngay' }),
    ).toBeInTheDocument();
  });

  it('LP-91 câu đọc một lần không đổi theo giây, số đếm nằm ngoài vùng live', async () => {
    await lockedFor(900);
    const alert = screen.getByRole('alert');
    const before = alert.textContent;
    advance(5000);
    expect(screen.getByRole('alert')).toBe(alert);
    expect(alert.textContent).toBe(before);
    expect(alert).not.toHaveTextContent('14:55');
    expect(
      screen.getByText('14:55').closest('[aria-hidden="true"]'),
    ).not.toBeNull();
  });

  it('LP-92 xoá ô mật khẩu, focus vào hộp khoá', async () => {
    await lockedFor(60);
    expect(passwordInput().value).toBe('');
    expect(emailInput().value).toBe('a@b.vn');
    expect(screen.getByText('01:00').closest('[tabindex="-1"]')).toHaveFocus();
  });

  it('LP-93 hết giờ: mở khoá, KHÔNG tự gửi lại, khai báo một lần, focus ô mật khẩu', async () => {
    await lockedFor(2);
    expect(loginBodies).toHaveLength(1);
    advance(2000);
    expect(submitButton()).toBeEnabled();
    expect(emailInput()).toBeEnabled();
    expect(passwordInput()).toBeEnabled();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Bạn có thể đăng nhập lại.',
    );
    expect(loginBodies).toHaveLength(1);
    expect(passwordInput()).toHaveFocus();
  });

  it('LP-94 hết giờ rồi nhập sai tiếp: chữ chung, không khoá', async () => {
    await lockedFor(1);
    advance(1000);
    failLogin(401, { maLoi: 'DANG_NHAP_SAI' });
    await submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(WRONG_LOGIN);
    expect(submitButton()).toBeEnabled();
  });

  it('LP-95 hết giờ rồi bị khoá lại: đếm theo số mới', async () => {
    await lockedFor(1);
    advance(1000);
    lockResponse(30);
    await submit();
    expect(await screen.findByText('00:30')).toBeInTheDocument();
    expect(submitButton()).toBeDisabled();
  });

  it('LP-96 rời trang khi đang khoá: dọn hẹn giờ', async () => {
    await lockedFor(100);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole('link', { name: 'Đăng ký ngay' })[0]);
    // Chờ bằng findBy rồi mới đếm: `waitFor` cũng dùng setInterval, mà setInterval đang bị giả
    await screen.findByRole('heading', { name: 'Tạo tài khoản' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('LP-97 đang khoá thì gửi biểu mẫu không có tác dụng: hộp khoá giữ nguyên', async () => {
    await lockedFor(100);
    fireEvent.submit(emailInput().closest('form') as HTMLFormElement);
    await act(async () => {
      await Promise.resolve();
    });
    expect(loginBodies).toHaveLength(1);
    // Ô mật khẩu đã trống nên kiểm tra biên cũng chặn POST; thiếu chốt `locked` thì lỗi ô sẽ thay mất hộp khoá
    expect(screen.queryByText('Vui lòng nhập mật khẩu.')).toBeNull();
    expect(screen.getByText('01:40')).toBeInTheDocument();
  });
});

describe('EMAIL_CHUA_XAC_MINH (N2)', () => {
  const UNVERIFIED =
    'Email của bạn chưa được xác minh. Nhập mã OTP đã nhận hoặc bấm "Gửi lại mã".';

  it.each(['ConHan', 'HetHan', 'DaThuHoi', 'ChuaGui'])(
    'LP-100 %s: chuyển ngay tới màn nhập mã, state y nguyên, không gọi verify-otp',
    async (trangThaiMa) => {
      const chiTiet = {
        maXacThucId: '42',
        trangThaiMa,
        hetHanLuc: '2026-11-01T10:00:00.000Z',
      };
      failLogin(403, { maLoi: 'EMAIL_CHUA_XAC_MINH', chiTiet });
      const router = await renderLogin();
      await submit();
      await waitFor(() =>
        expect(router.state.location.pathname).toBe(VERIFY_EMAIL_PATH),
      );
      expect(router.state.location.state).toStrictEqual({
        email: 'a@b.vn',
        chiTiet,
      });
      expect(
        api.requests.filter(({ path }) => path.includes('verify-otp')),
      ).toHaveLength(0);
    },
  );

  it('LP-112 D11 bàn giao đẩy lịch sử để Back về đăng nhập', async () => {
    failLogin(403, {
      maLoi: 'EMAIL_CHUA_XAC_MINH',
      chiTiet: {
        maXacThucId: '42',
        trangThaiMa: 'HetHan',
        hetHanLuc: null,
      },
    });
    const router = await renderLogin();
    await submit();
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(VERIFY_EMAIL_PATH),
    );
    expect(router.state.historyAction).toBe('PUSH');
  });

  it('LP-101 CanDangKyLai với hai trường null: chỉ có đường đăng ký lại, kèm email', async () => {
    failLogin(403, {
      maLoi: 'EMAIL_CHUA_XAC_MINH',
      chiTiet: {
        maXacThucId: null,
        trangThaiMa: 'CanDangKyLai',
        hetHanLuc: null,
      },
    });
    const router = await renderLogin();
    await submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Yêu cầu xác minh email không còn hiệu lực. Vui lòng đăng ký lại bằng email này.',
    );
    expect(screen.queryByRole('link', { name: 'Nhập mã xác minh' })).toBeNull();
    fireEvent.click(screen.getByRole('link', { name: 'Đăng ký lại' }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(REGISTER_PATH),
    );
    expect(router.state.location.state).toStrictEqual({ email: 'a@b.vn' });
    expect(
      api.requests.filter(({ path }) => path.includes('verify-otp')),
    ).toHaveLength(0);
  });

  it('LP-102 chiTiet sai dạng: chỉ hiện câu, không có liên kết', async () => {
    failLogin(403, {
      maLoi: 'EMAIL_CHUA_XAC_MINH',
      chiTiet: { maXacThucId: null, trangThaiMa: 'ConHan' },
    });
    await renderLogin();
    await submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(UNVERIFIED);
    expect(screen.queryByRole('link', { name: 'Nhập mã xác minh' })).toBeNull();
  });
});

describe('F2 điền sẵn email', () => {
  async function renderWithState(state: unknown) {
    const router = createMemoryRouter(createAppRoutes(), {
      initialEntries: [{ pathname: '/dang-nhap', state }],
    });
    render(<RouterProvider router={router} />);
    await screen.findByLabelText('Email');
  }

  it('LP-110 có email trong state: điền sẵn, không thêm dòng thông báo', async () => {
    await renderWithState({ email: 'a@b.vn' });
    expect(emailInput().value).toBe('a@b.vn');
    expect(passwordInput().value).toBe('');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it.each([[null], [{ email: 123 }], [{ email: '' }], ['a@b.vn']])(
    'LP-111 state %j: ô email trống',
    async (state) => {
      await renderWithState(state);
      expect(emailInput().value).toBe('');
    },
  );
});

describe('giữ hành vi của F1', () => {
  it('LP-105 sessionEnded hiện dòng thông báo', async () => {
    setAuthState({ sessionEnded: true });
    await renderLogin();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Phiên đăng nhập đã kết thúc. Vui lòng đăng nhập lại.',
    );
  });

  it('LP-106 có lỗi biểu mẫu thì ẩn dòng phiên, không chồng hai thông báo', async () => {
    setAuthState({ sessionEnded: true });
    failLogin(401, { maLoi: 'DANG_NHAP_SAI' });
    await renderLogin();
    await submit();
    await screen.findByText(WRONG_LOGIN);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('LP-107 đã đăng nhập thì chuyển về trang vai trò', async () => {
    setAuthState({
      status: 'authenticated',
      user: { vaiTro: 'BacSi', hoTen: 'A', daXacMinhEmail: true },
    });
    const router = createMemoryRouter(createAppRoutes(), {
      initialEntries: ['/dang-nhap'],
    });
    render(<RouterProvider router={router} />);
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(ROLE_HOME_PATHS.BacSi),
    );
    expect(router.state.historyAction).toBe('REPLACE');
  });

  it('LP-108 /auth/me lỗi mạng sau đăng nhập: ẩn biểu mẫu, Thử lại dùng retrySession, không gọi lại login', async () => {
    api.failNext('/auth/me', () =>
      Promise.reject(new TypeError('Failed to fetch')),
    );
    const router = await renderLogin();
    await submit();
    await screen.findByRole('button', { name: 'Thử lại' });
    expect(screen.queryByLabelText('Email')).toBeNull();
    expect(getAuthState().status).toBe('error');

    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    // Đổi có duyệt ở patient F1: khung Bệnh nhân và trang mặc định thay cho trang giữ chỗ
    await findRoleHome('BenhNhan');
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(PATIENT_PATHS.profile),
    );
    expect(loginBodies).toHaveLength(1);
    expect(api.refreshCalls).toBe(0);
    expect(api.meCalls).toBe(2);
  });

  it('LP-109 lỗi không thử lại được: vẫn có biểu mẫu kèm lỗi', async () => {
    setAuthState({
      status: 'error',
      error: new Error('x'),
      canRetry: false,
    });
    await renderLogin();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
  });

  it('LP-110 đăng nhập lỗi 401 ở /auth/me: không treo, về biểu mẫu kèm câu của mã', async () => {
    api.failNext('/auth/me', () => apiError(401, 'PHIEN_HET_HIEU_LUC'));
    await renderLogin();
    await submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Phiên đăng nhập đã kết thúc. Vui lòng đăng nhập lại.',
    );
    expect(getAuthState().status).toBe('unauthenticated');
  });
});

// Cho phản hồi đã trả và mọi `navigate` theo sau chạy hết (setTimeout thật, không bị đồng hồ giả chặn). Trang đích là route `lazy`:
// nạp trước module của nó, nếu không lần nạp đầu chậm hơn vòng chờ và test xanh giả (đo ở RG-63)
async function settle(router: { state: { navigation: { state: string } } }) {
  await import('../verify/verify-email-page');
  for (let i = 0; i < 10; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  await waitFor(() => expect(router.state.navigation.state).toBe('idle'));
}

// D13: rời trang khi đăng nhập còn đang bay thì EMAIL_CHUA_XAC_MINH về sau không được kéo sang màn nhập mã
describe('rời trang khi đang gửi (D13)', () => {
  it('LP-113 EMAIL_CHUA_XAC_MINH về sau khi đã sang Đăng ký: vẫn ở Đăng ký', async () => {
    const respond = api.hold('/auth/login');
    const router = await renderLogin();
    await submit();
    await waitFor(() => expect(loginBodies).toHaveLength(1));
    fireEvent.click(screen.getByRole('link', { name: 'Đăng ký ngay' }));
    await screen.findByRole('heading', { name: 'Tạo tài khoản' });
    respond(403, {
      maLoi: 'EMAIL_CHUA_XAC_MINH',
      thongBao: 'CÂU CỦA API',
      chiTiet: {
        maXacThucId: '42',
        trangThaiMa: 'ConHan',
        hetHanLuc: '2026-11-01T10:00:00.000Z',
      },
    });
    await settle(router);
    expect(router.state.location.pathname).toBe(REGISTER_PATH);
  });
});

// D12 (task F4): liên kết Quên mật khẩu mang email đã gõ, không mang mật khẩu
describe('liên kết Quên mật khẩu (D12)', () => {
  it('LP-114 liên kết dưới ô mật khẩu: sang quên mật khẩu với email đã cắt khoảng trắng', async () => {
    const router = await renderLogin();
    fill('  a@b.vn  ', 'Matkhau@1');
    fireEvent.click(screen.getByRole('link', { name: 'Quên mật khẩu?' }));
    await screen.findByRole('heading', { name: 'Quên mật khẩu' });
    expect(router.state.location.pathname).toBe(FORGOT_PASSWORD_PATH);
    expect(router.state.location.state).toStrictEqual({ email: 'a@b.vn' });
    expect(screen.getByLabelText<HTMLInputElement>('Email đăng ký').value).toBe(
      'a@b.vn',
    );
  });

  it('LP-115 liên kết trong hộp khoá tạm: cũng mang email', async () => {
    failLogin(429, {
      maLoi: 'TAI_KHOAN_BI_KHOA_TAM',
      chiTiet: { soGiayConLai: 900, khoaDen: '2026-11-03T10:15:00.000Z' },
    });
    const router = await renderLogin();
    await submit('x@y.vn', 'Matkhau@1');
    await screen.findByText('15:00');
    const [lockLink] = screen.getAllByRole('link', { name: 'Quên mật khẩu?' });
    expect(lockLink.closest('[tabindex="-1"]')).not.toBeNull();
    fireEvent.click(lockLink);
    await screen.findByRole('heading', { name: 'Quên mật khẩu' });
    expect(router.state.location.state).toStrictEqual({ email: 'x@y.vn' });
  });
});
