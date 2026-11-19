import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LatestWithdrawal } from '../api/wallet-types';
import {
  CREATED_WITHDRAWAL,
  apiError,
  cleanUpFakeWalletApi,
  installFakeWalletApi,
  serverError,
} from '../testing/fake-wallet-api';
import { WithdrawPanel } from './withdraw-panel';
import { WithdrawSuccess } from './withdraw-success';

// payment F6: tab "Rút tiền" với API giả (WRT-01 đến WRT-05). Hình theo Figma `431:2`, `436:2`, `437:2`. Dữ liệu giả.
afterEach(() => {
  vi.useRealTimers();
  cleanUpFakeWalletApi();
});

const latest = (
  trangThai: LatestWithdrawal['trangThai'],
): LatestWithdrawal => ({
  maYeuCau: '9',
  soTien: '100000.00',
  trangThai,
  thoiDiemYeuCau: '2026-10-18T00:10:00.000Z',
});

function renderPanel(props: Partial<Parameters<typeof WithdrawPanel>[0]> = {}) {
  const onSubmitted = vi.fn();
  const onUncertain = vi.fn();
  render(
    <WithdrawPanel
      available="350000.00"
      held="0.00"
      latest={null}
      onSubmitted={onSubmitted}
      onUncertain={onUncertain}
      {...props}
    />,
  );
  return { onSubmitted, onUncertain };
}

const amountInput = () => screen.getByLabelText('Số tiền muốn rút');
const submitButton = () =>
  screen.getByRole('button', { name: /Gửi yêu cầu rút tiền|Đang gửi/ });
const posts = (api: ReturnType<typeof installFakeWalletApi>) =>
  api.requests.filter((r) => r.method === 'POST');
const type = (value: string) =>
  fireEvent.change(amountInput(), { target: { value } });

describe('WithdrawPanel (payment F6)', () => {
  it('WRT-01 hiện số khả dụng và "Tối đa …" lấy từ API, câu lưu ý của Figma; ô nhập định dạng nghìn', () => {
    renderPanel({ available: '350000.00' });
    expect(screen.getByText('350.000đ')).toBeVisible();
    expect(
      screen.getByText('Tối đa 350.000đ (số dư khả dụng hiện tại)'),
    ).toBeVisible();
    expect(
      screen.getByText(/Số dư không bị trừ ngay — chỉ bị trừ khi Admin duyệt/),
    ).toBeVisible();
    type('100000');
    expect(amountInput()).toHaveValue('100.000');
  });

  it('WRT-01 ★ gửi: thân CHỈ có soTien dạng chuỗi chữ số; 201 ⇒ báo trang kết quả của máy chủ', async () => {
    const api = installFakeWalletApi();
    const { onSubmitted } = renderPanel();
    type('100.000');
    fireEvent.click(submitButton());
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledTimes(1));
    expect(onSubmitted).toHaveBeenCalledWith(CREATED_WITHDRAWAL);
    expect(posts(api)).toEqual([
      expect.objectContaining({
        path: '/patient/wallet/withdrawals',
        body: { soTien: '100000' },
        authorization: 'Bearer token-gia',
      }),
    ]);
  });

  it('WRT-01 biên: rút đúng bằng số khả dụng được gửi; ca âm: trống, vượt khả dụng ⇒ lỗi dưới ô, KHÔNG gửi', async () => {
    const api = installFakeWalletApi();
    const { onSubmitted } = renderPanel({ available: '350000.00' });
    fireEvent.click(submitButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Vui lòng nhập số tiền muốn rút.',
    );
    type('350001');
    fireEvent.click(submitButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Số tiền rút không được vượt quá 350.000đ',
    );
    expect(amountInput()).toHaveAttribute('aria-invalid', 'true');
    expect(posts(api)).toHaveLength(0);

    type('350000');
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(submitButton());
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledTimes(1));
    expect(posts(api)[0]!.body).toEqual({ soTien: '350000' });
  });

  it.each([
    [apiError(409, 'SO_DU_KHONG_DU'), 'Số dư ví không đủ. Hãy nạp thêm tiền.'],
    [
      apiError(400, 'SO_TIEN_NGOAI_HAN_MUC', { toiThieu: '10000.00' }),
      'Số tiền rút tối thiểu là 10.000đ.',
    ],
    [
      apiError(400, 'SO_TIEN_NGOAI_HAN_MUC'),
      'Số tiền nằm ngoài hạn mức cho phép.',
    ],
    [apiError(400, 'DU_LIEU_KHONG_HOP_LE'), 'Số tiền không hợp lệ.'],
    [
      apiError(409, 'DA_CO_YEU_CAU_CHO_DUYET'),
      'Bạn đang có một yêu cầu rút tiền chờ duyệt.',
    ],
    [serverError(), 'Đã có lỗi xảy ra. Vui lòng thử lại sau.'],
  ])(
    'WRT-02 lỗi máy chủ ⇒ đúng câu theo maLoi (không dùng thongBao), GIỮ số đã nhập, gửi lại được (%#)',
    async (reply, message) => {
      const api = installFakeWalletApi();
      api.handlers.withdraw = () => reply;
      const { onSubmitted } = renderPanel();
      type('5000');
      fireEvent.click(submitButton());
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(message);
      expect(alert).not.toHaveTextContent('câu của máy chủ');
      expect(amountInput()).toHaveValue('5.000');
      expect(submitButton()).toBeEnabled();
      expect(onSubmitted).not.toHaveBeenCalled();
    },
  );

  it('WRT-03 ★ bấm đúp ⇒ đúng MỘT lời gọi; nút và ô nhập vô hiệu khi đang gửi', async () => {
    const api = installFakeWalletApi();
    let release: (value: { body: unknown; status?: number }) => void = () => {};
    api.handlers.withdraw = () => ({
      hold: new Promise((resolve) => {
        release = resolve;
      }),
    });
    const { onSubmitted } = renderPanel();
    type('100000');
    fireEvent.click(submitButton());
    fireEvent.click(submitButton());
    fireEvent.submit(amountInput().closest('form') as HTMLFormElement);
    expect(
      await screen.findByRole('button', { name: 'Đang gửi yêu cầu...' }),
    ).toBeDisabled();
    expect(amountInput()).toBeDisabled();
    release({ body: CREATED_WITHDRAWAL, status: 201 });
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledTimes(1));
    expect(posts(api)).toHaveLength(1);
  });

  it('WRT-03 ★ mất mạng hay hết giờ ⇒ KHÔNG tự gửi lại, cảnh báo kiểm tra lịch sử, báo trang tải lại lịch sử, giữ số tiền', async () => {
    const api = installFakeWalletApi();
    api.handlers.withdraw = () => ({ network: true });
    const { onUncertain, onSubmitted } = renderPanel();
    type('100000');
    fireEvent.click(submitButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Hãy kiểm tra Lịch sử giao dịch trước khi thử lại.',
    );
    expect(posts(api)).toHaveLength(1);
    expect(onUncertain).toHaveBeenCalledTimes(1);
    expect(amountInput()).toHaveValue('100.000');

    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.handlers.withdraw = () => ({ hold: new Promise(() => {}) });
    fireEvent.click(submitButton());
    await vi.advanceTimersByTimeAsync(15_001);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Chưa rõ yêu cầu rút đã được ghi nhận hay chưa.',
    );
    // Thêm nhiều thời gian nữa vẫn không có lời gọi thứ ba
    await vi.advanceTimersByTimeAsync(60_000);
    expect(posts(api)).toHaveLength(2);
    expect(onUncertain).toHaveBeenCalledTimes(2);
    expect(onSubmitted).not.toHaveBeenCalled();
  });

  it('WRT-04 còn yêu cầu ChoDuyet ⇒ KHÔNG có ô nhập, nút gửi hay "Gửi yêu cầu khác"; hiện dải giữ tiền và câu đang chờ', () => {
    renderPanel({
      available: '250000.00',
      held: '100000.00',
      latest: latest('ChoDuyet'),
    });
    expect(screen.queryByLabelText('Số tiền muốn rút')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText('Gửi yêu cầu khác')).toBeNull();
    expect(
      screen.getByText(
        '100.000đ đang giữ chờ duyệt — sẽ được Admin xử lý sớm.',
      ),
    ).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Bạn đang có một yêu cầu rút tiền chờ duyệt.',
    );
  });

  it.each(['DaDuyet', 'TuChoi'] as const)(
    'WRT-04 yêu cầu gần nhất %s ⇒ có form để gửi yêu cầu mới',
    (trangThai) => {
      renderPanel({ latest: latest(trangThai) });
      expect(amountInput()).toBeVisible();
      expect(submitButton()).toBeEnabled();
    },
  );

  it('WRT-04 màn "Yêu cầu đã được ghi nhận!": số của phản hồi 201, KHÔNG có nút "Gửi yêu cầu khác" (Q8)', () => {
    render(<WithdrawSuccess result={CREATED_WITHDRAWAL} />);
    expect(screen.getByText('Yêu cầu đã được ghi nhận!')).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Số dư khả dụng: 250.000đ · Đang giữ: 100.000đ',
    );
    expect(
      screen.getByText(
        '100.000đ đang giữ chờ duyệt — sẽ được Admin xử lý sớm.',
      ),
    ).toBeVisible();
    expect(screen.queryByRole('button')).toBeNull();
    expect(
      screen.getByText(
        'Bạn có thể gửi yêu cầu mới sau khi yêu cầu này được xử lý.',
      ),
    ).toBeVisible();
  });

  it('WRT-05 nhập và gửi xong: localStorage, sessionStorage và URL không chứa số tiền', async () => {
    installFakeWalletApi();
    localStorage.clear();
    sessionStorage.clear();
    const before = window.location.href;
    const { onSubmitted } = renderPanel();
    type('123456');
    fireEvent.click(submitButton());
    await waitFor(() => expect(onSubmitted).toHaveBeenCalled());
    const stored = [
      ...Object.values({ ...localStorage }),
      ...Object.values({ ...sessionStorage }),
    ].join('|');
    expect(stored).not.toContain('123456');
    expect(stored).not.toContain('123.456');
    expect(localStorage.length + sessionStorage.length).toBe(0);
    expect(window.location.href).toBe(before);
  });
});
