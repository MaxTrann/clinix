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

// Task F2. Mã ca OT-nn là [đề xuất]; ca nào phủ test case của PLAN thì ghi kèm mã đó.
const AT = Date.parse('2026-11-02T10:00:00.000Z');
const iso = (seconds: number) => new Date(AT + seconds * 1000).toISOString();

let api: ReturnType<typeof createFakeAuthApi>;
let verifyBodies: Record<string, unknown>[];
let resendBodies: Record<string, unknown>[];

const VERIFY = '/auth/register/verify-otp';
const RESEND = '/auth/register/resend-otp';

const respond = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify({ thongBao: 'CÂU CỦA API', ...body }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
const fail = (path: string, status: number, body: Record<string, unknown>) =>
  api.failNext(path, () => respond(status, body));

const pending = (extra: object = {}) => ({
  email: 'a@b.vn',
  verifyId: '10',
  resendId: '10',
  hetHanLuc: iso(600),
  coTheGuiLaiLuc: iso(60),
  fresh: true,
  notice: null,
  draft: { hoTen: 'Tên', email: 'a@b.vn', soDienThoai: '0901234567' },
  ...extra,
});

function renderAt(state?: unknown) {
  const router = createMemoryRouter(createAppRoutes(), {
    initialEntries: [{ pathname: VERIFY_EMAIL_PATH, state }],
  });
  render(<RouterProvider router={router} />);
  return router;
}

async function renderVerify(state: unknown = pending()) {
  const router = renderAt(state);
  await screen.findByRole('heading', { name: 'Xác minh email' });
  return router;
}

const cell = (n: number) =>
  screen.getByLabelText<HTMLInputElement>(`Chữ số thứ ${n} trong 6`);
const verifyButton = () => screen.getByRole('button', { name: 'Xác minh' });
const resendButton = () => screen.getByRole('button', { name: 'Gửi lại mã' });
const typeCode = (code = '012345') =>
  fireEvent.paste(cell(1), { clipboardData: { getData: () => code } });

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

// Giả cả `Date` và `performance`. Giữ `queueMicrotask`, `setTimeout` thật để promise và router chạy được.
function fakeClock() {
  vi.useFakeTimers({
    now: AT,
    toFake: ['setInterval', 'clearInterval', 'performance', 'Date'],
  });
}

beforeEach(() => {
  resetAuthForTest();
  setAuthState({ status: 'unauthenticated' });
  api = createFakeAuthApi();
  verifyBodies = [];
  resendBodies = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((target: RequestInfo | URL, init?: RequestInit) => {
      const url = String(target);
      if (url.endsWith(VERIFY))
        verifyBodies.push(JSON.parse(String(init?.body)));
      if (url.endsWith(RESEND))
        resendBodies.push(JSON.parse(String(init?.body)));
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

describe('vào trang', () => {
  it('OT-50 không có state: về /dang-ky bằng replace', async () => {
    const router = renderAt();
    await screen.findByRole('heading', { name: 'Tạo tài khoản' });
    expect(router.state.location.pathname).toBe(REGISTER_PATH);
    expect(router.state.historyAction).toBe('REPLACE');
    expect(router.state.location.state).toBeNull();
  });

  it('OT-51 state thiếu id mà có email: về /dang-ky, điền sẵn email', async () => {
    renderAt({ email: 'x@y.vn' });
    await screen.findByRole('heading', { name: 'Tạo tài khoản' });
    expect(screen.getByLabelText<HTMLInputElement>('Email').value).toBe(
      'x@y.vn',
    );
  });

  it('OT-52 đã đăng nhập thì về trang vai trò', async () => {
    setAuthState({
      status: 'authenticated',
      user: { vaiTro: 'BenhNhan', hoTen: 'A', daXacMinhEmail: true },
    });
    const router = renderAt(pending());
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/benh-nhan'),
    );
  });

  it('OT-55 đang kiểm phiên: chưa quyết định chuyển trang', async () => {
    setAuthState({ status: 'checking' });
    const router = renderAt(pending());
    await waitFor(() => expect(router.state.initialized).toBe(true));
    expect(router.state.location.pathname).toBe(VERIFY_EMAIL_PATH);
    expect(screen.queryByLabelText('Chữ số thứ 1 trong 6')).toBeNull();
  });

  it('OT-53 hiện email, không có chữ demo (G3), không lộ mã', async () => {
    await renderVerify();
    expect(
      screen.getByText('Nhập mã 6 chữ số được gửi đến a@b.vn'),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/demo|thử nghiệm/i);
  });

  it('OT-54 tải lại sau khi xác minh: vẫn thấy màn thành công', async () => {
    renderAt({ verified: true, email: 'a@b.vn' });
    expect(
      await screen.findByRole('heading', { name: 'Xác minh thành công' }),
    ).toBeInTheDocument();
  });
});

describe('xác minh', () => {
  it('OT-60 otp là chuỗi giữ số 0 đầu, thân đúng ba trường', async () => {
    await renderVerify();
    typeCode('012345');
    fireEvent.click(verifyButton());
    await screen.findByRole('heading', { name: 'Xác minh thành công' });
    expect(verifyBodies).toEqual([
      { email: 'a@b.vn', maXacThucId: '10', otp: '012345' },
    ]);
    expect(typeof verifyBodies[0].otp).toBe('string');
  });

  it('OT-61 chưa đủ 6 số: nút vô hiệu, Enter không gọi API, không tự gửi khi đủ', async () => {
    await renderVerify();
    typeCode('12345');
    expect(verifyButton()).toBeDisabled();
    fireEvent.submit(verifyButton().closest('form') as HTMLFormElement);
    typeCode('123456');
    await act(async () => {
      await Promise.resolve();
    });
    expect(verifyBodies).toHaveLength(0);
    expect(verifyButton()).toBeEnabled();
  });

  it('OT-62 bấm hai lần chỉ một POST', async () => {
    await renderVerify();
    typeCode();
    const form = verifyButton().closest('form') as HTMLFormElement;
    fireEvent.submit(form);
    fireEvent.submit(form);
    await screen.findByRole('heading', { name: 'Xác minh thành công' });
    expect(verifyBodies).toHaveLength(1);
  });

  it('OT-63 thành công: màn 649, không có phiên, state chỉ còn verified và email', async () => {
    const router = await renderVerify();
    typeCode();
    fireEvent.click(verifyButton());
    await screen.findByText('Email đã được xác minh!');
    expect(getAuthState().user).toBeNull();
    expect(api.requests.some(({ path }) => path === '/auth/login')).toBe(false);
    expect(router.state.location.state).toEqual({
      verified: true,
      email: 'a@b.vn',
    });
  });

  it('OT-64 nút Đăng nhập mang email, đăng nhập điền sẵn', async () => {
    const router = renderAt({ verified: true, email: 'a@b.vn' });
    fireEvent.click(await screen.findByRole('link', { name: 'Đăng nhập' }));
    await screen.findByRole('heading', { name: 'Đăng nhập' });
    expect(router.state.location.pathname).toBe(LOGIN_PATH);
    expect(screen.getByLabelText<HTMLInputElement>('Email').value).toBe(
      'a@b.vn',
    );
  });

  it('OT-65 DK-46 OTP_SAI: câu, xoá ô, focus ô đầu, nhập lại được', async () => {
    fail(VERIFY, 400, { maLoi: 'OTP_SAI' });
    await renderVerify();
    typeCode();
    fireEvent.click(verifyButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Mã OTP không đúng. Vui lòng kiểm tra lại.',
    );
    expect(cell(1).value).toBe('');
    expect(cell(1)).toHaveFocus();
    expect(cell(1)).toHaveAttribute('aria-invalid', 'true');
    expect(cell(1)).toBeEnabled();
    typeCode();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each([
    ['OTP_HET_HAN', 'Mã OTP đã hết hạn. Vui lòng bấm "Gửi lại mã".'],
    [
      'OTP_HET_LUOT',
      'Bạn đã nhập sai quá 5 lần. Mã đã bị vô hiệu, vui lòng bấm "Gửi lại mã".',
    ],
  ])('OT-66 DK-46 %s: khoá ô, còn Gửi lại mã', async (maLoi, message) => {
    fail(VERIFY, 400, { maLoi });
    await renderVerify(pending({ fresh: false, coTheGuiLaiLuc: null }));
    typeCode();
    fireEvent.click(verifyButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(cell(1)).toBeDisabled();
    expect(verifyButton()).toBeDisabled();
    expect(resendButton()).toBeEnabled();
    fireEvent.submit(verifyButton().closest('form') as HTMLFormElement);
    expect(verifyBodies).toHaveLength(1);
  });

  it.each([
    [
      'OTP_BI_THAY_THE',
      'Yêu cầu xác minh này đã được thay bằng lần đăng ký mới hơn. Vui lòng đăng ký lại.',
    ],
    [
      'CAN_DANG_KY_LAI',
      'Yêu cầu xác minh không còn hiệu lực. Vui lòng đăng ký lại bằng email này.',
    ],
  ])('OT-67 %s: về đăng ký, điền sẵn, kèm câu', async (maLoi, message) => {
    fail(VERIFY, 409, { maLoi });
    const router = await renderVerify();
    typeCode();
    fireEvent.click(verifyButton());
    await screen.findByRole('heading', { name: 'Tạo tài khoản' });
    expect(router.state.location.pathname).toBe(REGISTER_PATH);
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(screen.getByLabelText<HTMLInputElement>('Email').value).toBe(
      'a@b.vn',
    );
    expect(screen.getByLabelText<HTMLInputElement>('Họ và tên').value).toBe(
      'Tên',
    );
  });

  it('OT-68 TAI_KHOAN_NGUNG: không cho thử lại, không cho gửi lại', async () => {
    fail(VERIFY, 403, { maLoi: 'TAI_KHOAN_NGUNG' });
    await renderVerify(pending({ fresh: false, coTheGuiLaiLuc: null }));
    typeCode();
    fireEvent.click(verifyButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Tài khoản đã bị ngưng hoạt động. Vui lòng liên hệ quản trị viên.',
    );
    expect(cell(1)).toBeDisabled();
    expect(resendButton()).toBeDisabled();
    fireEvent.click(resendButton());
    expect(resendBodies).toHaveLength(0);
  });

  it('OT-69 lỗi mạng: giữ số đã nhập, không tự thử lại', async () => {
    api.failNext(VERIFY, () => Promise.reject(new TypeError('net')));
    await renderVerify();
    typeCode('123456');
    fireEvent.click(verifyButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không có kết nối mạng.',
    );
    expect(screen.getByRole('alert')).toHaveFocus();
    expect(cell(6).value).toBe('6');
    expect(verifyBodies).toHaveLength(1);
  });
});

describe('đếm ngược', () => {
  it('OT-70 DK-46 phản hồi mới: 10:00 và khoá Gửi lại 60 giây, số giảm theo giờ', async () => {
    fakeClock();
    await renderVerify();
    expect(screen.getByText('10:00')).toBeInTheDocument();
    expect(resendButton()).toBeDisabled();
    expect(resendButton()).toHaveTextContent('Gửi lại sau 60s');
    await advance(59_000);
    expect(screen.getByText('09:01')).toBeInTheDocument();
    expect(resendButton()).toBeDisabled();
    await advance(1_500);
    expect(resendButton()).toBeEnabled();
    expect(resendButton()).toHaveTextContent('Gửi lại mã');
    expect(screen.getByText('Bạn có thể gửi lại mã.')).toBeInTheDocument();
  });

  it('OT-71 phản hồi mới không phụ thuộc đồng hồ máy lệch 1 giờ', async () => {
    fakeClock();
    vi.setSystemTime(AT + 3_600_000);
    await renderVerify();
    expect(screen.getByText('10:00')).toBeInTheDocument();
    expect(resendButton()).toHaveTextContent('Gửi lại sau 60s');
  });

  it('OT-72 tải lại trang: theo đồng hồ máy có kẹp', async () => {
    fakeClock();
    vi.setSystemTime(AT + 120_000);
    await renderVerify(pending({ fresh: false }));
    expect(screen.getByText('08:00')).toBeInTheDocument();
    expect(resendButton()).toBeEnabled();
  });

  it('OT-73 sau lần đầu state hết `fresh`, tải lại không tính lại từ đầu', async () => {
    const router = await renderVerify();
    await waitFor(() =>
      expect(router.state.location.state).toMatchObject({ fresh: false }),
    );
    expect(router.state.location.state).toMatchObject({
      verifyId: '10',
      resendId: '10',
    });
  });

  it('OT-74 hết hạn: báo hết hạn, vẫn nhập được và Gửi lại được', async () => {
    fakeClock();
    await renderVerify();
    await advance(600_500);
    expect(
      screen.getByText('Mã đã hết hạn. Vui lòng gửi lại.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Mã đã hết hạn.')).toHaveClass('sr-only');
    expect(cell(1)).toBeEnabled();
    expect(resendButton()).toBeEnabled();
  });

  it('OT-75 số đếm nằm ngoài vùng đọc màn hình', async () => {
    fakeClock();
    await renderVerify();
    expect(screen.getByText('10:00').closest('[aria-hidden]')).not.toBeNull();
    expect(resendButton()).toHaveAccessibleName('Gửi lại mã');
  });

  it('OT-102 tải lại trước mốc Gửi lại: nút khoá theo coTheGuiLaiLuc', async () => {
    fakeClock();
    vi.setSystemTime(AT + 20_000);
    await renderVerify(pending({ fresh: false }));
    expect(resendButton()).toBeDisabled();
    expect(resendButton()).toHaveTextContent('Gửi lại sau 40s');
  });

  it('OT-103 tải lại khi đồng hồ máy chậm 1 giờ: kẹp ở 10:00', async () => {
    fakeClock();
    vi.setSystemTime(AT - 3_600_000);
    await renderVerify(pending({ fresh: false }));
    expect(screen.getByText('10:00')).toBeInTheDocument();
  });

  it('OT-104 hết hạn: không còn dòng "Mã hết hạn sau"', async () => {
    fakeClock();
    await renderVerify();
    await advance(600_500);
    expect(screen.queryByText(/Mã hết hạn sau/)).toBeNull();
  });

  it('OT-105 chưa có mã (503 lúc đăng ký): không hiện dòng hạn mã', async () => {
    fakeClock();
    await renderVerify(
      pending({ verifyId: null, resendId: '77', hetHanLuc: null }),
    );
    expect(screen.queryByText(/Mã hết hạn sau/)).toBeNull();
    expect(screen.queryByText(/Mã có hiệu lực/)).toBeNull();
  });

  it('OT-76 rời trang: dọn hết hẹn giờ', async () => {
    fakeClock();
    await renderVerify();
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('link', { name: '← Quay lại đăng ký' }));
    await screen.findByRole('heading', { name: 'Tạo tài khoản' });
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('Gửi lại mã', () => {
  const ready = () => pending({ fresh: false, coTheGuiLaiLuc: null });

  it('OT-80 gửi đúng id đang giữ, THAY id mới, đặt lại hai bộ đếm', async () => {
    const router = await renderVerify(ready());
    fireEvent.click(resendButton());
    await screen.findByText('Đã gửi mã mới đến email của bạn.');
    expect(resendBodies).toEqual([{ email: 'a@b.vn', maXacThucId: '10' }]);
    expect(router.state.location.state).toMatchObject({
      verifyId: '101',
      resendId: '101',
      fresh: false,
    });
    expect(resendButton()).toHaveTextContent('Gửi lại sau 60s');
    expect(screen.getByText('10:00')).toBeInTheDocument();

    typeCode();
    fireEvent.click(verifyButton());
    await screen.findByRole('heading', { name: 'Xác minh thành công' });
    expect(verifyBodies[0].maXacThucId).toBe('101');
  });

  it('OT-81 sau hai lần gửi dùng id mới nhất', async () => {
    fakeClock();
    await renderVerify(ready());
    fireEvent.click(resendButton());
    await screen.findByText('Đã gửi mã mới đến email của bạn.');
    await advance(61_000);
    fireEvent.click(resendButton());
    await waitFor(() => expect(resendBodies).toHaveLength(2));
    expect(resendBodies[1].maXacThucId).toBe('101');
  });

  it('OT-82 mở lại ô sau mã chết, xoá số, focus ô đầu', async () => {
    fail(VERIFY, 400, { maLoi: 'OTP_HET_LUOT' });
    await renderVerify(ready());
    typeCode();
    fireEvent.click(verifyButton());
    await screen.findByRole('alert');
    fireEvent.click(resendButton());
    await screen.findByText('Đã gửi mã mới đến email của bạn.');
    expect(cell(1)).toBeEnabled();
    expect(cell(1).value).toBe('');
    await waitFor(() => expect(cell(1)).toHaveFocus());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('OT-83 khoá 60 giây: bấm không gọi API', async () => {
    await renderVerify();
    fireEvent.click(resendButton());
    expect(resendBodies).toHaveLength(0);
  });

  it('OT-96 bấm Gửi lại hai lần liền: một POST', async () => {
    await renderVerify(ready());
    const button = resendButton();
    // Hai lần bấm trong một lượt: state chưa kịp render nên chỉ ref chặn được
    act(() => {
      button.click();
      button.click();
    });
    await screen.findByText('Đã gửi mã mới đến email của bạn.');
    expect(resendBodies).toHaveLength(1);
  });

  it('OT-84 429: đếm theo soGiayCho', async () => {
    fakeClock();
    fail(RESEND, 429, { maLoi: 'GUI_LAI_QUA_SOM', chiTiet: { soGiayCho: 33 } });
    await renderVerify(ready());
    fireEvent.click(resendButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Vui lòng thử lại sau.',
    );
    expect(resendButton()).toHaveTextContent('Gửi lại sau 33s');
  });

  it('OT-85 DK-48 503: giữ id xác minh cũ, id gửi lại đổi sang hàng lỗi, không tự thử lại', async () => {
    fakeClock();
    fail(RESEND, 503, {
      maLoi: 'GUI_MAIL_LOI',
      chiTiet: { maXacThucId: '77', coTheGuiLaiLuc: iso(60) },
    });
    const router = await renderVerify(ready());
    fireEvent.click(resendButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không gửi được email. Vui lòng thử lại sau ít phút.',
    );
    expect(router.state.location.state).toMatchObject({
      verifyId: '10',
      resendId: '77',
    });
    expect(resendBodies).toHaveLength(1);
    expect(resendButton()).toHaveTextContent('Gửi lại sau 60s');

    await advance(61_000);
    fireEvent.click(resendButton());
    await waitFor(() => expect(resendBodies).toHaveLength(2));
    expect(resendBodies[1].maXacThucId).toBe('77');
  });

  it('OT-86 sau 503 mã cũ vẫn xác minh bằng id cũ', async () => {
    fail(RESEND, 503, {
      maLoi: 'GUI_MAIL_LOI',
      chiTiet: { maXacThucId: '77', coTheGuiLaiLuc: iso(60) },
    });
    await renderVerify(ready());
    fireEvent.click(resendButton());
    await screen.findByRole('alert');
    typeCode();
    fireEvent.click(verifyButton());
    await screen.findByRole('heading', { name: 'Xác minh thành công' });
    expect(verifyBodies[0].maXacThucId).toBe('10');
  });

  it('OT-87 503 ngay lúc đăng ký: chưa có mã nên khoá ô, gửi lại xong mới nhập', async () => {
    fakeClock();
    await renderVerify(
      pending({
        verifyId: null,
        resendId: '77',
        hetHanLuc: null,
        fresh: true,
        notice: 'Không gửi được email. Vui lòng thử lại sau ít phút.',
      }),
    );
    expect(cell(1)).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Không gửi được email',
    );
    await advance(61_000);
    fireEvent.click(resendButton());
    await screen.findByText('Đã gửi mã mới đến email của bạn.');
    expect(resendBodies[0].maXacThucId).toBe('77');
    expect(cell(1)).toBeEnabled();
  });

  it.each([
    [409, 'CAN_DANG_KY_LAI'],
    [400, 'OTP_SAI'],
  ])('OT-88 DK-50 gửi lại bị %i %s: về đăng ký', async (status, maLoi) => {
    fail(RESEND, status, { maLoi });
    const router = await renderVerify(ready());
    fireEvent.click(resendButton());
    await screen.findByRole('heading', { name: 'Tạo tài khoản' });
    expect(router.state.location.state).toMatchObject({
      email: 'a@b.vn',
      notice:
        'Yêu cầu xác minh không còn hiệu lực. Vui lòng đăng ký lại bằng email này.',
    });
  });

  it('OT-89 gửi lại lỗi mạng: id giữ nguyên, không tự thử lại', async () => {
    api.failNext(RESEND, () => Promise.reject(new TypeError('net')));
    const router = await renderVerify(ready());
    fireEvent.click(resendButton());
    await screen.findByRole('alert');
    expect(resendBodies).toHaveLength(1);
    expect(router.state.location.state).toMatchObject({ resendId: '10' });
  });
});

describe('bàn giao từ đăng nhập (N2)', () => {
  const handoff = (trangThaiMa: string) => ({
    email: 'a@b.vn',
    chiTiet: {
      maXacThucId: '42',
      trangThaiMa,
      hetHanLuc: new Date(Date.now() + 120_000).toISOString(),
    },
  });

  it('OT-90 ConHan: câu chưa xác minh, nhập mã bằng id đó, không tự gửi thư', async () => {
    await renderVerify(handoff('ConHan'));
    expect(screen.getByRole('status')).toHaveTextContent(
      'Email của bạn chưa được xác minh. Nhập mã OTP đã nhận hoặc bấm "Gửi lại mã".',
    );
    expect(resendBodies).toHaveLength(0);
    expect(resendButton()).toBeEnabled();
    typeCode();
    fireEvent.click(verifyButton());
    await screen.findByRole('heading', { name: 'Xác minh thành công' });
    expect(verifyBodies[0]).toEqual({
      email: 'a@b.vn',
      maXacThucId: '42',
      otp: '012345',
    });
  });

  it.each([
    ['HetHan', 'Mã OTP đã hết hạn.'],
    ['DaThuHoi', 'Mã OTP đã bị thu hồi.'],
    ['ChuaGui', 'Mã OTP chưa được gửi.'],
  ])(
    'OT-91 %s: nói rõ, khoá ô, không gọi API, gửi lại bằng id đó',
    async (status, text) => {
      await renderVerify(handoff(status));
      expect(screen.getByRole('status')).toHaveTextContent(text);
      expect(cell(1)).toBeDisabled();
      expect(verifyBodies).toHaveLength(0);
      expect(resendBodies).toHaveLength(0);
      fireEvent.submit(verifyButton().closest('form') as HTMLFormElement);
      expect(verifyBodies).toHaveLength(0);
      fireEvent.click(resendButton());
      await screen.findByText('Đã gửi mã mới đến email của bạn.');
      expect(resendBodies).toEqual([{ email: 'a@b.vn', maXacThucId: '42' }]);
      expect(screen.queryByText(text, { exact: false })).toBeNull();
    },
  );

  it('OT-92 "Quay lại đăng ký" từ bàn giao mang email, không draft', async () => {
    const router = await renderVerify(handoff('ConHan'));
    fireEvent.click(screen.getByRole('link', { name: '← Quay lại đăng ký' }));
    await screen.findByRole('heading', { name: 'Tạo tài khoản' });
    expect(router.state.location.state).toEqual({ email: 'a@b.vn' });
  });
});

describe('quay lại', () => {
  it('OT-95 giữ họ tên, email, SĐT; mật khẩu phải nhập lại', async () => {
    await renderVerify();
    fireEvent.click(screen.getByRole('link', { name: '← Quay lại đăng ký' }));
    await screen.findByRole('heading', { name: 'Tạo tài khoản' });
    expect(screen.getByLabelText<HTMLInputElement>('Họ và tên').value).toBe(
      'Tên',
    );
    expect(screen.getByLabelText<HTMLInputElement>('Số điện thoại').value).toBe(
      '0901234567',
    );
    expect(screen.getByLabelText<HTMLInputElement>('Mật khẩu').value).toBe('');
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

// D13: rời trang khi xác minh hoặc gửi lại còn đang bay thì phản hồi về sau không được đổi trang hay state
describe('rời trang khi đang gửi (D13)', () => {
  const draft = { hoTen: 'Tên', email: 'a@b.vn', soDienThoai: '0901234567' };
  const leave = async () => {
    fireEvent.click(screen.getByRole('link', { name: '← Quay lại đăng ký' }));
    await screen.findByRole('heading', { name: 'Tạo tài khoản' });
  };

  it('OT-97 xác minh 200 về sau khi đã sang Đăng ký: vẫn ở Đăng ký, state không đổi', async () => {
    const respond = api.hold(VERIFY);
    const router = await renderVerify();
    typeCode();
    fireEvent.click(verifyButton());
    await waitFor(() => expect(verifyBodies).toHaveLength(1));
    await leave();
    respond(200, { daXacMinh: true });
    await settle(router);
    expect(router.state.location.pathname).toBe(REGISTER_PATH);
    expect(router.state.location.state).toStrictEqual(draft);
  });

  it('OT-101 xác minh CAN_DANG_KY_LAI về sau khi đã sang Đăng ký: state không bị thay bằng câu thông báo', async () => {
    const respond = api.hold(VERIFY);
    const router = await renderVerify();
    typeCode();
    fireEvent.click(verifyButton());
    await waitFor(() => expect(verifyBodies).toHaveLength(1));
    await leave();
    respond(409, { maLoi: 'CAN_DANG_KY_LAI', thongBao: 'CÂU CỦA API' });
    await settle(router);
    expect(router.state.location.state).toStrictEqual(draft);
    expect(router.state.historyAction).toBe('PUSH');
  });

  it.each([
    ['OT-98 201', 201, () => api.nextCode()],
    [
      'OT-99 503',
      503,
      () => ({
        maLoi: 'GUI_MAIL_LOI',
        thongBao: 'CÂU CỦA API',
        chiTiet: { maXacThucId: '11', coTheGuiLaiLuc: iso(60) },
      }),
    ],
    [
      'OT-100 OTP_SAI',
      400,
      () => ({ maLoi: 'OTP_SAI', thongBao: 'CÂU CỦA API' }),
    ],
  ])(
    '%s gửi lại về sau khi đã sang Đăng ký: vẫn ở Đăng ký, state không đổi',
    async (_name, status, body) => {
      fakeClock();
      const respond = api.hold(RESEND);
      const router = await renderVerify(
        pending({ fresh: false, coTheGuiLaiLuc: iso(-1) }),
      );
      fireEvent.click(resendButton());
      await waitFor(() => expect(resendBodies).toHaveLength(1));
      await leave();
      respond(status, body());
      await settle(router);
      expect(router.state.location.pathname).toBe(REGISTER_PATH);
      expect(router.state.location.state).toStrictEqual(draft);
    },
  );
});
