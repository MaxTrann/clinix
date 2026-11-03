import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { createAppRoutes } from '../../../router/routes';
import { createFakeAuthApi } from '../../../test/fake-auth-api';
import { resetAuthForTest } from '../auth-session';
import { setAccessToken, setAuthState } from '../auth-store';
import { FORGOT_PASSWORD_PATH, LOGIN_PATH, REGISTER_PATH } from '../roles';

// Task F4. Mã ca QF-nn là [đề xuất] (tiền tố FP- đã dùng ở test API của A11); ca nào phủ test case của PLAN thì ghi kèm mã đó.
const AT = Date.parse('2026-11-03T10:00:00.000Z');
const iso = (seconds: number) => new Date(AT + seconds * 1000).toISOString();

const REQUEST = '/auth/forgot-password';
const RESEND = '/auth/forgot-password/resend-otp';
const VERIFY = '/auth/forgot-password/verify-otp';
const RESET = '/auth/reset-password';

const GOOD = ' Matkhau@1 ';
const RULE =
  'Mật khẩu từ 8 đến 64 ký tự, gồm ít nhất một chữ số và một ký tự đặc biệt (ví dụ ! @ # $ % .).';
const NOT_REGISTERED = 'Email chưa đăng ký.';
const PENDING =
  'Tài khoản nhân sự này chưa kích hoạt và không thể dùng quên mật khẩu. Hãy dùng link kích hoạt trong email đầu tiên hoặc liên hệ quản trị viên.';
const TOKEN_EXPIRED =
  'Yêu cầu đặt lại mật khẩu đã hết hiệu lực. Vui lòng nhập email để nhận mã mới.';
const RESENT =
  'Đã gửi mã mới. Mã trong thư trước không còn dùng được, vui lòng dùng thư mới nhất.';
const N7 =
  'Mật khẩu đã được đặt lại. Tài khoản của bạn hiện đang ngừng hoạt động nên chưa thể đăng nhập. Vui lòng liên hệ bộ phận hỗ trợ.';
const N3 =
  'Mật khẩu đã được đặt lại. Tài khoản chưa xác minh email; vui lòng đăng ký lại bằng email này để nhận mã OTP mới.';
const CAN_LOGIN = 'Bạn có thể đăng nhập với mật khẩu mới.';

let api: ReturnType<typeof createFakeAuthApi>;
let consoleLines: string[];

const bodiesOf = (path: string) =>
  api.bodies.filter((entry) => entry.path === path).map(({ body }) => body);
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
const fail = (path: string, status: number, body: Record<string, unknown>) =>
  api.failNext(path, () => json(status, { thongBao: 'CÂU CỦA API', ...body }));
const failNetwork = (path: string) =>
  api.failNext(path, () => Promise.reject(new TypeError('net')));

// Giả cả `Date` và `performance`. Giữ `setTimeout` thật để promise và router chạy được.
function fakeClock() {
  vi.useFakeTimers({
    now: AT,
    toFake: ['setInterval', 'clearInterval', 'performance', 'Date'],
  });
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function renderAt(state?: unknown) {
  const router = createMemoryRouter(createAppRoutes(), {
    initialEntries: [{ pathname: FORGOT_PASSWORD_PATH, state }],
  });
  render(<RouterProvider router={router} />);
  return router;
}

async function renderForgot(state?: unknown) {
  const router = renderAt(state);
  await screen.findByRole('heading', { name: 'Quên mật khẩu' });
  return router;
}

// Tải lại trang: dựng lại từ đầu với đúng `location.state` đang có (thứ duy nhất sống qua tải lại)
async function reload(router: ReturnType<typeof renderAt>) {
  const { state } = router.state.location;
  cleanup();
  return renderForgot(state);
}

const emailInput = () =>
  screen.getByLabelText<HTMLInputElement>('Email đăng ký');
const sendButton = () => screen.getByRole('button', { name: 'Gửi mã OTP' });
const cell = (n: number) =>
  screen.getByLabelText<HTMLInputElement>(`Chữ số thứ ${n} trong 6`);
const nextButton = () => screen.getByRole('button', { name: 'Tiếp theo' });
const resendButton = () => screen.getByRole('button', { name: 'Gửi lại mã' });
const typeCode = (code = '012345') =>
  fireEvent.paste(cell(1), { clipboardData: { getData: () => code } });
const newPassword = () =>
  screen.getByLabelText<HTMLInputElement>('Mật khẩu mới', { exact: true });
const confirmPassword = () =>
  screen.getByLabelText<HTMLInputElement>('Xác nhận mật khẩu mới', {
    exact: true,
  });
const resetButton = () =>
  screen.getByRole('button', { name: 'Đặt lại mật khẩu' });
const steps = () =>
  within(
    screen.getByRole('list', { name: 'Các bước đặt lại mật khẩu' }),
  ).getAllByRole('listitem');
const currentStep = () =>
  steps().find((item) => item.getAttribute('aria-current') === 'step');

async function toCodeStep(email = 'a@b.vn') {
  const router = await renderForgot();
  fireEvent.change(emailInput(), { target: { value: email } });
  fireEvent.click(sendButton());
  await screen.findByLabelText('Chữ số thứ 1 trong 6');
  return router;
}

async function toPasswordStep() {
  const router = await toCodeStep();
  typeCode();
  fireEvent.click(nextButton());
  await screen.findByLabelText('Mật khẩu mới', { exact: true });
  return router;
}

function fillPasswords(matKhauMoi = GOOD, xacNhan = matKhauMoi) {
  fireEvent.change(newPassword(), { target: { value: matKhauMoi } });
  fireEvent.change(confirmPassword(), { target: { value: xacNhan } });
}

async function toDone(flags?: Record<string, unknown>) {
  if (flags) api.failNext(RESET, () => json(200, flags));
  const router = await toPasswordStep();
  fillPasswords();
  fireEvent.click(resetButton());
  await screen.findByText('Mật khẩu đã được đặt lại!');
  return router;
}

// resetToken của API giả có dạng `reset-N`: không được lọt vào bất cứ nơi nào sống ngoài state của trang
function expectNoTokenOutsideMemory(router: ReturnType<typeof renderAt>) {
  const { location } = router.state;
  const outside = [
    JSON.stringify(location.state ?? null),
    location.pathname,
    location.search,
    location.hash,
    JSON.stringify(window.history.state),
    JSON.stringify({ ...window.sessionStorage }),
    JSON.stringify({ ...window.localStorage }),
    document.cookie,
    consoleLines.join('\n'),
  ].join('|');
  expect(outside).not.toMatch(/reset-\d/);
}

// Cho phản hồi đã trả và mọi `navigate` theo sau chạy hết (setTimeout thật)
async function settle() {
  for (let i = 0; i < 10; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

beforeEach(() => {
  resetAuthForTest();
  setAuthState({ status: 'unauthenticated' });
  api = createFakeAuthApi();
  vi.stubGlobal(
    'fetch',
    vi.fn((target: RequestInfo | URL, init?: RequestInit) =>
      api.fetch(target, init),
    ),
  );
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: undefined,
  });
  consoleLines = [];
  for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      consoleLines.push(args.map(String).join(' '));
    });
  }
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe('vào trang', () => {
  it('QF-01 QM-22 bước 1 (643:2): tiêu đề, thanh 3 bước, nhãn, không có chữ demo (G3)', async () => {
    await renderForgot();
    expect(screen.getByText('Nhập email để nhận mã OTP')).toBeInTheDocument();
    expect(steps().map((item) => item.textContent)).toEqual([
      '1Email',
      '2Mã OTP',
      '3Mật khẩu mới',
    ]);
    expect(currentStep()).toHaveTextContent('Email');
    expect(emailInput()).toHaveAttribute('type', 'email');
    expect(emailInput()).toHaveAttribute('autocomplete', 'email');
    expect(emailInput()).toHaveAttribute('placeholder', 'email@example.com');
    expect(
      screen.getByRole('link', { name: 'Quay về đăng nhập' }),
    ).toHaveAttribute('href', LOGIN_PATH);
    expect(document.body.textContent).not.toMatch(/demo|thử nghiệm/i);
  });

  it('QF-02 D12 đến từ đăng nhập với state email: điền sẵn', async () => {
    await renderForgot({ email: 'x@y.vn' });
    expect(emailInput().value).toBe('x@y.vn');
  });

  it('QF-03 đã đăng nhập: về trang vai trò', async () => {
    setAuthState({
      status: 'authenticated',
      user: { vaiTro: 'BenhNhan', hoTen: 'A', daXacMinhEmail: true },
    });
    const router = renderAt();
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/benh-nhan'),
    );
  });

  it('QF-04 đang kiểm phiên: chưa hiện biểu mẫu', async () => {
    setAuthState({ status: 'checking' });
    const router = renderAt();
    await waitFor(() => expect(router.state.initialized).toBe(true));
    expect(router.state.location.pathname).toBe(FORGOT_PASSWORD_PATH);
    expect(screen.queryByLabelText('Email đăng ký')).toBeNull();
  });

  it.each([
    ['không state', undefined],
    ['stage code thiếu email', { stage: 'code', hetHanLuc: iso(600) }],
    ['stage done thiếu cờ', { stage: 'done', email: 'a@b.vn' }],
    [
      'stage done thiếu email',
      { stage: 'done', taiKhoanNgung: false, canDangKyLai: false },
    ],
    [
      'stage done cờ không phải boolean',
      {
        stage: 'done',
        email: 'a@b.vn',
        taiKhoanNgung: 'true',
        canDangKyLai: false,
      },
    ],
    ['không phải object', 'rác'],
  ])('QF-05 state lạ (%s): về bước 1', async (_name, state) => {
    await renderForgot(state);
    expect(currentStep()).toHaveTextContent('Email');
    expect(screen.queryByLabelText('Chữ số thứ 1 trong 6')).toBeNull();
  });
});

describe('bước 1: email', () => {
  it('QF-10 QM-22 gửi đúng { email } đã cắt khoảng trắng, không Authorization; sang bước 2 bằng replace, state không bí mật', async () => {
    fakeClock();
    setAccessToken('tok-cu');
    const router = await toCodeStep('  a@B.vn  ');
    expect(bodiesOf(REQUEST)).toStrictEqual([{ email: 'a@B.vn' }]);
    expect(
      api.requests
        .find(({ path }) => path === REQUEST)
        ?.headers.has('Authorization'),
    ).toBe(false);
    expect(screen.getByText('Nhập mã gửi đến a@B.vn')).toBeInTheDocument();
    expect(currentStep()).toHaveTextContent('Mã OTP');
    expect(steps()[0]).toHaveTextContent('Email (đã xong)');
    expect(router.state.historyAction).toBe('REPLACE');
    expect(router.state.location.state).toStrictEqual({
      stage: 'code',
      email: 'a@B.vn',
      hetHanLuc: iso(600),
      coTheGuiLaiLuc: iso(60),
    });
    expect(cell(1)).toHaveFocus();
  });

  it.each([
    ['', 'Vui lòng nhập email.'],
    ['   ', 'Vui lòng nhập email.'],
    ['khong-co-a-cong', 'Email không hợp lệ.'],
    ['a@b', 'Email không hợp lệ.'],
  ])('QF-11 email "%s": báo dưới ô, không gọi API', async (value, message) => {
    await renderForgot();
    fireEvent.change(emailInput(), { target: { value } });
    fireEvent.click(sendButton());
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(emailInput()).toHaveAttribute('aria-invalid', 'true');
    expect(emailInput()).toHaveFocus();
    expect(bodiesOf(REQUEST)).toHaveLength(0);
  });

  it('QF-12 bấm hai lần: một POST', async () => {
    await renderForgot();
    fireEvent.change(emailInput(), { target: { value: 'a@b.vn' } });
    const form = sendButton().closest('form') as HTMLFormElement;
    fireEvent.submit(form);
    fireEvent.submit(form);
    await screen.findByLabelText('Chữ số thứ 1 trong 6');
    expect(bodiesOf(REQUEST)).toHaveLength(1);
  });

  it.each([
    ['QM-02 404 EMAIL_CHUA_DANG_KY', 404, 'EMAIL_CHUA_DANG_KY', NOT_REGISTERED],
    [
      'QM-03 403 TAI_KHOAN_CHUA_KICH_HOAT (câu 644:2)',
      403,
      'TAI_KHOAN_CHUA_KICH_HOAT',
      PENDING,
    ],
    [
      '404 KHONG_TIM_THAY (route lạ) không phải "Email chưa đăng ký"',
      404,
      'KHONG_TIM_THAY',
      'Đã có lỗi xảy ra. Vui lòng thử lại sau.',
    ],
    [
      '500 LOI_HE_THONG',
      500,
      'LOI_HE_THONG',
      'Hệ thống đang gặp sự cố. Vui lòng thử lại sau.',
    ],
    [
      '400 DU_LIEU_KHONG_HOP_LE không có loi',
      400,
      'DU_LIEU_KHONG_HOP_LE',
      'Dữ liệu không hợp lệ.',
    ],
  ])(
    'QF-13 %s: hộp vàng (D4), ở lại bước 1, giữ email',
    async (_name, status, maLoi, message) => {
      fail(REQUEST, status, { maLoi });
      await renderForgot();
      fireEvent.change(emailInput(), { target: { value: 'a@b.vn' } });
      fireEvent.click(sendButton());
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(message);
      expect(alert).toHaveClass('bg-warning-soft');
      expect(alert).toHaveFocus();
      expect(document.body.textContent).not.toContain('CÂU CỦA API');
      expect(emailInput().value).toBe('a@b.vn');
      expect(currentStep()).toHaveTextContent('Email');
      expect(bodiesOf(REQUEST)).toHaveLength(1);
    },
  );

  it('QF-14 DU_LIEU_KHONG_HOP_LE kèm EMAIL_KHONG_HOP_LE: lỗi dưới ô', async () => {
    fail(REQUEST, 400, {
      maLoi: 'DU_LIEU_KHONG_HOP_LE',
      loi: [{ truong: 'email', ma: 'EMAIL_KHONG_HOP_LE' }],
    });
    await renderForgot();
    fireEvent.change(emailInput(), { target: { value: 'a@b.vn' } });
    fireEvent.click(sendButton());
    expect(await screen.findByText('Email không hợp lệ.')).toBeInTheDocument();
    expect(emailInput()).toHaveAttribute('aria-invalid', 'true');
  });

  it('QF-15 lỗi mạng: câu mất mạng, không tự thử lại', async () => {
    failNetwork(REQUEST);
    await renderForgot();
    fireEvent.change(emailInput(), { target: { value: 'a@b.vn' } });
    fireEvent.click(sendButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không có kết nối mạng.',
    );
    await settle();
    expect(bodiesOf(REQUEST)).toHaveLength(1);
  });

  it('QF-16 429: đếm theo soGiayCho, nút khoá; gõ lại vẫn giữ hộp; hết giờ mở lại', async () => {
    fakeClock();
    fail(REQUEST, 429, {
      maLoi: 'GUI_LAI_QUA_SOM',
      chiTiet: { soGiayCho: 30 },
    });
    await renderForgot();
    fireEvent.change(emailInput(), { target: { value: 'a@b.vn' } });
    fireEvent.click(sendButton());
    expect(await screen.findByText('00:30')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Vui lòng thử lại sau.',
    );
    expect(sendButton()).toBeDisabled();
    fireEvent.change(emailInput(), { target: { value: 'c@d.vn' } });
    expect(screen.getByText('00:30')).toBeInTheDocument();
    expect(sendButton()).toBeDisabled();
    await advance(10_000);
    expect(screen.getByText('00:20')).toBeInTheDocument();
    await advance(20_500);
    expect(sendButton()).toBeEnabled();
    expect(screen.queryByText(/Vui lòng thử lại sau/)).toBeNull();
  });

  // Nút khoá không chặn được mọi đường gửi biểu mẫu (Enter trong ô, trình duyệt khác nhau), nên hàm gửi tự kiểm lại
  it('QF-20 đang đếm 429: gửi biểu mẫu thẳng (không qua nút) vẫn không gọi API', async () => {
    fakeClock();
    fail(REQUEST, 429, {
      maLoi: 'GUI_LAI_QUA_SOM',
      chiTiet: { soGiayCho: 30 },
    });
    await renderForgot();
    fireEvent.change(emailInput(), { target: { value: 'a@b.vn' } });
    fireEvent.click(sendButton());
    await screen.findByText('00:30');
    fireEvent.submit(sendButton().closest('form') as HTMLFormElement);
    await settle();
    expect(bodiesOf(REQUEST)).toHaveLength(1);
    expect(currentStep()).toHaveTextContent('Email');
  });

  it('QF-17 429 không có soGiayCho: chỉ câu, nút không khoá', async () => {
    fail(REQUEST, 429, { maLoi: 'GUI_LAI_QUA_SOM' });
    await renderForgot();
    fireEvent.change(emailInput(), { target: { value: 'a@b.vn' } });
    fireEvent.click(sendButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Vui lòng thử lại sau.',
    );
    expect(sendButton()).toBeEnabled();
  });

  it('QF-18 QM-09 D9 503 GUI_MAIL_LOI: sang bước 2, ô mở, không dòng hạn, khoá Gửi lại theo coTheGuiLaiLuc, không tự thử lại', async () => {
    fakeClock();
    fail(REQUEST, 503, {
      maLoi: 'GUI_MAIL_LOI',
      chiTiet: { coTheGuiLaiLuc: iso(45) },
    });
    const router = await toCodeStep();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Không gửi được email. Vui lòng thử lại sau ít phút. Nếu còn mã trong thư trước, bạn có thể nhập mã đó.',
    );
    expect(cell(1)).toBeEnabled();
    expect(screen.queryByText(/Mã hết hạn sau/)).toBeNull();
    expect(resendButton()).toHaveTextContent('Gửi lại sau 45s');
    expect(router.state.location.state).toStrictEqual({
      stage: 'code',
      email: 'a@b.vn',
      hetHanLuc: null,
      coTheGuiLaiLuc: iso(45),
    });
    await settle();
    expect(bodiesOf(REQUEST)).toHaveLength(1);
    typeCode();
    fireEvent.click(nextButton());
    await screen.findByLabelText('Mật khẩu mới', { exact: true });
  });

  it('QF-19 503 không có chiTiet: vẫn sang bước 2, Gửi lại bấm được', async () => {
    fail(REQUEST, 503, { maLoi: 'GUI_MAIL_LOI' });
    await toCodeStep();
    expect(resendButton()).toBeEnabled();
  });
});

describe('bước 2: nhập mã', () => {
  it('QF-30 QM-22 phản hồi mới: 10:00, Gửi lại sau 60s; thân { email, otp } với otp là chuỗi', async () => {
    fakeClock();
    vi.setSystemTime(AT + 3_600_000);
    await toCodeStep();
    expect(screen.getByText('10:00')).toBeInTheDocument();
    expect(resendButton()).toHaveTextContent('Gửi lại sau 60s');
    typeCode('012345');
    fireEvent.click(nextButton());
    await screen.findByLabelText('Mật khẩu mới', { exact: true });
    expect(bodiesOf(VERIFY)).toStrictEqual([
      { email: 'a@b.vn', otp: '012345' },
    ]);
  });

  it('QF-45 D3 máy nhanh hơn máy chủ 5 phút: phản hồi mới vẫn 10:00 (hiệu hai mốc + 60), không theo đồng hồ máy', async () => {
    fakeClock();
    vi.setSystemTime(AT + 300_000);
    // Mốc theo đồng hồ máy chủ (AT); đồng hồ máy đã ở AT + 5 phút
    api.failNext(REQUEST, () =>
      json(201, { hetHanLuc: iso(600), coTheGuiLaiLuc: iso(60) }),
    );
    await toCodeStep();
    expect(screen.getByText('10:00')).toBeInTheDocument();
    expect(resendButton()).toHaveTextContent('Gửi lại sau 60s');
  });

  it('QF-31 chưa đủ 6 số: nút vô hiệu, Enter không gọi API, đủ 6 số không tự gửi', async () => {
    await toCodeStep();
    typeCode('12345');
    expect(nextButton()).toBeDisabled();
    fireEvent.submit(nextButton().closest('form') as HTMLFormElement);
    typeCode('123456');
    await settle();
    expect(bodiesOf(VERIFY)).toHaveLength(0);
    expect(nextButton()).toBeEnabled();
  });

  it('QF-32 QM-05 OTP_SAI 4 lần rồi đúng: mỗi lần báo, xoá ô, focus ô đầu; lần đúng sang bước 3', async () => {
    for (let i = 0; i < 4; i++) fail(VERIFY, 400, { maLoi: 'OTP_SAI' });
    await toCodeStep();
    for (let i = 0; i < 4; i++) {
      typeCode('111111');
      fireEvent.click(nextButton());
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Mã OTP không đúng. Vui lòng kiểm tra lại.',
      );
      expect(cell(1).value).toBe('');
      expect(cell(1)).toHaveFocus();
      expect(cell(1)).toHaveAttribute('aria-invalid', 'true');
    }
    expect(document.body.textContent).not.toMatch(/email (sai|không đúng)/i);
    typeCode('222222');
    fireEvent.click(nextButton());
    await screen.findByLabelText('Mật khẩu mới', { exact: true });
    expect(bodiesOf(VERIFY)).toHaveLength(5);
  });

  it.each([
    [
      'QM-06 OTP_HET_LUOT',
      'OTP_HET_LUOT',
      'Bạn đã nhập sai quá 5 lần. Mã đã bị vô hiệu, vui lòng bấm "Gửi lại mã".',
    ],
    [
      'OTP_HET_HAN',
      'OTP_HET_HAN',
      'Mã OTP đã hết hạn. Vui lòng bấm "Gửi lại mã".',
    ],
  ])(
    'QF-33 %s: khoá ô, chỉ còn Gửi lại; gửi lại xong mở ô',
    async (_name, maLoi, message) => {
      fakeClock();
      fail(VERIFY, 400, { maLoi });
      await toCodeStep();
      typeCode();
      fireEvent.click(nextButton());
      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(cell(1)).toBeDisabled();
      expect(nextButton()).toBeDisabled();
      expect(screen.queryByText(/Mã hết hạn sau/)).toBeNull();
      await advance(61_000);
      fireEvent.click(resendButton());
      await screen.findByText(RESENT);
      expect(cell(1)).toBeEnabled();
      expect(cell(1)).toHaveFocus();
    },
  );

  it('QF-34 DU_LIEU_KHONG_HOP_LE OTP_KHONG_HOP_LE: câu của 5.5', async () => {
    fail(VERIFY, 400, {
      maLoi: 'DU_LIEU_KHONG_HOP_LE',
      loi: [{ truong: 'otp', ma: 'OTP_KHONG_HOP_LE' }],
    });
    await toCodeStep();
    typeCode();
    fireEvent.click(nextButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Mã OTP gồm đúng 6 chữ số.',
    );
  });

  it.each([
    ['lỗi mạng', () => failNetwork(VERIFY), 'Không có kết nối mạng.'],
    [
      '500',
      () => fail(VERIFY, 500, { maLoi: 'LOI_HE_THONG' }),
      'Hệ thống đang gặp sự cố.',
    ],
    [
      '200 thiếu resetToken',
      () => api.failNext(VERIFY, () => json(200, { hetHanLuc: iso(600) })),
      'Dữ liệu không hợp lệ.',
    ],
  ])(
    'QF-35 %s: giữ số đã nhập, ở lại bước 2, không tự thử lại',
    async (_name, arrange, message) => {
      arrange();
      await toCodeStep();
      typeCode('123456');
      fireEvent.click(nextButton());
      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(cell(6).value).toBe('6');
      expect(currentStep()).toHaveTextContent('Mã OTP');
      expect(bodiesOf(VERIFY)).toHaveLength(1);
    },
  );

  it('QF-36 D10 Gửi lại mã: thân { email }, câu dùng thư mới nhất, đặt lại hai bộ đếm, xoá ô; state ghi mốc mới', async () => {
    fakeClock();
    const router = await toCodeStep();
    typeCode('123');
    await advance(100_000);
    expect(screen.getByText('08:20')).toBeInTheDocument();
    fireEvent.click(resendButton());
    expect(await screen.findByText(RESENT)).toHaveAttribute('role', 'status');
    expect(bodiesOf(RESEND)).toStrictEqual([{ email: 'a@b.vn' }]);
    expect(screen.getByText('10:00')).toBeInTheDocument();
    expect(resendButton()).toHaveTextContent('Gửi lại sau 60s');
    expect(cell(1).value).toBe('');
    expect(router.state.location.state).toStrictEqual({
      stage: 'code',
      email: 'a@b.vn',
      hetHanLuc: iso(700),
      coTheGuiLaiLuc: iso(160),
    });
    typeCode();
    expect(screen.queryByText(RESENT)).toBeInTheDocument();
  });

  it('QF-37 Gửi lại bấm hai lần liền: một POST; đang khoá thì không gọi', async () => {
    fakeClock();
    await toCodeStep();
    fireEvent.click(resendButton());
    expect(bodiesOf(RESEND)).toHaveLength(0);
    await advance(61_000);
    fireEvent.click(resendButton());
    fireEvent.click(resendButton());
    await screen.findByText(RESENT);
    expect(bodiesOf(RESEND)).toHaveLength(1);
  });

  it('QF-44 hai lần bấm trong cùng một lượt (trước khi React vẽ lại nút bị khoá): một POST cho mỗi nút', async () => {
    fakeClock();
    await toCodeStep();
    await advance(61_000);
    act(() => {
      resendButton().click();
      resendButton().click();
    });
    await screen.findByText(RESENT);
    expect(bodiesOf(RESEND)).toHaveLength(1);
    typeCode();
    act(() => {
      nextButton().click();
      nextButton().click();
    });
    await screen.findByLabelText('Mật khẩu mới', { exact: true });
    expect(bodiesOf(VERIFY)).toHaveLength(1);
  });

  it('QF-38 Gửi lại 429: khoá theo soGiayCho', async () => {
    fakeClock();
    fail(RESEND, 429, {
      maLoi: 'GUI_LAI_QUA_SOM',
      chiTiet: { soGiayCho: 1800 },
    });
    await toCodeStep();
    await advance(61_000);
    fireEvent.click(resendButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Vui lòng thử lại sau.',
    );
    expect(resendButton()).toHaveTextContent('Gửi lại sau 1800s');
  });

  it('QF-39 QM-09 Gửi lại 503: báo lỗi, giữ hạn mã cũ, khoá tới coTheGuiLaiLuc, state cập nhật mốc', async () => {
    fakeClock();
    fail(RESEND, 503, {
      maLoi: 'GUI_MAIL_LOI',
      chiTiet: { coTheGuiLaiLuc: iso(121) },
    });
    const router = await toCodeStep();
    await advance(61_000);
    fireEvent.click(resendButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không gửi được email. Vui lòng thử lại sau ít phút.',
    );
    expect(screen.getByText('08:59')).toBeInTheDocument();
    expect(resendButton()).toHaveTextContent('Gửi lại sau 60s');
    expect(cell(1)).toBeEnabled();
    expect(router.state.location.state).toMatchObject({
      hetHanLuc: iso(600),
      coTheGuiLaiLuc: iso(121),
    });
  });

  it.each([
    [404, 'EMAIL_CHUA_DANG_KY', NOT_REGISTERED],
    [403, 'TAI_KHOAN_CHUA_KICH_HOAT', PENDING],
  ])(
    'QF-40 Gửi lại %i %s: về bước 1 kèm câu, giữ email',
    async (status, maLoi, message) => {
      fakeClock();
      fail(RESEND, status, { maLoi });
      const router = await toCodeStep();
      await advance(61_000);
      fireEvent.click(resendButton());
      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(currentStep()).toHaveTextContent('Email');
      expect(emailInput().value).toBe('a@b.vn');
      expect(router.state.location.state).toStrictEqual({ email: 'a@b.vn' });
    },
  );

  it('QF-41 Đổi email: về bước 1 giữ email, không gọi API; gửi lại email khác được', async () => {
    const router = await toCodeStep();
    fireEvent.click(screen.getByRole('button', { name: '← Đổi email' }));
    expect(currentStep()).toHaveTextContent('Email');
    expect(emailInput().value).toBe('a@b.vn');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(router.state.location.state).toStrictEqual({ email: 'a@b.vn' });
    fireEvent.change(emailInput(), { target: { value: 'c@d.vn' } });
    fireEvent.click(sendButton());
    await screen.findByText('Nhập mã gửi đến c@d.vn');
    expect(bodiesOf(REQUEST)).toStrictEqual([
      { email: 'a@b.vn' },
      { email: 'c@d.vn' },
    ]);
  });

  it('QF-42 tải lại ở bước 2: giữ email, đếm theo đồng hồ máy có kẹp, không tự gửi', async () => {
    fakeClock();
    const router = await toCodeStep();
    vi.setSystemTime(AT + 120_000);
    await reload(router);
    expect(screen.getByText('Nhập mã gửi đến a@b.vn')).toBeInTheDocument();
    expect(screen.getByText('08:00')).toBeInTheDocument();
    expect(resendButton()).toBeEnabled();
    expect(bodiesOf(REQUEST)).toHaveLength(1);
    expect(bodiesOf(RESEND)).toHaveLength(0);
  });

  it('QF-43 rời trang: dọn hết hẹn giờ', async () => {
    fakeClock();
    await toCodeStep();
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    cleanup();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('bước 3: mật khẩu mới', () => {
  it('QF-50 QM-22 frame 651:2: hai ô, câu quy tắc, hai nút mắt; token KHÔNG ở state, kho, URL, console', async () => {
    const router = await toPasswordStep();
    expect(screen.getByText('Đặt mật khẩu mới')).toBeInTheDocument();
    expect(currentStep()).toHaveTextContent('Mật khẩu mới');
    expect(steps()[1]).toHaveTextContent('Mã OTP (đã xong)');
    expect(newPassword()).toHaveFocus();
    expect(newPassword()).toHaveAttribute('placeholder', 'Nhập mật khẩu');
    expect(newPassword()).toHaveAttribute('autocomplete', 'new-password');
    expect(newPassword()).toHaveAccessibleDescription(RULE);
    expect(confirmPassword()).toHaveAttribute(
      'placeholder',
      'Nhập lại mật khẩu',
    );
    expect(document.body.textContent).not.toContain('Tối thiểu 8');
    fireEvent.click(screen.getByRole('button', { name: 'Hiện mật khẩu mới' }));
    expect(newPassword()).toHaveAttribute('type', 'text');
    expect(confirmPassword()).toHaveAttribute('type', 'password');
    fireEvent.click(
      screen.getByRole('button', { name: 'Hiện xác nhận mật khẩu mới' }),
    );
    expect(confirmPassword()).toHaveAttribute('type', 'text');
    expect(router.state.location.state).toStrictEqual({
      stage: 'code',
      email: 'a@b.vn',
      hetHanLuc: expect.any(String) as string,
      coTheGuiLaiLuc: expect.any(String) as string,
    });
    expectNoTokenOutsideMemory(router);
  });

  it('QF-51 gửi đúng { resetToken, matKhauMoi, xacNhan }, KHÔNG trim, không Authorization', async () => {
    setAccessToken('tok-cu');
    await toDone();
    expect(bodiesOf(RESET)).toStrictEqual([
      { resetToken: 'reset-1', matKhauMoi: GOOD, xacNhan: GOOD },
    ]);
    expect(
      api.requests
        .find(({ path }) => path === RESET)
        ?.headers.has('Authorization'),
    ).toBe(false);
  });

  it.each([
    ['ngắn', 'Ab@1', 'Ab@1', 'matKhauMoi', RULE],
    [
      'có dấu',
      'Mậtkhẩu1!',
      'Mậtkhẩu1!',
      'matKhauMoi',
      'Mật khẩu chỉ được dùng chữ không dấu, chữ số, dấu câu/ký hiệu và dấu cách.',
    ],
    ['rỗng', '', '', 'matKhauMoi', RULE],
    [
      'xác nhận lệch',
      GOOD,
      GOOD.trim(),
      'xacNhan',
      'Mật khẩu xác nhận không khớp.',
    ],
  ])(
    'QF-52 QM-08 kiểm ở biên (%s): báo dưới ô, không gọi API',
    async (_name, a, b, field, message) => {
      await toPasswordStep();
      fillPasswords(a, b);
      fireEvent.click(resetButton());
      expect(await screen.findByText(message)).toBeInTheDocument();
      const input = field === 'matKhauMoi' ? newPassword() : confirmPassword();
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(input).toHaveFocus();
      expect(bodiesOf(RESET)).toHaveLength(0);
    },
  );

  it('QF-53 QM-08 API 400 theo trường: ở lại, GIỮ token và dữ liệu; gửi lại cùng token', async () => {
    fail(RESET, 400, {
      maLoi: 'DU_LIEU_KHONG_HOP_LE',
      loi: [{ truong: 'xacNhan', ma: 'XAC_NHAN_KHONG_KHOP' }],
    });
    await toPasswordStep();
    fillPasswords();
    fireEvent.click(resetButton());
    expect(
      await screen.findByText('Mật khẩu xác nhận không khớp.'),
    ).toBeInTheDocument();
    expect(newPassword().value).toBe(GOOD);
    expect(confirmPassword().value).toBe(GOOD);
    fireEvent.click(resetButton());
    await screen.findByText('Mật khẩu đã được đặt lại!');
    expect(
      bodiesOf(RESET).map(
        (body) => (body as { resetToken: string }).resetToken,
      ),
    ).toEqual(['reset-1', 'reset-1']);
  });

  it.each([
    [
      '500 LOI_HE_THONG',
      () => fail(RESET, 500, { maLoi: 'LOI_HE_THONG' }),
      'Hệ thống đang gặp sự cố.',
    ],
    ['lỗi mạng', () => failNetwork(RESET), 'Không có kết nối mạng.'],
    [
      '400 không có trường mật khẩu',
      () =>
        fail(RESET, 400, {
          maLoi: 'DU_LIEU_KHONG_HOP_LE',
          loi: [{ truong: 'resetToken', ma: 'RESET_TOKEN_KHONG_HOP_LE' }],
        }),
      'Dữ liệu không hợp lệ.',
    ],
  ])(
    'QF-54 %s: ở lại, giữ dữ liệu, thử lại cùng token',
    async (_name, arrange, message) => {
      arrange();
      await toPasswordStep();
      fillPasswords();
      fireEvent.click(resetButton());
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(message);
      expect(alert).toHaveFocus();
      expect(newPassword().value).toBe(GOOD);
      fireEvent.click(resetButton());
      await screen.findByText('Mật khẩu đã được đặt lại!');
      expect(
        bodiesOf(RESET).map(
          (body) => (body as { resetToken: string }).resetToken,
        ),
      ).toEqual(['reset-1', 'reset-1']);
    },
  );

  it.each([
    [403, 'RESET_TOKEN_HET_HIEU_LUC', TOKEN_EXPIRED],
    [404, 'EMAIL_CHUA_DANG_KY', NOT_REGISTERED],
    [403, 'TAI_KHOAN_CHUA_KICH_HOAT', PENDING],
  ])(
    'QF-55 %i %s: về BƯỚC 1 kèm câu, giữ email, bỏ token',
    async (status, maLoi, message) => {
      fail(RESET, status, { maLoi });
      const router = await toPasswordStep();
      fillPasswords();
      fireEvent.click(resetButton());
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(message);
      expect(alert).toHaveFocus();
      expect(currentStep()).toHaveTextContent('Email');
      expect(emailInput().value).toBe('a@b.vn');
      expect(router.state.location.state).toStrictEqual({ email: 'a@b.vn' });
      // Lại từ đầu: mã mới, token mới; token cũ không bao giờ được gửi lại
      fireEvent.click(sendButton());
      await screen.findByLabelText('Chữ số thứ 1 trong 6');
      typeCode();
      fireEvent.click(nextButton());
      await screen.findByLabelText('Mật khẩu mới', { exact: true });
      fillPasswords();
      fireEvent.click(resetButton());
      await screen.findByText('Mật khẩu đã được đặt lại!');
      expect(
        bodiesOf(RESET).map(
          (body) => (body as { resetToken: string }).resetToken,
        ),
      ).toEqual(['reset-1', 'reset-2']);
    },
  );

  it('QF-56 bấm hai lần: một POST', async () => {
    await toPasswordStep();
    fillPasswords();
    const form = resetButton().closest('form') as HTMLFormElement;
    fireEvent.submit(form);
    fireEvent.submit(form);
    await screen.findByText('Mật khẩu đã được đặt lại!');
    expect(bodiesOf(RESET)).toHaveLength(1);
  });

  it('QF-57 Quay lại nhập mã: bỏ token, về bước 2 ô trống; nhập lại mã thì dùng token MỚI', async () => {
    await toPasswordStep();
    fireEvent.click(screen.getByRole('button', { name: '← Quay lại nhập mã' }));
    expect(currentStep()).toHaveTextContent('Mã OTP');
    expect(cell(1).value).toBe('');
    typeCode();
    fireEvent.click(nextButton());
    await screen.findByLabelText('Mật khẩu mới', { exact: true });
    fillPasswords();
    fireEvent.click(resetButton());
    await screen.findByText('Mật khẩu đã được đặt lại!');
    expect(bodiesOf(RESET)).toStrictEqual([
      { resetToken: 'reset-2', matKhauMoi: GOOD, xacNhan: GOOD },
    ]);
  });

  it('QF-58 Quay lại nhập mã, Gửi lại mã, nhập mã mới: token cũ không được dùng lại', async () => {
    fakeClock();
    await toPasswordStep();
    fireEvent.click(screen.getByRole('button', { name: '← Quay lại nhập mã' }));
    await advance(61_000);
    fireEvent.click(resendButton());
    await screen.findByText(RESENT);
    typeCode();
    fireEvent.click(nextButton());
    await screen.findByLabelText('Mật khẩu mới', { exact: true });
    fillPasswords();
    fireEvent.click(resetButton());
    await screen.findByText('Mật khẩu đã được đặt lại!');
    expect(bodiesOf(RESET)).toHaveLength(1);
    expect((bodiesOf(RESET)[0] as { resetToken: string }).resetToken).toBe(
      'reset-2',
    );
  });

  it('QF-60 Quay lại nhập mã sau 2 phút: đếm theo đồng hồ máy (08:00, Gửi lại bấm được), không đặt lại 10:00', async () => {
    fakeClock();
    await toPasswordStep();
    vi.setSystemTime(AT + 120_000);
    fireEvent.click(screen.getByRole('button', { name: '← Quay lại nhập mã' }));
    expect(screen.getByText('08:00')).toBeInTheDocument();
    expect(screen.queryByText('10:00')).toBeNull();
    expect(resendButton()).toBeEnabled();
  });

  it('QF-61 sửa ô Mật khẩu mới sau lỗi dưới ô: lỗi biến mất', async () => {
    const message =
      'Mật khẩu chỉ được dùng chữ không dấu, chữ số, dấu câu/ký hiệu và dấu cách.';
    await toPasswordStep();
    fillPasswords('Mậtkhẩu1!');
    fireEvent.click(resetButton());
    expect(await screen.findByText(message)).toBeInTheDocument();
    fireEvent.change(newPassword(), { target: { value: 'Matkhau1!' } });
    expect(screen.queryByText(message)).toBeNull();
    expect(newPassword()).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('QF-59 tải lại ở bước 3: token mất, về bước 2 nhập lại mã', async () => {
    const router = await toPasswordStep();
    await reload(router);
    expect(currentStep()).toHaveTextContent('Mã OTP');
    expect(cell(1).value).toBe('');
    expect(screen.queryByLabelText('Mật khẩu mới', { exact: true })).toBeNull();
  });
});

describe('Hoàn tất', () => {
  it('QF-70 QM-22 frame 652:2 hai cờ false: câu đăng nhập được, nút Đăng nhập mang email; không thanh bước; xoá token', async () => {
    const router = await toDone();
    expect(screen.getByText('Hoàn tất')).toBeInTheDocument();
    expect(screen.getByText(CAN_LOGIN)).toBeInTheDocument();
    expect(screen.queryByText(N7)).toBeNull();
    expect(screen.queryByText(N3)).toBeNull();
    expect(
      screen.queryByRole('list', { name: 'Các bước đặt lại mật khẩu' }),
    ).toBeNull();
    expect(router.state.location.state).toStrictEqual({
      stage: 'done',
      email: 'a@b.vn',
      taiKhoanNgung: false,
      canDangKyLai: false,
    });
    expectNoTokenOutsideMemory(router);
    fireEvent.click(screen.getByRole('link', { name: 'Đăng nhập' }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(LOGIN_PATH),
    );
    expect(router.state.location.state).toStrictEqual({ email: 'a@b.vn' });
    expect(
      (await screen.findByLabelText<HTMLInputElement>('Email')).value,
    ).toBe('a@b.vn');
  });

  it('QF-71 QM-19 N7 taiKhoanNgung: câu N7, KHÔNG câu đăng nhập được, KHÔNG nút Đăng nhập, chỉ liên kết Quay về đăng nhập (D11)', async () => {
    const router = await toDone({ taiKhoanNgung: true, canDangKyLai: false });
    expect(screen.getByRole('status')).toHaveTextContent(N7);
    expect(screen.queryByText(CAN_LOGIN)).toBeNull();
    expect(screen.queryByText(N3)).toBeNull();
    expect(screen.queryByRole('link', { name: 'Đăng nhập' })).toBeNull();
    fireEvent.click(screen.getByRole('link', { name: 'Quay về đăng nhập' }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(LOGIN_PATH),
    );
    expect(router.state.location.state).toStrictEqual({ email: 'a@b.vn' });
  });

  it('QF-72 QM-17 N3 canDangKyLai: câu N3, KHÔNG câu đăng nhập được, nút Đăng ký lại mang email', async () => {
    const router = await toDone({ taiKhoanNgung: false, canDangKyLai: true });
    expect(screen.getByRole('status')).toHaveTextContent(N3);
    expect(screen.queryByText(CAN_LOGIN)).toBeNull();
    expect(screen.queryByText(N7)).toBeNull();
    expect(screen.queryByRole('link', { name: 'Đăng nhập' })).toBeNull();
    fireEvent.click(screen.getByRole('link', { name: 'Đăng ký lại' }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(REGISTER_PATH),
    );
    expect(router.state.location.state).toStrictEqual({ email: 'a@b.vn' });
    expect(
      (await screen.findByLabelText<HTMLInputElement>('Email')).value,
    ).toBe('a@b.vn');
  });

  it('QF-73 hai cờ cùng true (API không trả được): câu ngưng thắng', async () => {
    await toDone({ taiKhoanNgung: true, canDangKyLai: true });
    expect(screen.getByRole('status')).toHaveTextContent(N7);
    expect(screen.queryByText(N3)).toBeNull();
  });

  it('QF-74 thân 200 lạ (cờ không phải boolean): khung bình thường', async () => {
    await toDone({ taiKhoanNgung: 'true', canDangKyLai: 1 });
    expect(screen.getByText(CAN_LOGIN)).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it.each([
    ['bình thường', { taiKhoanNgung: false, canDangKyLai: false }, CAN_LOGIN],
    ['ngưng', { taiKhoanNgung: true, canDangKyLai: false }, N7],
    ['chưa xác minh', { taiKhoanNgung: false, canDangKyLai: true }, N3],
  ])(
    'QF-75 D8 tải lại khung Hoàn tất (%s): vẫn thấy đúng câu, không gọi API',
    async (_name, flags, text) => {
      const router = await toDone(flags);
      const calls = api.requests.length;
      await reload(router);
      expect(await screen.findByText(text)).toBeInTheDocument();
      expect(api.requests).toHaveLength(calls);
    },
  );
});

describe('rời trang khi đang gửi (D13)', () => {
  // Rời bằng router (như bấm Back): trong lúc gửi, các nút trong thẻ đều khoá
  async function leaveAndRespond(
    router: ReturnType<typeof renderAt>,
    respond: (status: number, body: unknown) => void,
    status: number,
    body: unknown,
  ) {
    await act(async () => {
      await router.navigate(LOGIN_PATH);
    });
    await screen.findByLabelText('Email');
    respond(status, body);
    await settle();
    expect(router.state.location.pathname).toBe(LOGIN_PATH);
    expect(router.state.location.state).toBeNull();
  }

  it('QF-80 bước 1: 201 về sau khi đã rời trang', async () => {
    const respond = api.hold(REQUEST);
    const router = await renderForgot();
    fireEvent.change(emailInput(), { target: { value: 'a@b.vn' } });
    fireEvent.click(sendButton());
    await waitFor(() => expect(bodiesOf(REQUEST)).toHaveLength(1));
    await leaveAndRespond(router, respond, 201, api.nextForgotCode());
  });

  it('QF-81 bước 1: 503 về sau khi đã rời trang', async () => {
    const respond = api.hold(REQUEST);
    const router = await renderForgot();
    fireEvent.change(emailInput(), { target: { value: 'a@b.vn' } });
    fireEvent.click(sendButton());
    await waitFor(() => expect(bodiesOf(REQUEST)).toHaveLength(1));
    await leaveAndRespond(router, respond, 503, {
      maLoi: 'GUI_MAIL_LOI',
      thongBao: 'x',
      chiTiet: { coTheGuiLaiLuc: iso(60) },
    });
  });

  it('QF-82 bước 2: verify 200 về sau khi đã rời trang', async () => {
    const respond = api.hold(VERIFY);
    const router = await toCodeStep();
    typeCode();
    fireEvent.click(nextButton());
    await waitFor(() => expect(bodiesOf(VERIFY)).toHaveLength(1));
    await leaveAndRespond(router, respond, 200, {
      resetToken: 'reset-9',
      hetHanLuc: iso(600),
    });
  });

  it('QF-83 bước 2: Gửi lại 201 và 503 về sau khi đã rời trang', async () => {
    const respond = api.hold(RESEND);
    const router = await renderForgot({
      stage: 'code',
      email: 'a@b.vn',
      hetHanLuc: null,
      coTheGuiLaiLuc: null,
    });
    fireEvent.click(resendButton());
    await waitFor(() => expect(bodiesOf(RESEND)).toHaveLength(1));
    await leaveAndRespond(router, respond, 503, {
      maLoi: 'GUI_MAIL_LOI',
      thongBao: 'x',
      chiTiet: { coTheGuiLaiLuc: iso(60) },
    });
  });

  it('QF-84 bước 2: Gửi lại 201 về sau khi đã rời trang', async () => {
    const respond = api.hold(RESEND);
    const router = await renderForgot({
      stage: 'code',
      email: 'a@b.vn',
      hetHanLuc: null,
      coTheGuiLaiLuc: null,
    });
    fireEvent.click(resendButton());
    await waitFor(() => expect(bodiesOf(RESEND)).toHaveLength(1));
    await leaveAndRespond(router, respond, 201, api.nextForgotCode());
  });

  it('QF-85 bước 3: 200 và 403 token về sau khi đã rời trang', async () => {
    const respond = api.hold(RESET);
    const router = await toPasswordStep();
    fillPasswords();
    fireEvent.click(resetButton());
    await waitFor(() => expect(bodiesOf(RESET)).toHaveLength(1));
    await leaveAndRespond(router, respond, 200, {
      taiKhoanNgung: false,
      canDangKyLai: false,
    });
  });

  it('QF-86 bước 3: 403 RESET_TOKEN_HET_HIEU_LUC về sau khi đã rời trang', async () => {
    const respond = api.hold(RESET);
    const router = await toPasswordStep();
    fillPasswords();
    fireEvent.click(resetButton());
    await waitFor(() => expect(bodiesOf(RESET)).toHaveLength(1));
    await leaveAndRespond(router, respond, 403, {
      maLoi: 'RESET_TOKEN_HET_HIEU_LUC',
      thongBao: 'x',
    });
  });

  it('QF-87 bước 2: verify OTP_SAI về sau khi đã rời trang (không lỗi, không đổi trang)', async () => {
    const respond = api.hold(VERIFY);
    const router = await toCodeStep();
    typeCode();
    fireEvent.click(nextButton());
    await waitFor(() => expect(bodiesOf(VERIFY)).toHaveLength(1));
    await leaveAndRespond(router, respond, 400, {
      maLoi: 'OTP_SAI',
      thongBao: 'x',
    });
  });
});
