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
import { createFakeAuthApi } from '../../../test/fake-auth-api';
import { resetAuthForTest } from '../auth-session';
import { getAuthState, setAuthState } from '../auth-store';
import { LOGIN_PATH, REGISTER_PATH, VERIFY_EMAIL_PATH } from '../roles';

// Task F2. Mã ca RG-nn là [đề xuất]; ca nào phủ test case của PLAN thì ghi kèm mã đó.
const RULE =
  'Mật khẩu từ 8 đến 64 ký tự, gồm ít nhất một chữ số và một ký tự đặc biệt (ví dụ ! @ # $ % .).';
const GOOD = {
  hoTen: 'Nguyễn Văn A',
  email: 'a@b.vn',
  soDienThoai: '0901234567',
  matKhau: ' Matkhau@1 ',
  xacNhan: ' Matkhau@1 ',
};

let api: ReturnType<typeof createFakeAuthApi>;
let bodies: unknown[];

const fail = (status: number, body: Record<string, unknown>) =>
  api.failNext(
    '/auth/register',
    () =>
      new Response(JSON.stringify({ thongBao: 'CÂU CỦA API', ...body }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
  );

async function renderRegister(state?: unknown) {
  const router = createMemoryRouter(createAppRoutes(), {
    initialEntries: [{ pathname: REGISTER_PATH, state }],
  });
  render(<RouterProvider router={router} />);
  await screen.findByRole('heading', { name: 'Tạo tài khoản' });
  return router;
}

const input = (label: string) =>
  screen.getByLabelText<HTMLInputElement>(label, { exact: true });
const hoTen = () => input('Họ và tên');
const email = () => input('Email');
const phone = () => input('Số điện thoại');
const password = () => input('Mật khẩu');
const confirm = () => input('Xác nhận mật khẩu');
const submitButton = () =>
  screen.getByRole('button', { name: 'Tạo tài khoản' });

function fill(values: Partial<typeof GOOD> = {}) {
  const all = { ...GOOD, ...values };
  fireEvent.change(hoTen(), { target: { value: all.hoTen } });
  fireEvent.change(email(), { target: { value: all.email } });
  fireEvent.change(phone(), { target: { value: all.soDienThoai } });
  fireEvent.change(password(), { target: { value: all.matKhau } });
  fireEvent.change(confirm(), { target: { value: all.xacNhan } });
}

function submit(values?: Partial<typeof GOOD>) {
  fill(values);
  fireEvent.click(submitButton());
}

beforeEach(() => {
  resetAuthForTest();
  setAuthState({ status: 'unauthenticated' });
  api = createFakeAuthApi();
  bodies = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((target: RequestInfo | URL, init?: RequestInit) => {
      if (String(target).endsWith('/auth/register')) {
        bodies.push(JSON.parse(String(init?.body)));
      }
      return api.fetch(target, init);
    }),
  );
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
  it('RG-20 nhãn, autocomplete đúng, không có chữ demo (G3)', async () => {
    await renderRegister();
    expect(hoTen()).toHaveAttribute('autocomplete', 'name');
    expect(email()).toHaveAttribute('autocomplete', 'email');
    expect(phone()).toHaveAttribute('autocomplete', 'tel');
    expect(password()).toHaveAttribute('autocomplete', 'new-password');
    expect(confirm()).toHaveAttribute('autocomplete', 'new-password');
    expect(password()).toHaveAttribute('placeholder', 'Nhập mật khẩu');
    expect(document.body.textContent).not.toMatch(/demo|minh họa|Tối thiểu 8/i);
  });

  it('RG-21 nút hiện hoặc ẩn riêng cho từng ô mật khẩu', async () => {
    await renderRegister();
    const first = screen.getByRole('button', { name: 'Hiện mật khẩu' });
    const second = screen.getByRole('button', {
      name: 'Hiện xác nhận mật khẩu',
    });
    fireEvent.click(first);
    expect(password()).toHaveAttribute('type', 'text');
    expect(first).toHaveAttribute('aria-pressed', 'true');
    expect(confirm()).toHaveAttribute('type', 'password');
    fireEvent.click(second);
    expect(confirm()).toHaveAttribute('type', 'text');
    fireEvent.click(first);
    expect(password()).toHaveAttribute('type', 'password');
  });

  it('RG-22 D8 câu quy tắc gắn với ô; có lỗi thì chỉ còn câu lỗi', async () => {
    await renderRegister();
    expect(password()).toHaveAccessibleDescription(RULE);
    submit({ matKhau: 'Mậtkhẩu1!', xacNhan: 'Mậtkhẩu1!' });
    const error =
      'Mật khẩu chỉ được dùng chữ không dấu, chữ số, dấu câu/ký hiệu và dấu cách.';
    expect(await screen.findByText(error)).toBeInTheDocument();
    expect(screen.queryByText(RULE)).toBeNull();
    expect(password()).toHaveAccessibleDescription(error);
    expect(password()).toHaveAttribute('aria-invalid', 'true');
  });

  it('RG-23 liên kết Đăng nhập', async () => {
    await renderRegister();
    expect(screen.getByRole('link', { name: 'Đăng nhập' })).toHaveAttribute(
      'href',
      LOGIN_PATH,
    );
  });

  it('RG-24 điền sẵn từ state, state sai kiểu thì bỏ qua', async () => {
    await renderRegister({
      email: 'x@y.vn',
      hoTen: 'Tên',
      soDienThoai: 123,
      notice: 'Câu mang theo',
    });
    expect(email().value).toBe('x@y.vn');
    expect(hoTen().value).toBe('Tên');
    expect(phone().value).toBe('');
    expect(screen.getByRole('alert')).toHaveTextContent('Câu mang theo');
  });

  it('RG-25 đã đăng nhập thì về trang vai trò', async () => {
    setAuthState({
      status: 'authenticated',
      user: { vaiTro: 'BenhNhan', hoTen: 'A', daXacMinhEmail: true },
    });
    const router = createMemoryRouter(createAppRoutes(), {
      initialEntries: [REGISTER_PATH],
    });
    render(<RouterProvider router={router} />);
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/benh-nhan'),
    );
  });

  it('RG-26 đang kiểm phiên: hiện trạng thái tải, chưa có biểu mẫu', async () => {
    setAuthState({ status: 'checking' });
    const router = createMemoryRouter(createAppRoutes(), {
      initialEntries: [REGISTER_PATH],
    });
    render(<RouterProvider router={router} />);
    await waitFor(() => expect(router.state.initialized).toBe(true));
    expect(screen.queryByLabelText('Email')).toBeNull();
  });
});

describe('gửi', () => {
  it('RG-30 gửi đúng năm trường, mật khẩu không trim, sang màn nhập mã', async () => {
    const router = await renderRegister();
    submit();
    await screen.findByRole('heading', { name: 'Xác minh email' });
    expect(bodies).toEqual([GOOD]);
    expect(router.state.location.pathname).toBe(VERIFY_EMAIL_PATH);
    expect(router.state.historyAction).toBe('REPLACE');
    expect(getAuthState().user).toBeNull();
  });

  it('RG-31 mật khẩu không nằm trong state và kho nào', async () => {
    const router = await renderRegister();
    submit();
    await screen.findByRole('heading', { name: 'Xác minh email' });
    const stored = JSON.stringify([
      router.state.location.state,
      { ...sessionStorage },
      { ...localStorage },
    ]);
    expect(stored).not.toContain('Matkhau');
    expect(stored).not.toMatch(/matKhau|xacNhan/);
  });

  it('RG-32 chống gửi đúp', async () => {
    await renderRegister();
    fill();
    const form = submitButton().closest('form') as HTMLFormElement;
    fireEvent.submit(form);
    fireEvent.submit(form);
    await screen.findByRole('heading', { name: 'Xác minh email' });
    expect(bodies).toHaveLength(1);
  });

  it('RG-33 đang gửi thì nút vô hiệu', async () => {
    let release = () => {};
    api.failNext(
      '/auth/register',
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve(
              new Response(
                JSON.stringify({ maLoi: 'LOI_HE_THONG', thongBao: 'x' }),
                {
                  status: 500,
                  headers: { 'Content-Type': 'application/json' },
                },
              ),
            );
        }),
    );
    await renderRegister();
    submit();
    await waitFor(() => expect(submitButton()).toBeDisabled());
    await act(async () => {
      release();
      await Promise.resolve();
    });
    await screen.findByRole('alert');
    expect(submitButton()).toBeEnabled();
  });

  it('RG-34 Enter gửi biểu mẫu qua sự kiện submit, kiểm biên chặn POST', async () => {
    await renderRegister();
    fireEvent.submit(submitButton().closest('form') as HTMLFormElement);
    expect(await screen.findByText('Vui lòng nhập họ và tên.')).toBeVisible();
    expect(bodies).toHaveLength(0);
    expect(hoTen()).toHaveFocus();
  });
});

describe('DK-10 lỗi từng ô và giữ dữ liệu', () => {
  it('RG-40 lỗi API gán đúng ô, nhiều ô cùng lúc, giữ cả mật khẩu', async () => {
    fail(400, {
      maLoi: 'DU_LIEU_KHONG_HOP_LE',
      loi: [
        { truong: 'soDienThoai', ma: 'SDT_KHONG_HOP_LE' },
        { truong: 'email', ma: 'EMAIL_KHONG_HOP_LE' },
      ],
    });
    await renderRegister();
    submit();
    expect(await screen.findByText('Email không hợp lệ.')).toBeInTheDocument();
    expect(
      screen.getByText('Số điện thoại phải 10 số, bắt đầu bằng 0.'),
    ).toBeInTheDocument();
    expect(email()).toHaveFocus();
    expect(email()).toHaveAttribute('aria-invalid', 'true');
    expect(email()).toHaveAccessibleDescription('Email không hợp lệ.');
    expect(email().className).toContain('border-danger');
    expect(hoTen().value).toBe(GOOD.hoTen);
    expect(password().value).toBe(GOOD.matKhau);
    expect(confirm().value).toBe(GOOD.xacNhan);
  });

  it('RG-41 sửa ô thì lỗi biến mất', async () => {
    await renderRegister();
    submit({ hoTen: '' });
    await screen.findByText('Vui lòng nhập họ và tên.');
    fireEvent.change(hoTen(), { target: { value: 'A' } });
    expect(screen.queryByText('Vui lòng nhập họ và tên.')).toBeNull();
  });

  it('RG-42 xác nhận không khớp không gửi', async () => {
    await renderRegister();
    submit({ xacNhan: 'Khác@1234' });
    expect(
      await screen.findByText('Mật khẩu xác nhận không khớp.'),
    ).toBeInTheDocument();
    expect(confirm()).toHaveFocus();
    expect(bodies).toHaveLength(0);
  });

  it('RG-43 lỗi mạng giữ dữ liệu, không tự thử lại', async () => {
    api.failNext('/auth/register', () => Promise.reject(new TypeError('net')));
    await renderRegister();
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không có kết nối mạng.',
    );
    expect(screen.getByRole('alert')).toHaveFocus();
    expect(screen.getByRole('alert')).toHaveAttribute('tabindex', '-1');
    expect(password().value).toBe(GOOD.matKhau);
    expect(bodies).toHaveLength(1);
  });
});

describe('lịch sử trình duyệt', () => {
  // Xác nhận qua Back thật: màn nhập mã tự `replace` state nên `historyAction` luôn là REPLACE dù bước trước có đẩy lịch sử
  async function submitFromSecondEntry() {
    const router = createMemoryRouter(createAppRoutes(), {
      initialEntries: ['/khong-co', REGISTER_PATH],
      initialIndex: 1,
    });
    render(<RouterProvider router={router} />);
    await screen.findByRole('heading', { name: 'Tạo tài khoản' });
    submit();
    await screen.findByRole('heading', { name: 'Xác minh email' });
    return router;
  }

  async function expectBackSkipsForm(router: {
    navigate(to: number): Promise<void>;
    state: { historyAction: string; location: { pathname: string } };
  }) {
    expect(router.state.historyAction).toBe('REPLACE');
    await act(async () => {
      await router.navigate(-1);
    });
    expect(router.state.location.pathname).toBe('/khong-co');
  }

  it('RG-60 201: thay chỗ biểu mẫu trong lịch sử, Back không quay về', async () => {
    await expectBackSkipsForm(await submitFromSecondEntry());
  });

  it('RG-61 503: thay chỗ biểu mẫu trong lịch sử, Back không quay về', async () => {
    fail(503, {
      maLoi: 'GUI_MAIL_LOI',
      chiTiet: {
        maXacThucId: '77',
        coTheGuiLaiLuc: new Date(Date.now() + 60_000).toISOString(),
      },
    });
    await expectBackSkipsForm(await submitFromSecondEntry());
  });

  it('RG-62 email có khoảng trắng hai đầu: state đã cắt', async () => {
    // `input type=email` tự cắt ở `value` khi gõ (happy-dom và trình duyệt), nên `change` không tạo được ca này;
    // chỉ giá trị mang từ `location.state` mới giữ khoảng trắng trong state của biểu mẫu
    const router = await renderRegister({ email: '  a@b.vn 	' });
    fireEvent.change(hoTen(), { target: { value: GOOD.hoTen } });
    fireEvent.change(phone(), { target: { value: GOOD.soDienThoai } });
    fireEvent.change(password(), { target: { value: GOOD.matKhau } });
    fireEvent.change(confirm(), { target: { value: GOOD.xacNhan } });
    fireEvent.click(submitButton());
    await screen.findByRole('heading', { name: 'Xác minh email' });
    expect(router.state.location.state).toMatchObject({
      email: 'a@b.vn',
      draft: { email: 'a@b.vn' },
    });
  });
});

describe('lỗi nghiệp vụ', () => {
  it('RG-50 DK-11 EMAIL_DA_DUNG: câu kèm liên kết đăng nhập mang email', async () => {
    fail(409, { maLoi: 'EMAIL_DA_DUNG' });
    const router = await renderRegister();
    submit({ email: ' a@b.vn ' });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Email này đã được sử dụng. Vui lòng đăng nhập.',
    );
    expect(alert).not.toHaveTextContent('CÂU CỦA API');
    const links = screen.getAllByRole('link', { name: 'Đăng nhập' });
    fireEvent.click(links[0]);
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(LOGIN_PATH),
    );
    expect(router.state.location.state).toEqual({ email: 'a@b.vn' });
  });

  it('RG-51 429: câu chữ, đếm, khoá nút, hết giờ mở lại', async () => {
    fail(429, { maLoi: 'GUI_LAI_QUA_SOM', chiTiet: { soGiayCho: 90 } });
    await renderRegister();
    vi.useFakeTimers({
      toFake: ['setInterval', 'clearInterval', 'performance'],
    });
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Vui lòng thử lại sau.',
    );
    expect(screen.getByText('01:30')).toBeInTheDocument();
    expect(submitButton()).toBeDisabled();
    fireEvent.submit(submitButton().closest('form') as HTMLFormElement);
    expect(bodies).toHaveLength(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(90_500);
    });
    expect(submitButton()).toBeEnabled();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(password().value).toBe(GOOD.matKhau);
  });

  it('RG-54 429: gõ vào ô vẫn giữ hộp và số đếm, nút vẫn khoá; hết giờ thì nút mở, hộp mất', async () => {
    fail(429, { maLoi: 'GUI_LAI_QUA_SOM', chiTiet: { soGiayCho: 90 } });
    await renderRegister();
    vi.useFakeTimers({
      toFake: ['setInterval', 'clearInterval', 'performance'],
    });
    submit();
    await screen.findByRole('alert');
    fireEvent.change(hoTen(), { target: { value: 'Tên khác' } });
    fireEvent.change(password(), { target: { value: 'Khac@1234' } });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Vui lòng thử lại sau.',
    );
    expect(screen.getByText('01:30')).toBeInTheDocument();
    expect(submitButton()).toBeDisabled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(90_500);
    });
    expect(submitButton()).toBeEnabled();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/^\d\d:\d\d$/)).toBeNull();
  });

  it('RG-52 DK-48 503 GUI_MAIL_LOI: sang màn nhập mã, không tự thử lại', async () => {
    fail(503, {
      maLoi: 'GUI_MAIL_LOI',
      chiTiet: {
        maXacThucId: '77',
        coTheGuiLaiLuc: new Date(Date.now() + 60_000).toISOString(),
      },
    });
    const router = await renderRegister();
    submit();
    await screen.findByRole('heading', { name: 'Xác minh email' });
    expect(
      await screen.findByText(
        'Không gửi được email. Vui lòng thử lại sau ít phút.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Không có kết nối mạng/)).toBeNull();
    expect(router.state.location.state).toMatchObject({
      verifyId: null,
      resendId: '77',
    });
    expect(bodies).toHaveLength(1);
    expect(screen.getByLabelText('Chữ số thứ 1 trong 6')).toBeDisabled();
  });
});
