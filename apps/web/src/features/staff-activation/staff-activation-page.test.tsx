import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { setApiAuthHooks } from '../../shared/api/auth-hooks';
import { resetAuthForTest } from '../auth/auth-session';
import { setAccessToken, setAuthState } from '../auth/auth-store';
import { LOGIN_PATH } from '../auth';
import type { ActivationLink } from './activation-link';
import { StaffActivationPage } from './staff-activation-page';
import { STAFF_ACTIVATION_PATH } from './staff-activation-paths';
import {
  COMPLETE_URL,
  VALIDATE_URL,
  createFakeActivationApi,
  fieldErrorsResponse,
  htmlResponse,
  invalidLinkResponse,
  jsonResponse,
} from './testing/fake-activation-api';
import { fragmentOf, makeLink, randomBase64Url } from './testing/link-factory';
import { openActivation, openAt } from './testing/open-page';

// Admin F10, NS-43 và phía giao diện của NS-30, 31, 33, 35, 38, 39. Mã ca NSF10-nn là [đề xuất] (TRACKING admin 9A.7); ca nào phủ test
// case của PLAN thì ghi kèm mã đó. Token sinh tạm bằng `crypto` mỗi ca; mật khẩu ngắn, ghép từ mảnh (không phải chuỗi bí mật thật).
const GOOD = ['Matkhau', '@', '1x'].join('');
const OTHER = ['Khac', '#', '99zz'].join('');

const RULE =
  'Mật khẩu từ 8 đến 64 ký tự, gồm ít nhất một chữ số và một ký tự đặc biệt (ví dụ ! @ # $ % .).';
const CHARS =
  'Mật khẩu chỉ được dùng chữ không dấu, chữ số, dấu câu/ký hiệu và dấu cách.';
const MISMATCH = 'Mật khẩu xác nhận không khớp.';
const INVALID_DATA = 'Dữ liệu không hợp lệ.';
const SYSTEM = 'Hệ thống đang gặp sự cố. Vui lòng thử lại sau.';
const NETWORK = 'Không có kết nối mạng. Vui lòng kiểm tra và thử lại.';
const GENERIC = 'Đã có lỗi xảy ra. Vui lòng thử lại sau.';
const INVALID_TITLE = 'Liên kết không hợp lệ';
const INVALID_BODY =
  'Liên kết kích hoạt không còn hiệu lực. Vui lòng liên hệ Quản trị viên để được gửi lại.';
const RELOAD_HINT =
  'Nếu bạn vừa tải lại trang, hãy mở lại liên kết trong email.';
const DONE = 'Kích hoạt thành công!';

let api: ReturnType<typeof createFakeActivationApi>;

beforeEach(() => {
  resetAuthForTest();
  api = createFakeActivationApi();
  vi.stubGlobal('fetch', api.fetch);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  setApiAuthHooks(null);
  window.history.replaceState(null, '', '/');
  localStorage.clear();
  sessionStorage.clear();
});

const newPassword = () =>
  screen.getByLabelText<HTMLInputElement>('Mật khẩu mới', { exact: true });
const confirmPassword = () =>
  screen.getByLabelText<HTMLInputElement>('Xác nhận mật khẩu mới', {
    exact: true,
  });
const submitButton = () =>
  screen.getByRole('button', { name: 'Kích hoạt tài khoản' });
const findForm = () =>
  screen.findByLabelText<HTMLInputElement>('Mật khẩu mới', { exact: true });
const findInvalidScreen = () =>
  screen.findByRole('heading', { name: INVALID_TITLE });
const findDone = () => screen.findByText(DONE);

function fill(password: string, confirmation = password) {
  fireEvent.change(newPassword(), { target: { value: password } });
  fireEvent.change(confirmPassword(), { target: { value: confirmation } });
}

function submit(password = GOOD, confirmation = password) {
  fill(password, confirmation);
  fireEvent.click(submitButton());
}

// Chữ của một ô (câu lỗi hoặc câu hướng dẫn) qua `aria-describedby`
function noteOf(input: HTMLElement): string {
  const id = input.getAttribute('aria-describedby');
  return (id && document.getElementById(id)?.textContent) || '';
}

function safeText(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

// Ghi lại MỌI dòng console của ca (và nuốt chúng): dùng để khẳng định không dòng nào chứa token hay mật khẩu
function spyConsole(): string[] {
  const lines: string[] = [];
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      lines.push(args.map(safeText).join(' '));
    });
  }
  return lines;
}

describe('mở liên kết', () => {
  it('NSF10-30 NS-30, NS-43: liên kết hợp lệ ⇒ validate đúng một lần với { id, token }, hiện form, fragment đã xoá, DOM không chứa token', async () => {
    const link = makeLink();
    openActivation(link);

    expect(await findForm()).toBeInTheDocument();

    expect(api.callsTo('validate')).toHaveLength(1);
    expect(api.callsTo('validate')[0]?.body).toEqual({
      id: link.id,
      token: link.token,
    });
    expect(confirmPassword()).toBeInTheDocument();
    expect(submitButton()).toBeEnabled();
    // Form chỉ có hai ô mật khẩu: không email, không họ tên
    expect(document.querySelectorAll('input')).toHaveLength(2);
    expect(screen.queryByLabelText(/email/i)).toBeNull();
    expect(screen.queryByLabelText(/họ/i)).toBeNull();
    expect(
      screen.getByRole('heading', { name: 'Kích hoạt tài khoản' }),
    ).toBeInTheDocument();
    // Q25: fragment đã bị xoá khỏi thanh địa chỉ
    expect(window.location.hash).toBe('');
    expect(window.location.href).not.toContain(link.token);
    expect(document.body.innerHTML).not.toContain(link.token);
    expect(api.callsTo('complete')).toHaveLength(0);
  });

  it('NSF10-31 bẫy StrictMode: render dưới StrictMode vẫn hiện form, validate nhận ĐÚNG id và token, fragment xoá', async () => {
    const link = makeLink();
    openActivation(link, { strict: true });

    expect(await findForm()).toBeInTheDocument();
    // Không rơi vào "Liên kết không hợp lệ" dù effect chạy hai lần (lần hai thấy hash đã rỗng)
    expect(screen.queryByRole('heading', { name: INVALID_TITLE })).toBeNull();

    const validateCalls = api.callsTo('validate');
    // Số lần gọi ở StrictMode (dev) là số ĐO (React 19, vitest 4.1.12), không đoán: lần đầu bị huỷ ở hàm dọn, lần hai là lần thật
    expect(validateCalls.length).toBe(2);
    expect(validateCalls[0]?.signal?.aborted).toBe(true);
    for (const call of validateCalls) {
      expect(call.body).toEqual({ id: link.id, token: link.token });
    }
    expect(validateCalls.at(-1)?.signal?.aborted).toBe(false);
    expect(api.callsTo('complete')).toHaveLength(0);
    expect(window.location.hash).toBe('');
    expect(document.body.innerHTML).not.toContain(link.token);
  });

  it('NSF10-31b render thuần: một lần render bị huỷ rồi chạy lại (React cho phép) vẫn thấy fragment, vì việc xoá nằm ở effect chứ không ở lúc render', () => {
    const link = makeLink();
    window.history.replaceState(
      null,
      '',
      `${STAFF_ACTIVATION_PATH}${fragmentOf(link)}`,
    );
    const renderOnce = () =>
      renderToString(
        <MemoryRouter>
          <StaffActivationPage />
        </MemoryRouter>,
      );

    const first = renderOnce();
    const second = renderOnce();

    // `renderToString` không chạy effect: cả hai lần render đều phải còn thấy fragment, tức cùng ở "đang kiểm tra"
    for (const html of [first, second]) {
      expect(html).toContain('Đang kiểm tra liên kết');
      expect(html).not.toContain(INVALID_TITLE);
      expect(html).not.toContain(link.token);
    }
    expect(window.location.hash).toBe(fragmentOf(link));
    expect(api.calls).toHaveLength(0);
  });

  it.each([
    ['không có fragment (tải lại trang)', STAFF_ACTIVATION_PATH],
    [
      'liên kết đặt ở query chứ không phải fragment',
      `${STAFF_ACTIVATION_PATH}?id=4217&token=${randomBase64Url()}`,
    ],
    ['fragment thiếu token', `${STAFF_ACTIVATION_PATH}#id=4217`],
  ])(
    'NSF10-32 NS-43, A5: %s ⇒ "Liên kết không hợp lệ" ngay, KHÔNG gọi API, có câu gợi ý và đường tới Đăng nhập',
    async (_name, url) => {
      openAt(url);

      await findInvalidScreen();
      expect(screen.getByText(INVALID_BODY)).toBeInTheDocument();
      expect(screen.getByText(RELOAD_HINT)).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: 'Đến trang đăng nhập' }),
      ).toHaveAttribute('href', LOGIN_PATH);
      expect(
        screen.queryByLabelText('Mật khẩu mới', { exact: true }),
      ).toBeNull();
      expect(api.calls).toHaveLength(0);
    },
  );
});

describe('liên kết không dùng được', () => {
  async function missingFragmentScreen(): Promise<string> {
    openAt(STAFF_ACTIVATION_PATH);
    await findInvalidScreen();
    const html = document.body.innerHTML;
    cleanup();
    return html;
  }

  it.each([
    ['400 thân tối thiểu', () => invalidLinkResponse(400)],
    [
      '400 kèm loi, chiTiet, requestId và câu khác',
      () =>
        jsonResponse(400, {
          maLoi: 'LIEN_KET_KHONG_HOP_LE',
          thongBao: 'một câu khác hẳn',
          loi: [{ truong: 'id', ma: 'X' }],
          chiTiet: { soGiayCho: 5 },
          requestId: 'rid-1',
        }),
    ],
    ['mã HTTP 404', () => invalidLinkResponse(404)],
    ['mã HTTP 409', () => invalidLinkResponse(409)],
  ])(
    'NSF10-33 NS-33, NS-35, A5: validate trả LIEN_KET_KHONG_HOP_LE (%s) ⇒ màn HỆT ca thiếu fragment, không form, không tự điều hướng',
    async (_name, makeResponse) => {
      const baseline = await missingFragmentScreen();
      api.failNext(VALIDATE_URL, makeResponse);

      const router = openActivation(makeLink());
      await findInvalidScreen();

      // Cùng thông báo cho mọi lý do: DOM giống từng ký tự (không lộ lý do nào)
      expect(document.body.innerHTML).toBe(baseline);
      expect(api.callsTo('validate')).toHaveLength(1);
      expect(
        screen.queryByLabelText('Mật khẩu mới', { exact: true }),
      ).toBeNull();
      // KHÔNG tự điều hướng sang Đăng nhập
      expect(router.state.location.pathname).toBe(STAFF_ACTIVATION_PATH);
    },
  );

  it.each([
    ['mất mạng', () => Promise.reject(new TypeError('net')), NETWORK],
    [
      '500 LOI_HE_THONG',
      () => jsonResponse(500, { maLoi: 'LOI_HE_THONG', thongBao: 'x' }),
      GENERIC,
    ],
    ['502 trả HTML', () => htmlResponse(502), GENERIC],
  ])(
    'NSF10-34: validate lỗi %s ⇒ "không kiểm tra được" + Thử lại; thử lại dùng CÙNG liên kết; không bao giờ hiện "không hợp lệ"',
    async (_name, makeResponse, message) => {
      api.failNext(VALIDATE_URL, makeResponse);
      const link = makeLink();
      openActivation(link);

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(message);
      expect(screen.queryByRole('heading', { name: INVALID_TITLE })).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));

      expect(await findForm()).toBeInTheDocument();
      const calls = api.callsTo('validate');
      expect(calls).toHaveLength(2);
      expect(calls[1]?.body).toEqual({ id: link.id, token: link.token });
    },
  );

  it('NSF10-47: quay lại tab (visibilitychange, focus, online, pageshow) KHÔNG gọi lại validate', async () => {
    openActivation(makeLink());
    await findForm();
    expect(api.callsTo('validate')).toHaveLength(1);

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('online'));
      window.dispatchEvent(new Event('pageshow'));
      await Promise.resolve();
    });

    expect(api.callsTo('validate')).toHaveLength(1);
    expect(api.calls).toHaveLength(1);
  });
});

describe('đặt mật khẩu', () => {
  it.each([
    ['7 ký tự', 'Ab1!xyz', undefined, 'matKhauMoi', RULE],
    ['65 ký tự', `Ab1!${'x'.repeat(61)}`, undefined, 'matKhauMoi', RULE],
    ['thiếu chữ số', 'Matkhau!abc', undefined, 'matKhauMoi', RULE],
    ['thiếu ký tự đặc biệt', 'Matkhau12345', undefined, 'matKhauMoi', RULE],
    ['có chữ có dấu', 'Matkhaué1!', undefined, 'matKhauMoi', CHARS],
    ['xác nhận lệch', GOOD, OTHER, 'xacNhan', MISMATCH],
  ])(
    'NSF10-35 NS-38, A6: mật khẩu sai ở FE (%s) ⇒ lỗi đúng ô, focus ô lỗi, KHÔNG gọi complete; sửa rồi gửi được',
    async (_name, password, confirmation, field, message) => {
      const link = makeLink();
      openActivation(link);
      await findForm();

      submit(password, confirmation);

      const input = field === 'xacNhan' ? confirmPassword() : newPassword();
      await waitFor(() =>
        expect(input).toHaveAttribute('aria-invalid', 'true'),
      );
      expect(noteOf(input)).toBe(message);
      expect(input).toHaveFocus();
      expect(api.callsTo('complete')).toHaveLength(0);
      // Liên kết còn nguyên: không gọi lại validate
      expect(api.callsTo('validate')).toHaveLength(1);

      submit(GOOD);
      await findDone();
      expect(api.callsTo('complete')).toHaveLength(1);
      expect(api.callsTo('complete')[0]?.body).toEqual({
        id: link.id,
        token: link.token,
        matKhauMoi: GOOD,
        xacNhan: GOOD,
      });
    },
  );

  it('NSF10-36 NS-43, SE-08: 70 vector chung của auth chạy qua ô "Mật khẩu mới" ⇒ kết quả và chữ trùng (cùng một validator)', async () => {
    interface PasswordVector {
      input: string;
      expected: string;
      note: string;
    }
    // Glob thay cho import: Docker build của web không có apps/api (cùng cách của password-policy.test.ts)
    const files = import.meta.glob<PasswordVector[]>(
      '../../../../api/src/auth/password/password-policy.vectors.json',
      { eager: true, import: 'default' },
    );
    const vectors = Object.values(files)[0] ?? [];
    expect(vectors).toHaveLength(70);

    openActivation(makeLink());
    await findForm();

    const messages: Record<string, string> = {
      MAT_KHAU_KHONG_HOP_LE: RULE,
      MAT_KHAU_KY_TU_KHONG_HOP_LE: CHARS,
    };
    const skipped: string[] = [];
    for (const { input, expected, note } of vectors) {
      fireEvent.change(newPassword(), { target: { value: input } });
      // Ô nhập của trình duyệt bỏ ký tự xuống dòng khỏi giá trị, nên người dùng không thể gõ vector đó vào form
      if (newPassword().value !== input) {
        skipped.push(input);
        continue;
      }
      // Xác nhận luôn lệch: lần gửi không bao giờ tới API, chỉ lấy kết quả kiểm của ô "Mật khẩu mới"
      fireEvent.change(confirmPassword(), { target: { value: `${input}x` } });
      fireEvent.click(submitButton());

      const field = newPassword();
      if (expected === 'OK') {
        expect(field, note).not.toHaveAttribute('aria-invalid', 'true');
      } else {
        expect(field, note).toHaveAttribute('aria-invalid', 'true');
        expect(noteOf(field), note).toBe(messages[expected]);
      }
    }

    // Đo thật: chỉ hai vector có \n hoặc \r bị bỏ (VL-02 của auth vẫn chạy đủ 70 vector trên hàm thuần); 68 vector đi qua form
    expect(skipped).toEqual(
      vectors
        .filter(({ input }) => /[\r\n]/.test(input))
        .map(({ input }) => input),
    );
    expect(vectors.length - skipped.length).toBe(68);
    expect(api.callsTo('complete')).toHaveLength(0);
  });

  it('NSF10-37 NS-38, NS-39, A6: API từ chối mật khẩu dù FE cho qua ⇒ lỗi đúng ô, dữ liệu và liên kết còn nguyên, không gọi lại validate; nhập đúng ⇒ thành công', async () => {
    api.failNext(COMPLETE_URL, () =>
      fieldErrorsResponse([
        { truong: 'matKhauMoi', ma: 'MAT_KHAU_KHONG_HOP_LE' },
        { truong: 'xacNhan', ma: 'MA_KHONG_BIET' },
      ]),
    );
    const link = makeLink();
    openActivation(link);
    await findForm();

    submit(GOOD);

    await waitFor(() =>
      expect(newPassword()).toHaveAttribute('aria-invalid', 'true'),
    );
    expect(noteOf(newPassword())).toBe(RULE);
    expect(noteOf(confirmPassword())).toBe(INVALID_DATA);
    expect(newPassword()).toHaveFocus();
    // Dữ liệu đã nhập còn nguyên
    expect(newPassword().value).toBe(GOOD);
    expect(confirmPassword().value).toBe(GOOD);
    expect(api.callsTo('validate')).toHaveLength(1);

    // Nhập lại và gửi lần hai (cùng liên kết) ⇒ thành công
    fireEvent.click(submitButton());
    await findDone();
    const completes = api.callsTo('complete');
    expect(completes).toHaveLength(2);
    expect(completes[1]?.body).toEqual({
      id: link.id,
      token: link.token,
      matKhauMoi: GOOD,
      xacNhan: GOOD,
    });
    expect(api.callsTo('validate')).toHaveLength(1);
  });

  it('NSF10-38 NS-31, NS-43: thành công ⇒ thân đúng, "Kích hoạt thành công!" + nút Đăng nhập, KHÔNG gọi /auth/*, form và mật khẩu gỡ khỏi DOM', async () => {
    const link = makeLink();
    const router = openActivation(link);
    await findForm();

    submit(GOOD);

    await findDone();
    expect(api.callsTo('complete')).toHaveLength(1);
    expect(api.callsTo('complete')[0]?.body).toEqual({
      id: link.id,
      token: link.token,
      matKhauMoi: GOOD,
      xacNhan: GOOD,
    });
    // KHÔNG tự đăng nhập: không lời gọi nào tới /auth/*
    expect(api.calls.filter((call) => call.url.includes('/auth/'))).toEqual([]);
    expect(api.calls).toHaveLength(2);
    // Form và mật khẩu biến khỏi DOM; token không ở đâu trong DOM
    expect(document.querySelectorAll('input')).toHaveLength(0);
    expect(document.body.textContent).not.toContain(GOOD);
    expect(document.body.innerHTML).not.toContain(GOOD);
    expect(document.body.innerHTML).not.toContain(link.token);
    expect(
      screen.getByText('Bạn có thể đăng nhập với mật khẩu vừa đặt.'),
    ).toBeInTheDocument();

    const login = screen.getByRole('link', { name: 'Đăng nhập' });
    expect(login).toHaveAttribute('href', LOGIN_PATH);
    fireEvent.click(login);
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(LOGIN_PATH),
    );
  });

  it('NSF10-39 NS-32, NS-33, A5: complete trả LIEN_KET_KHONG_HOP_LE (hết hạn giữa chừng, đã dùng) ⇒ màn "không hợp lệ", mật khẩu đã nhập biến khỏi DOM', async () => {
    api.failNext(COMPLETE_URL, () => invalidLinkResponse());
    const link = makeLink();
    const router = openActivation(link);
    await findForm();

    submit(GOOD);

    await findInvalidScreen();
    expect(screen.getByText(INVALID_BODY)).toBeInTheDocument();
    expect(document.querySelectorAll('input')).toHaveLength(0);
    expect(document.body.innerHTML).not.toContain(GOOD);
    expect(document.body.innerHTML).not.toContain(link.token);
    // Không phải lỗi ở ô, và không tự điều hướng
    expect(router.state.location.pathname).toBe(STAFF_ACTIVATION_PATH);
    expect(api.callsTo('complete')).toHaveLength(1);
    expect(api.callsTo('validate')).toHaveLength(1);
  });

  it('NSF10-40: bấm hai lần lúc đang gửi ⇒ đúng MỘT complete; nút khoá và aria-busy khi đang gửi', async () => {
    const gate = api.holdNext(COMPLETE_URL);
    openActivation(makeLink());
    await findForm();

    submit(GOOD);

    await waitFor(() => expect(submitButton()).toBeDisabled());
    const form = newPassword().closest('form')!;
    expect(form).toHaveAttribute('aria-busy', 'true');
    // Bấm lại, và gửi thẳng biểu mẫu (qua mặt nút đã khoá): chỉ chặn được bằng cờ trong mã
    fireEvent.click(submitButton());
    fireEvent.submit(form);
    expect(api.callsTo('complete')).toHaveLength(1);

    await act(async () => {
      gate.release();
    });
    await findDone();
    expect(api.callsTo('complete')).toHaveLength(1);
  });

  it.each([
    ['mất mạng', () => Promise.reject(new TypeError('net')), NETWORK],
    [
      'LOI_HE_THONG',
      () => jsonResponse(500, { maLoi: 'LOI_HE_THONG', thongBao: 'x' }),
      SYSTEM,
    ],
    ['502 trả HTML', () => htmlResponse(502), GENERIC],
  ])(
    'NSF10-41: complete lỗi %s ⇒ chữ đúng ở hộp báo lỗi; form, liên kết và dữ liệu nhập còn nguyên; gửi lại được',
    async (_name, makeResponse, message) => {
      api.failNext(COMPLETE_URL, makeResponse);
      const link = makeLink();
      openActivation(link);
      await findForm();

      submit(GOOD);

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(message);
      expect(alert).toHaveFocus();
      expect(newPassword().value).toBe(GOOD);
      expect(confirmPassword().value).toBe(GOOD);
      expect(api.callsTo('complete')).toHaveLength(1);
      expect(api.callsTo('validate')).toHaveLength(1);
      expect(submitButton()).toBeEnabled();

      fireEvent.click(submitButton());
      await findDone();
      const completes = api.callsTo('complete');
      expect(completes).toHaveLength(2);
      expect(completes[1]?.body).toEqual(completes[0]?.body);
    },
  );
});

describe('không rò rỉ token và mật khẩu', () => {
  type Flow =
    | 'success'
    | 'fieldErrors'
    | 'invalidAtComplete'
    | 'networkAtComplete'
    | 'invalidAtValidate';

  async function runFlow(flow: Flow, link: ActivationLink) {
    if (flow === 'invalidAtValidate') {
      api.failNext(VALIDATE_URL, () => invalidLinkResponse());
    }
    if (flow === 'invalidAtComplete') {
      api.failNext(COMPLETE_URL, () => invalidLinkResponse());
    }
    if (flow === 'networkAtComplete') {
      api.failNext(COMPLETE_URL, () => Promise.reject(new TypeError('net')));
    }
    if (flow === 'fieldErrors') {
      api.failNext(COMPLETE_URL, () =>
        fieldErrorsResponse([
          { truong: 'matKhauMoi', ma: 'MAT_KHAU_KHONG_HOP_LE' },
        ]),
      );
    }

    openActivation(link);
    if (flow === 'invalidAtValidate') {
      await findInvalidScreen();
      return;
    }
    await findForm();
    // Đang ở form: token chưa bao giờ nằm trong DOM
    expect(document.body.innerHTML).not.toContain(link.token);

    submit(GOOD);
    switch (flow) {
      case 'success':
        await findDone();
        break;
      case 'invalidAtComplete':
        await findInvalidScreen();
        break;
      case 'networkAtComplete':
        await screen.findByRole('alert');
        break;
      case 'fieldErrors':
        await waitFor(() =>
          expect(newPassword()).toHaveAttribute('aria-invalid', 'true'),
        );
        break;
    }
  }

  it.each<Flow>([
    'success',
    'fieldErrors',
    'invalidAtComplete',
    'networkAtComplete',
    'invalidAtValidate',
  ])(
    'NSF10-42 NS-21, H6: luồng %s ⇒ token và mật khẩu không ở console, localStorage, sessionStorage, cookie, URL, history.state; token chỉ ở thân POST',
    async (flow) => {
      const consoleLines = spyConsole();
      const link = makeLink();

      await runFlow(flow, link);

      const secrets = [link.token, GOOD];
      const stored = [
        ...consoleLines,
        document.cookie,
        window.location.href,
        safeText(window.history.state),
        JSON.stringify({ ...localStorage }),
        JSON.stringify({ ...sessionStorage }),
      ].join('\n');
      for (const secret of secrets) expect(stored).not.toContain(secret);
      expect(localStorage).toHaveLength(0);
      expect(sessionStorage).toHaveLength(0);
      expect(document.cookie).toBe('');
      expect(window.location.hash).toBe('');
      expect(document.body.innerHTML).not.toContain(link.token);

      // Mật khẩu chỉ còn trong DOM khi form còn đó (đang sửa lỗi); sau thành công hoặc liên kết hỏng thì phải biến mất
      if (document.querySelectorAll('input').length === 0) {
        expect(document.body.innerHTML).not.toContain(GOOD);
      }

      expect(api.calls.length).toBeGreaterThan(0);
      for (const call of api.calls) {
        expect(call.url).not.toContain('?');
        for (const secret of secrets) expect(call.url).not.toContain(secret);
        for (const [, value] of call.headers) {
          for (const secret of secrets) expect(value).not.toContain(secret);
        }
        expect(call.headers.get('authorization')).toBeNull();
      }
    },
  );
});

describe('phiên đăng nhập, huỷ và truy cập được', () => {
  it('NSF10-43: người đã đăng nhập mở liên kết ⇒ trang chạy y hệt, không chuyển hướng, mọi request không có Authorization', async () => {
    setAuthState({
      status: 'authenticated',
      user: {
        vaiTro: 'QuanTriVien',
        hoTen: 'Quản trị mẫu',
        daXacMinhEmail: true,
      },
    });
    setAccessToken(`acc-${randomBase64Url(8)}`);
    const link = makeLink();
    const router = openActivation(link);

    await findForm();
    expect(router.state.location.pathname).toBe(STAFF_ACTIVATION_PATH);

    submit(GOOD);
    await findDone();

    expect(router.state.location.pathname).toBe(STAFF_ACTIVATION_PATH);
    expect(api.calls).toHaveLength(2);
    for (const call of api.calls) {
      expect(call.headers.get('authorization')).toBeNull();
    }
  });

  it('NSF10-44: gỡ trang lúc validate đang bay ⇒ request bị huỷ, không lỗi; gỡ lúc complete đang bay ⇒ không cập nhật state', async () => {
    const consoleLines = spyConsole();
    const validateGate = api.holdNext(VALIDATE_URL);
    openActivation(makeLink());
    await waitFor(() => expect(api.callsTo('validate')).toHaveLength(1));
    const signal = api.callsTo('validate')[0]?.signal;
    expect(signal?.aborted).toBe(false);

    cleanup();
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      validateGate.release();
    });

    // Lần hai: complete đang bay khi gỡ trang
    const completeGate = api.holdNext(COMPLETE_URL);
    openActivation(makeLink());
    await findForm();
    submit(GOOD);
    await waitFor(() => expect(api.callsTo('complete')).toHaveLength(1));
    cleanup();
    await act(async () => {
      completeGate.release();
    });

    expect(api.callsTo('complete')).toHaveLength(1);
    expect(
      consoleLines.filter((line) =>
        /unmounted|not wrapped in act|Can't perform/i.test(line),
      ),
    ).toEqual([]);
  });

  it('NSF10-45: truy cập được: ô có nhãn, đúng kiểu và autocomplete; lỗi có aria-describedby; focus vào ô lỗi, hộp báo lỗi và màn kết quả', async () => {
    api.failNext(COMPLETE_URL, () =>
      jsonResponse(500, { maLoi: 'LOI_HE_THONG', thongBao: 'x' }),
    );
    openActivation(makeLink());
    const password = await findForm();

    expect(password).toHaveAttribute('type', 'password');
    expect(password).toHaveAttribute('autocomplete', 'new-password');
    expect(password).toBeRequired();
    expect(confirmPassword()).toHaveAttribute('autocomplete', 'new-password');
    expect(
      screen.getByRole('button', { name: 'Hiện mật khẩu mới' }),
    ).toHaveAttribute('aria-pressed', 'false');
    // Câu hướng dẫn quy tắc mật khẩu gắn với ô
    expect(noteOf(password)).toBe(RULE);
    // Focus đầu tiên: ô "Mật khẩu mới"
    expect(password).toHaveFocus();

    // Lỗi ở ô xác nhận ⇒ focus nhảy tới ô đó
    submit(GOOD, OTHER);
    await waitFor(() =>
      expect(confirmPassword()).toHaveAttribute('aria-invalid', 'true'),
    );
    expect(confirmPassword()).toHaveFocus();

    // Lỗi chung của máy chủ ⇒ hộp báo lỗi role=alert nhận focus
    fill(GOOD);
    fireEvent.click(submitButton());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveFocus();

    // Màn kết quả: focus vào khung chứa tiêu đề
    fireEvent.click(submitButton());
    const done = await findDone();
    await waitFor(() => expect(done.closest('[tabindex="-1"]')).toHaveFocus());
  });

  it('NSF10-45: màn "không hợp lệ" nhận focus', async () => {
    openAt(STAFF_ACTIVATION_PATH);
    const heading = await findInvalidScreen();
    await waitFor(() =>
      expect(heading.closest('[tabindex="-1"]')).toHaveFocus(),
    );
  });

  it('NSF10-30b ghi lại đánh đổi: router còn giữ hash trong bộ nhớ (trang không đọc useLocation), thanh địa chỉ thật thì sạch', async () => {
    // Router bộ nhớ nhận cùng URL có fragment (như createBrowserRouter); `replaceState` trực tiếp không báo cho router, còn trang chỉ dùng window.location
    const link = makeLink();
    const router = openActivation(link);
    await findForm();
    expect(router.state.location.hash).toBe(fragmentOf(link));
    expect(window.location.hash).toBe('');
  });
});
