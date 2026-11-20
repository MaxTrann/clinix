import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MA_LICH_HEN,
  apiError,
  cleanUpFakeDepositApi,
  installFakeDepositApi,
  paidBody,
  previewBody,
} from '../testing/fake-deposit-api';
import { DepositPaymentPanel } from './deposit-payment-panel';

// payment F3: thành phần thanh toán cọc bằng ví với API giả (WTT-01 đến WTT-05, WTT-07). Hình theo Figma `452:2`. Dữ liệu giả.

afterEach(cleanUpFakeDepositApi);

function renderPanel() {
  const onPaid = vi.fn();
  render(
    <MemoryRouter>
      <DepositPaymentPanel maLichHen={MA_LICH_HEN} onPaid={onPaid} />
    </MemoryRouter>,
  );
  return { onPaid };
}

const payButton = () =>
  screen.findByRole('button', { name: 'Thanh toán 100.000đ từ ví' });
const posts = (api: ReturnType<typeof installFakeDepositApi>) =>
  api.calls.filter((call) => call.method === 'POST');

describe('DepositPaymentPanel (payment F3)', () => {
  it('WTT-01 ★ hiện đúng số máy chủ trả, KHÔNG tự trừ ở client (số dư sau cố ý khác 350.000 − 100.000)', async () => {
    const api = installFakeDepositApi();
    // Đột biến: nếu client tự tính sẽ ra 250.000đ, không phải 249.500đ
    api.handlers.preview = () => ({
      body: previewBody({ soDuSauThanhToan: '249500.00' }),
    });
    renderPanel();
    expect(await payButton()).toBeEnabled();
    expect(screen.getByText('Số tiền cần thanh toán')).toBeVisible();
    expect(screen.getByText('100.000đ')).toBeVisible();
    expect(screen.getByText('350.000đ')).toBeVisible();
    expect(screen.getByText('249.500đ')).toBeVisible();
    expect(screen.queryByText('250.000đ')).toBeNull();
    expect(api.calls).toEqual([
      {
        method: 'GET',
        path: `/patient/appointments/${MA_LICH_HEN}/payment-preview`,
        body: undefined,
      },
    ]);
  });

  it('WTT-02 duSoDu = false ⇒ gợi ý nạp thêm kèm liên kết tới ví, nút vô hiệu, không có dòng "sau thanh toán"', async () => {
    const api = installFakeDepositApi();
    api.handlers.preview = () => ({
      body: previewBody({
        soDuKhaDung: '40000.00',
        soDuSauThanhToan: null,
        duSoDu: false,
      }),
    });
    renderPanel();
    expect(await payButton()).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Số dư ví không đủ để thanh toán. Hãy nạp thêm tiền.',
    );
    expect(
      screen.getByRole('link', { name: 'Nạp tiền vào ví' }),
    ).toHaveAttribute('href', '/benh-nhan/vi-cua-toi');
    expect(screen.queryByText('Số dư sau thanh toán')).toBeNull();
    fireEvent.click(await payButton());
    expect(posts(api)).toEqual([]);
  });

  it('WTT-03 ★ bấm thanh toán: nút vô hiệu khi gửi, BẤM ĐÚP chỉ một lời gọi, thân rỗng', async () => {
    const api = installFakeDepositApi();
    let release: (value: { body: unknown; status?: number }) => void = () => {};
    api.handlers.pay = () => ({
      hold: new Promise((resolve) => (release = resolve)),
    });
    const { onPaid } = renderPanel();
    // Giữ ĐÚNG phần tử nút: sau lần bấm đầu tên nút đổi thành "Đang thanh toán..."
    const button = await payButton();
    fireEvent.click(button);
    fireEvent.click(button);
    expect(
      await screen.findByRole('button', { name: 'Đang thanh toán...' }),
    ).toBeDisabled();
    expect(posts(api)).toEqual([
      {
        method: 'POST',
        path: `/patient/appointments/${MA_LICH_HEN}/payment`,
        body: {},
      },
    ]);
    release({ body: paidBody() });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Thanh toán thành công. Lịch hẹn đã được xác nhận.',
    );
    expect(screen.queryByRole('button')).toBeNull();
    // Số dư hiện tại lấy từ kết quả của máy chủ
    expect(screen.getByText('250.000đ')).toBeVisible();
    expect(screen.queryByText('Số dư sau thanh toán')).toBeNull();
    expect(posts(api)).toHaveLength(1);
    expect(onPaid).toHaveBeenCalledTimes(1);
  });

  it('WTT-03 daXuLyTruocDo = true ⇒ vẫn hiện đã thanh toán, báo ví không bị trừ thêm, gọi onPaid', async () => {
    const api = installFakeDepositApi();
    api.handlers.pay = () => ({ body: paidBody({ daXuLyTruocDo: true }) });
    const { onPaid } = renderPanel();
    fireEvent.click(await payButton());
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Lịch hẹn này đã được thanh toán trước đó. Ví không bị trừ thêm.',
    );
    expect(onPaid).toHaveBeenCalledWith(
      expect.objectContaining({ daXuLyTruocDo: true }),
    );
  });

  it.each([
    [
      'HET_HAN_GIU_CHO',
      'Lịch hẹn đã hết thời gian giữ chỗ và đã bị hủy. Ví của bạn chưa bị trừ tiền.',
      false,
    ],
    [
      'LICH_HEN_KHONG_CHO_THANH_TOAN',
      'Lịch hẹn này không còn ở trạng thái chờ thanh toán.',
      false,
    ],
    ['SO_DU_KHONG_DU', 'Số dư ví không đủ. Hãy nạp thêm tiền.', true],
    ['LICH_HEN_KHONG_CAN_COC', 'Lịch hẹn này không yêu cầu đặt cọc.', false],
  ])(
    'WTT-04 thanh toán trả 409 %s ⇒ đúng câu theo mã, nút vô hiệu, không gọi onPaid',
    async (maLoi, message, topup) => {
      const api = installFakeDepositApi();
      api.handlers.pay = () => apiError(409, maLoi);
      const { onPaid } = renderPanel();
      const button = await payButton();
      fireEvent.click(button);
      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(button).toBeDisabled();
      expect(screen.queryAllByRole('link')).toHaveLength(topup ? 1 : 0);
      fireEvent.click(button);
      expect(posts(api)).toHaveLength(1);
      expect(onPaid).not.toHaveBeenCalled();
    },
  );

  it('WTT-04 câu chọn theo maLoi, KHÔNG theo thongBao của máy chủ; mã lạ ⇒ câu chung và cho bấm lại', async () => {
    const api = installFakeDepositApi();
    api.handlers.pay = () => apiError(409, 'MA_LA_CHUA_BIET');
    renderPanel();
    fireEvent.click(await payButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Đã có lỗi xảy ra. Vui lòng thử lại sau.',
    );
    expect(screen.queryByText('câu của máy chủ')).toBeNull();
    expect(await payButton()).toBeEnabled();
  });

  it('WTT-04 mất mạng khi gửi ⇒ cảnh báo chưa rõ, KHÔNG tự gửi lại; bấm lại an toàn ⇒ đã thanh toán trước đó', async () => {
    const api = installFakeDepositApi();
    api.handlers.pay = () => ({ network: true });
    const { onPaid } = renderPanel();
    fireEvent.click(await payButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Chưa rõ thanh toán đã được ghi nhận hay chưa.',
    );
    expect(posts(api)).toHaveLength(1);

    api.handlers.pay = () => ({ body: paidBody({ daXuLyTruocDo: true }) });
    fireEvent.click(await payButton());
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Ví không bị trừ thêm.',
    );
    expect(posts(api)).toHaveLength(2);
    expect(onPaid).toHaveBeenCalledTimes(1);
  });

  it('WTT-05 thành công ⇒ gọi onPaid qua props đúng một lần với kết quả của máy chủ', async () => {
    installFakeDepositApi();
    const { onPaid } = renderPanel();
    fireEvent.click(await payButton());
    await waitFor(() => expect(onPaid).toHaveBeenCalledTimes(1));
    expect(onPaid).toHaveBeenCalledWith({
      maLichHen: MA_LICH_HEN,
      trangThai: 'DaXacNhan',
      soTien: '100000.00',
      soDuKhaDung: '250000.00',
      daXuLyTruocDo: false,
    });
  });

  it('WTT-07 payment-preview đang tải ⇒ trạng thái tải, chưa có nút', async () => {
    const api = installFakeDepositApi();
    let release: (value: { body: unknown; status?: number }) => void = () => {};
    api.handlers.preview = () => ({
      hold: new Promise((resolve) => (release = resolve)),
    });
    renderPanel();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Đang tải thông tin thanh toán...',
    );
    expect(screen.queryByRole('button')).toBeNull();
    release({ body: previewBody() });
    expect(await payButton()).toBeEnabled();
  });

  it('WTT-07 payment-preview mất mạng ⇒ câu mất mạng và "Thử lại" tải lại được', async () => {
    const api = installFakeDepositApi();
    api.handlers.preview = () => ({ network: true });
    renderPanel();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không có kết nối mạng.',
    );
    api.handlers.preview = () => ({ body: previewBody() });
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await payButton()).toBeEnabled();
  });

  it('WTT-07 payment-preview lỗi máy chủ hay phản hồi sai hình dạng ⇒ câu lỗi chung kèm "Thử lại"', async () => {
    const api = installFakeDepositApi();
    // Tiền là number thay vì chuỗi decimal ⇒ không được hiện
    api.handlers.preview = () => ({ body: previewBody({ soTienCan: 100000 }) });
    renderPanel();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Đã có lỗi xảy ra. Vui lòng thử lại sau.',
    );
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeVisible();
  });

  it.each([
    [409, 'HET_HAN_GIU_CHO', 'Lịch hẹn đã hết thời gian giữ chỗ và đã bị hủy.'],
    [404, 'KHONG_TIM_THAY', 'Không tìm thấy lịch hẹn.'],
  ])(
    'WTT-04 payment-preview trả %i %s ⇒ câu theo mã, không có nút thanh toán hay "Thử lại"',
    async (status, maLoi, message) => {
      const api = installFakeDepositApi();
      api.handlers.preview = () => apiError(status, maLoi);
      renderPanel();
      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(screen.queryByRole('button')).toBeNull();
    },
  );
});
