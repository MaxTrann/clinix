import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SANDBOX_URL,
  apiError,
  cleanUpFakeTopupApi,
  installFakeTopupApi,
} from '../testing/fake-topup-api';
import { TopupPanel } from './topup-panel';

// payment F2: tab "Nạp tiền" với API giả (WNT-01 đến WNT-04, WNT-06). Hình theo Figma `430:2`. Dữ liệu giả.
const LIMITS = { toiThieu: '50000.00', toiDa: '2000000.00' };

afterEach(cleanUpFakeTopupApi);

function renderPanel(gateways: string[] = ['VNPay', 'MoMo']) {
  const navigate = vi.fn();
  render(
    <TopupPanel limits={LIMITS} gateways={gateways} navigate={navigate} />,
  );
  return { navigate };
}

const amountInput = () => screen.getByLabelText('Số tiền nạp');
const submitButton = () =>
  screen.getByRole('button', { name: 'Nạp tiền ngay →' });
const posts = (api: ReturnType<typeof installFakeTopupApi>) =>
  api.calls.filter((call) => call.method === 'POST');

describe('TopupPanel (payment F2)', () => {
  it('WNT-01 ★ đúng sáu mức nhanh và dòng hạn mức Figma; chọn mức điền ô số tiền; cổng đầu được chọn sẵn; chỉ hiện cổng đã cấu hình', () => {
    renderPanel(['VNPay']);
    for (const label of [
      '50.000đ',
      '100.000đ',
      '200.000đ',
      '500.000đ',
      '1.000.000đ',
      '2.000.000đ',
    ])
      expect(screen.getByRole('button', { name: label })).toBeVisible();
    expect(screen.getByText('50.000đ – 2.000.000đ / lần nạp')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: '200.000đ' }));
    expect(screen.getByRole('button', { name: '200.000đ' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(amountInput()).toHaveValue('200.000');

    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(1);
    expect(radios[0]).toHaveAccessibleName(/VNPAY/);
    expect(radios[0]).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByText('MoMo')).toBeNull();
  });

  it('WNT-01 bấm cổng khác ⇒ đúng một cổng được chọn', () => {
    renderPanel(['VNPay', 'MoMo']);
    const momo = screen.getByRole('radio', { name: /MoMo/ });
    fireEvent.click(momo);
    expect(momo).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /VNPAY/ })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('WNT-01 không cổng nào cấu hình ⇒ "chưa có cổng" và nút gửi vô hiệu', () => {
    renderPanel([]);
    expect(
      screen.getByText('Hiện chưa có cổng thanh toán nào sẵn sàng.'),
    ).toBeVisible();
    expect(submitButton()).toBeDisabled();
  });

  it('WNT-01 ★ gửi: đúng thân (chuỗi chữ số, cổng đã chọn), nút vô hiệu khi đang gửi, BẤM ĐÚP chỉ một lời gọi', async () => {
    const api = installFakeTopupApi();
    let release: (value: { body: unknown; status?: number }) => void = () => {};
    api.handlers.create = () => ({
      hold: new Promise((resolve) => (release = resolve)),
    });
    const { navigate } = renderPanel();
    fireEvent.change(amountInput(), { target: { value: '300.000' } });
    // Giữ ĐÚNG phần tử nút: sau lần bấm đầu tên nút đổi thành "Đang chuyển…"
    const button = submitButton();
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.submit(button.closest('form')!);
    expect(
      await screen.findByRole('button', {
        name: 'Đang chuyển tới cổng thanh toán...',
      }),
    ).toBeDisabled();
    expect(posts(api)).toEqual([
      {
        method: 'POST',
        path: '/patient/wallet/topups',
        body: { soTien: '300000', phuongThuc: 'VNPay' },
      },
    ]);
    release({
      status: 201,
      body: { maGiaoDich: '42', redirectUrl: SANDBOX_URL },
    });
    await waitFor(() => expect(navigate).toHaveBeenCalledWith(SANDBOX_URL));
    expect(posts(api)).toHaveLength(1);
  });

  it('WNT-02 ngoài hạn mức hay chưa nhập ⇒ lỗi dưới ô (aria-invalid), KHÔNG gửi; sửa số thì lỗi mất', async () => {
    const api = installFakeTopupApi();
    renderPanel();
    fireEvent.click(submitButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Vui lòng chọn hoặc nhập số tiền nạp.',
    );
    fireEvent.change(amountInput(), { target: { value: '49999' } });
    fireEvent.click(submitButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Số tiền nạp phải từ 50.000đ đến 2.000.000đ.',
    );
    expect(amountInput()).toHaveAttribute('aria-invalid', 'true');
    fireEvent.change(amountInput(), { target: { value: '2000001' } });
    fireEvent.click(submitButton());
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(posts(api)).toEqual([]);
    fireEvent.change(amountInput(), { target: { value: '60000' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('WNT-03 ★ 201 với URL không https hay host lạ ⇒ KHÔNG chuyển trang, báo lỗi, nút mở lại', async () => {
    const api = installFakeTopupApi();
    const { navigate } = renderPanel();
    for (const redirectUrl of [
      'http://sandbox.vnpayment.vn/x',
      'https://evil.example/pay',
    ]) {
      api.handlers.create = () => ({
        status: 201,
        body: { maGiaoDich: '42', redirectUrl },
      });
      fireEvent.click(screen.getByRole('button', { name: '100.000đ' }));
      fireEvent.click(submitButton());
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Không thể chuyển tới cổng thanh toán.',
      );
      expect(submitButton()).toBeEnabled();
    }
    expect(navigate).not.toHaveBeenCalled();
  });

  it.each([
    [
      503,
      'CONG_THANH_TOAN_CHUA_CAU_HINH',
      'Cổng thanh toán hiện chưa sẵn sàng.',
    ],
    [
      503,
      'CONG_THANH_TOAN_LOI',
      'Không kết nối được cổng thanh toán. Vui lòng thử lại.',
    ],
    [
      400,
      'SO_TIEN_NGOAI_HAN_MUC',
      'Số tiền nạp phải từ 50.000đ đến 2.000.000đ.',
    ],
    [400, 'DU_LIEU_KHONG_HOP_LE', 'Số tiền không hợp lệ.'],
    [409, 'MA_LA', 'Đã có lỗi xảy ra. Vui lòng thử lại sau.'],
  ])(
    'WNT-04 lỗi %i %s ⇒ câu theo mã, GIỮ số tiền và cổng đã chọn',
    async (status, maLoi, message) => {
      const api = installFakeTopupApi();
      api.handlers.create = () => apiError(status, maLoi);
      const { navigate } = renderPanel();
      fireEvent.change(amountInput(), { target: { value: '150000' } });
      fireEvent.click(screen.getByRole('radio', { name: /MoMo/ }));
      fireEvent.click(submitButton());
      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(screen.queryByText('câu của máy chủ')).toBeNull();
      expect(amountInput()).toHaveValue('150.000');
      expect(screen.getByRole('radio', { name: /MoMo/ })).toHaveAttribute(
        'aria-checked',
        'true',
      );
      expect(submitButton()).toBeEnabled();
      expect(navigate).not.toHaveBeenCalled();
    },
  );

  it('WNT-06 mất mạng hay hết giờ khi gửi ⇒ KHÔNG tự gửi lại, cảnh báo kiểm tra lịch sử, giữ số tiền', async () => {
    const api = installFakeTopupApi();
    api.handlers.create = () => ({ network: true });
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: '500.000đ' }));
    fireEvent.click(submitButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Hãy kiểm tra Lịch sử giao dịch trước khi thử lại.',
    );
    expect(posts(api)).toHaveLength(1);
    expect(amountInput()).toHaveValue('500.000');

    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.handlers.create = () => ({ hold: new Promise(() => {}) });
    fireEvent.click(submitButton());
    await vi.advanceTimersByTimeAsync(15_001);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Chưa rõ yêu cầu nạp đã được ghi nhận hay chưa.',
    );
    expect(posts(api)).toHaveLength(2);
  });
});
