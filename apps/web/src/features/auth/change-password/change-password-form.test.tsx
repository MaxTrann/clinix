import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import {
  createFakeAuthApi,
  createFakeLocks,
} from '../../../test/fake-auth-api';
import { login, resetAuthForTest } from '../auth-session';
import { getAccessToken, getAuthState } from '../auth-store';
import { ChangePasswordForm } from '../index';

// Task F5 (TRACKING auth F5-D, F5-E). Mã ca CP-nn là [đề xuất]; ca phủ test case của PLAN ghi kèm mã đó.
const PATH = '/auth/change-password';
const OLD = 'Cu@12345';
const NEW = ' Moi@12345 ';
const RULE =
  'Mật khẩu từ 8 đến 64 ký tự, gồm ít nhất một chữ số và một ký tự đặc biệt (ví dụ ! @ # $ % .).';
const CHANGED = 'Đã đổi mật khẩu. Các thiết bị khác đã được đăng xuất.';
const UNKNOWN =
  'Không rõ mật khẩu đã được đổi hay chưa. Nếu sau này bị yêu cầu đăng nhập lại, hãy thử mật khẩu mới trước.';
const WRONG = 'Mật khẩu hiện tại không đúng.';

let api: ReturnType<typeof createFakeAuthApi>;
let consoleLines: string[];

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
const fail = (status: number, body: Record<string, unknown>) =>
  api.failNext(PATH, () => json(status, { thongBao: 'CÂU CỦA API', ...body }));
const changeCalls = () => api.requests.filter((r) => r.path === PATH).length;

const current = () =>
  screen.getByLabelText<HTMLInputElement>('Mật khẩu hiện tại', { exact: true });
const fresh = () =>
  screen.getByLabelText<HTMLInputElement>('Mật khẩu mới', { exact: true });
const confirm = () =>
  screen.getByLabelText<HTMLInputElement>('Xác nhận mật khẩu mới', {
    exact: true,
  });
const submit = () => screen.getByRole('button', { name: 'Cập nhật mật khẩu' });
const cancel = () => screen.getByRole('button', { name: 'Hủy' });

function fill(cu = OLD, moi = NEW, xacNhan = moi) {
  fireEvent.change(current(), { target: { value: cu } });
  fireEvent.change(fresh(), { target: { value: moi } });
  fireEvent.change(confirm(), { target: { value: xacNhan } });
}

function renderForm(props: Parameters<typeof ChangePasswordForm>[0] = {}) {
  return render(<ChangePasswordForm {...props} />);
}

beforeEach(async () => {
  resetAuthForTest();
  api = createFakeAuthApi();
  vi.stubGlobal('fetch', vi.fn(api.fetch));
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: createFakeLocks(),
  });
  consoleLines = [];
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      consoleLines.push(args.map(String).join(' '));
    });
  }
  await login('a@example.invalid', 'mat-khau');
  api.requests.length = 0;
  api.bodies.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('giao diện', () => {
  it('CP-01 DM-10 G3 khối 416:366: tiêu đề, ba ô, hai nút, không có dòng demo', () => {
    renderForm();
    expect(
      screen.getByRole('region', { name: 'Đổi mật khẩu' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Đổi mật khẩu' }));
    expect(current()).toHaveAttribute('type', 'password');
    expect(fresh()).toHaveAttribute('type', 'password');
    expect(confirm()).toHaveAttribute('type', 'password');
    expect(current()).toHaveAttribute('autocomplete', 'current-password');
    expect(fresh()).toHaveAttribute('autocomplete', 'new-password');
    expect(confirm()).toHaveAttribute('autocomplete', 'new-password');
    expect(fresh()).toHaveAccessibleDescription(RULE);
    expect(submit()).toBeEnabled();
    expect(cancel()).toBeEnabled();
    expect(document.body.textContent).not.toMatch(/demo|Mô phỏng/i);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('CP-02 nút mắt ở cả ba ô (lệch Figma có chủ đích như F2, F4)', () => {
    renderForm();
    for (const [name, input] of [
      ['Hiện mật khẩu hiện tại', current],
      ['Hiện mật khẩu mới', fresh],
      ['Hiện xác nhận mật khẩu mới', confirm],
    ] as const) {
      fireEvent.click(screen.getByRole('button', { name }));
      expect(input()).toHaveAttribute('type', 'text');
    }
  });
});

describe('kiểm ở trình duyệt', () => {
  it('CP-03 DM-04 để trống: lỗi từng ô, focus ô đầu, không gọi API', async () => {
    renderForm();
    fireEvent.click(submit());
    expect(
      await screen.findByText('Vui lòng nhập mật khẩu hiện tại.'),
    ).toBeInTheDocument();
    expect(fresh()).toHaveAccessibleDescription(RULE);
    expect(fresh()).toHaveAttribute('aria-invalid', 'true');
    expect(current()).toHaveAttribute('aria-invalid', 'true');
    expect(current()).toHaveFocus();
    expect(changeCalls()).toBe(0);
  });

  it('CP-04 DM-04 không khớp: lỗi ở ô xác nhận, focus ô đó, không gọi API', async () => {
    renderForm();
    fill(OLD, NEW, 'Moi@12345');
    fireEvent.click(submit());
    expect(
      await screen.findByText('Mật khẩu xác nhận không khớp.'),
    ).toBeInTheDocument();
    expect(confirm()).toHaveFocus();
    expect(changeCalls()).toBe(0);
  });

  it('CP-05 ô hiện tại 65 ký tự: báo sai ngay, không gọi API', async () => {
    renderForm();
    fill('a'.repeat(65));
    fireEvent.click(submit());
    expect(await screen.findByText(WRONG)).toBeInTheDocument();
    expect(changeCalls()).toBe(0);
  });

  it('CP-06 sửa một ô thì lỗi biến mất', async () => {
    renderForm();
    fireEvent.click(submit());
    await screen.findByText('Vui lòng nhập mật khẩu hiện tại.');
    fireEvent.change(current(), { target: { value: 'x' } });
    expect(screen.queryByText('Vui lòng nhập mật khẩu hiện tại.')).toBeNull();
  });
});

describe('gửi', () => {
  it('CP-07 DM-01 DM-07 thành công: đúng ba trường không trim, xoá ô, báo thành công, gọi onSuccess, vẫn đăng nhập', async () => {
    const onSuccess = vi.fn();
    const token = getAccessToken();
    renderForm({ onSuccess });
    fill();
    fireEvent.click(submit());
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(CHANGED);
    expect(status).toHaveFocus();
    expect(api.bodies).toEqual([
      { path: PATH, body: { matKhauCu: OLD, matKhauMoi: NEW, xacNhan: NEW } },
    ]);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect([current().value, fresh().value, confirm().value]).toEqual([
      '',
      '',
      '',
    ]);
    expect(getAuthState().status).toBe('authenticated');
    expect(getAccessToken()).toBe(token);
  });

  it('CP-08 gõ lại sau khi thành công: ẩn câu thành công', async () => {
    renderForm();
    fill();
    fireEvent.click(submit());
    await screen.findByRole('status');
    fireEvent.change(current(), { target: { value: 'x' } });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('CP-09 bấm hai lần liền: một POST; đang gửi thì hai nút khoá và chữ đổi', async () => {
    const release = api.hold(PATH);
    renderForm();
    fill();
    const button = submit();
    fireEvent.click(button);
    // Như Enter trong ô lần nữa: đi vòng qua nút đã khoá, chỉ còn ref chặn
    fireEvent.submit(button.closest('form')!);
    const busy = await screen.findByRole('button', { name: 'Đang cập nhật…' });
    expect(busy).toBeDisabled();
    expect(cancel()).toBeDisabled();
    await waitFor(() => expect(changeCalls()).toBe(1));
    release(200, { daDoiMatKhau: true });
    await screen.findByRole('status');
    expect(changeCalls()).toBe(1);
  });

  it('CP-10 DM-03 MAT_KHAU_CU_SAI: dưới ô hiện tại, giữ dữ liệu, focus ô đó, không làm mới', async () => {
    fail(400, { maLoi: 'MAT_KHAU_CU_SAI' });
    renderForm();
    fill();
    fireEvent.click(submit());
    expect(await screen.findByText(WRONG)).toBeInTheDocument();
    expect(current()).toHaveFocus();
    expect(current()).toHaveAccessibleDescription(WRONG);
    expect([current().value, fresh().value, confirm().value]).toEqual([
      OLD,
      NEW,
      NEW,
    ]);
    expect(api.refreshCalls).toBe(0);
    expect(screen.queryByText('CÂU CỦA API')).toBeNull();
  });

  it('CP-11 DM-04 DU_LIEU_KHONG_HOP_LE theo trường: focus ô lỗi đầu theo thứ tự trên form', async () => {
    fail(400, {
      maLoi: 'DU_LIEU_KHONG_HOP_LE',
      loi: [
        { truong: 'xacNhan', ma: 'XAC_NHAN_KHONG_KHOP' },
        { truong: 'matKhauMoi', ma: 'MAT_KHAU_KHONG_HOP_LE' },
      ],
    });
    renderForm();
    fill();
    fireEvent.click(submit());
    expect(
      await screen.findByText('Mật khẩu xác nhận không khớp.'),
    ).toBeInTheDocument();
    expect(fresh()).toHaveFocus();
    expect(fresh()).toHaveAccessibleDescription(RULE);
  });

  it('CP-12 500 LOI_HE_THONG: hộp lỗi, giữ dữ liệu, không tự thử lại', async () => {
    fail(500, { maLoi: 'LOI_HE_THONG' });
    renderForm();
    fill();
    fireEvent.click(submit());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Hệ thống đang gặp sự cố. Vui lòng thử lại sau.',
    );
    expect(alert).toHaveFocus();
    expect(current().value).toBe(OLD);
    expect(changeCalls()).toBe(1);
  });

  it('CP-13 mất mạng: không rõ kết quả, xoá ba ô, KHÔNG tự thử lại', async () => {
    api.failNext(PATH, () => Promise.reject(new TypeError('net')));
    renderForm();
    fill();
    fireEvent.click(submit());
    expect(await screen.findByRole('alert')).toHaveTextContent(UNKNOWN);
    expect([current().value, fresh().value, confirm().value]).toEqual([
      '',
      '',
      '',
    ]);
    expect(changeCalls()).toBe(1);
    expect(submit()).toBeEnabled();
  });

  it('CP-14 504 của nginx: không rõ kết quả, không hiện HTML', async () => {
    api.failNext(
      PATH,
      () => new Response('<h1>504 Gateway</h1>', { status: 504 }),
    );
    renderForm();
    fill();
    fireEvent.click(submit());
    expect(await screen.findByRole('alert')).toHaveTextContent(UNKNOWN);
    expect(screen.queryByText(/Gateway/)).toBeNull();
    expect(changeCalls()).toBe(1);
  });

  it('CP-15 token hết hạn: tự làm mới một lần rồi thành công', async () => {
    api.expireTokens();
    renderForm();
    fill();
    fireEvent.click(submit());
    expect(await screen.findByRole('status')).toHaveTextContent(CHANGED);
    expect(api.refreshCalls).toBe(1);
    expect(changeCalls()).toBe(2);
  });
});

describe('gửi lại sau lỗi', () => {
  it.each([
    ['500 LOI_HE_THONG', 500, 'LOI_HE_THONG'],
    ['MAT_KHAU_CU_SAI', 400, 'MAT_KHAU_CU_SAI'],
  ])(
    'CP-19 sau %s, sửa rồi bấm lại: form vẫn gửi được lần hai',
    async (_name, status, maLoi) => {
      fail(status, { maLoi });
      renderForm();
      fill();
      fireEvent.click(submit());
      await waitFor(() => expect(submit()).toBeEnabled());
      await waitFor(() => expect(changeCalls()).toBe(1));
      fireEvent.change(current(), { target: { value: 'CuKhac@1' } });
      fireEvent.click(submit());
      expect(await screen.findByRole('status')).toHaveTextContent(CHANGED);
      expect(changeCalls()).toBe(2);
    },
  );

  it('CP-20 N9 mật khẩu hiện tại toàn dấu cách: gửi nguyên văn, không trim', async () => {
    renderForm();
    fill('        ');
    fireEvent.click(submit());
    await screen.findByRole('status');
    expect(api.bodies).toEqual([
      {
        path: PATH,
        body: { matKhauCu: '        ', matKhauMoi: NEW, xacNhan: NEW },
      },
    ]);
  });
});

describe('Hủy và rời trang', () => {
  it('CP-16 Hủy: xoá ba ô, lỗi và câu thành công, đưa nút mắt về ẩn, gọi onCancel', async () => {
    const onCancel = vi.fn();
    renderForm({ onCancel });
    fireEvent.click(screen.getByRole('button', { name: 'Hiện mật khẩu mới' }));
    fill(OLD, NEW, 'khac');
    fireEvent.click(submit());
    await screen.findByText('Mật khẩu xác nhận không khớp.');
    fireEvent.click(cancel());
    expect([current().value, fresh().value, confirm().value]).toEqual([
      '',
      '',
      '',
    ]);
    expect(fresh()).toHaveAttribute('type', 'password');
    expect(screen.queryByText('Mật khẩu xác nhận không khớp.')).toBeNull();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(changeCalls()).toBe(0);
  });

  it('CP-17 F2-J gỡ form lúc request đang bay (thành công): không gọi onSuccess, không lỗi', async () => {
    const onSuccess = vi.fn();
    const release = api.hold(PATH);
    const view = renderForm({ onSuccess });
    fill();
    fireEvent.click(submit());
    await waitFor(() => expect(changeCalls()).toBe(1));
    view.unmount();
    await act(async () => {
      release(200, { daDoiMatKhau: true });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(onSuccess).not.toHaveBeenCalled();
    expect(consoleLines).toEqual([]);
  });

  it('CP-18 mật khẩu không vào URL, lịch sử, kho trình duyệt, console', async () => {
    const href = window.location.href;
    renderForm();
    fill();
    fireEvent.click(submit());
    await screen.findByRole('status');
    const stores = JSON.stringify({ ...localStorage, ...sessionStorage });
    for (const secret of [OLD, NEW.trim()]) {
      expect(window.location.href).not.toContain(encodeURIComponent(secret));
      expect(JSON.stringify(window.history.state)).not.toContain(secret);
      expect(stores).not.toContain(secret);
      expect(consoleLines.join('\n')).not.toContain(secret);
    }
    expect(window.location.href).toBe(href);
  });
});
