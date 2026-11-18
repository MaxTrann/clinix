import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PATIENT_TOPUP_RESULT_PATH } from '../../../shared/routes/wallet-paths';
import {
  apiError,
  cleanUpFakeTopupApi,
  installFakeTopupApi,
  statusBody,
} from '../testing/fake-topup-api';
import { POLL_DELAYS_MS } from './topup-form';
import { TopupResultPage } from './topup-result-page';

// payment F2: trang kết quả nạp (WNT-05, WNT-07). Chưa có frame Figma (PLAN 4.5, L14). Dữ liệu giả.
afterEach(cleanUpFakeTopupApi);

function renderAt(search: string) {
  return render(
    <MemoryRouter initialEntries={[`${PATIENT_TOPUP_RESULT_PATH}${search}`]}>
      <TopupResultPage />
    </MemoryRouter>,
  );
}

const statusCalls = (api: ReturnType<typeof installFakeTopupApi>) =>
  api.calls.filter((call) => call.method === 'GET').map((call) => call.path);

describe('TopupResultPage (payment F2)', () => {
  it('WNT-05 ★ ThanhCong ⇒ "Nạp tiền thành công" kèm số tiền của MÁY CHỦ; chỉ hỏi đúng mã vnp_TxnRef, bỏ qua mã phản hồi của cổng', async () => {
    const api = installFakeTopupApi();
    api.handlers.status = (id) => ({
      body: statusBody({
        maGiaoDich: id,
        trangThai: 'ThanhCong',
        daCongVi: true,
      }),
    });
    // Chuỗi truy vấn nói "thất bại" (24) nhưng máy chủ nói thành công: tin máy chủ
    renderAt(
      '?vnp_TxnRef=42&vnp_ResponseCode=24&vnp_Amount=1&vnp_SecureHash=abc',
    );
    expect(
      await screen.findByRole('heading', { name: 'Nạp tiền thành công' }),
    ).toBeVisible();
    expect(screen.getByText('200.000đ')).toBeVisible();
    expect(statusCalls(api)).toEqual(['/patient/wallet/topups/42']);
    expect(screen.getByRole('link', { name: 'Về Ví của tôi' })).toHaveAttribute(
      'href',
      '/benh-nhan/vi-cua-toi',
    );
  });

  it('WNT-05 ThatBai ⇒ "Nạp tiền không thành công", ví không đổi; chuỗi truy vấn nói "00" cũng không đổi kết quả', async () => {
    const api = installFakeTopupApi();
    api.handlers.status = (id) => ({
      body: statusBody({ maGiaoDich: id, trangThai: 'ThatBai' }),
    });
    renderAt('?vnp_TxnRef=42&vnp_ResponseCode=00&vnp_TransactionStatus=00');
    expect(
      await screen.findByRole('heading', { name: 'Nạp tiền không thành công' }),
    ).toBeVisible();
    expect(
      screen.getByText('Ví của bạn không thay đổi. Bạn có thể thử nạp lại.'),
    ).toBeVisible();
  });

  it('WNT-05 ★ DangXuLy ⇒ hỏi lại theo đúng các khoảng giãn dần rồi DỪNG; thấy ThanhCong giữa chừng thì dừng sớm', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = installFakeTopupApi();
    renderAt('?vnp_TxnRef=42');
    expect(
      await screen.findByRole('heading', { name: 'Giao dịch đang được xử lý' }),
    ).toBeVisible();
    for (const delay of POLL_DELAYS_MS) {
      await act(() => vi.advanceTimersByTimeAsync(delay));
      await screen.findByRole('heading', { name: 'Giao dịch đang được xử lý' });
    }
    expect(statusCalls(api)).toHaveLength(POLL_DELAYS_MS.length + 1);
    expect(await screen.findByText(/Vẫn chưa có kết quả/)).toBeVisible();
    // Đã dừng: thêm thời gian không gọi thêm
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(statusCalls(api)).toHaveLength(POLL_DELAYS_MS.length + 1);

    // "Kiểm tra lại" hỏi lại; máy chủ giờ đã ThanhCong
    api.handlers.status = (id) => ({
      body: statusBody({ maGiaoDich: id, trangThai: 'ThanhCong' }),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra lại' }));
    expect(
      await screen.findByRole('heading', { name: 'Nạp tiền thành công' }),
    ).toBeVisible();
    const calls = statusCalls(api).length;
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(statusCalls(api)).toHaveLength(calls);
  });

  it('WNT-07 giao dịch của người khác hay không tồn tại (404), thiếu mã, mã sai dạng ⇒ "Không tìm thấy"', async () => {
    const api = installFakeTopupApi();
    api.handlers.status = () => apiError(404, 'KHONG_TIM_THAY');
    const { unmount } = renderAt('?vnp_TxnRef=42');
    expect(
      await screen.findByRole('heading', {
        name: 'Không tìm thấy giao dịch nạp tiền.',
      }),
    ).toBeVisible();
    unmount();
    for (const search of [
      '',
      '?vnp_TxnRef=abc',
      '?vnp_TxnRef=0',
      '?vnp_TxnRef=1%2F2',
    ]) {
      const view = renderAt(search);
      expect(
        screen.getByRole('heading', {
          name: 'Không tìm thấy giao dịch nạp tiền.',
        }),
      ).toBeVisible();
      view.unmount();
    }
    expect(statusCalls(api)).toEqual(['/patient/wallet/topups/42']);
  });

  it('lỗi máy chủ hay mất mạng ⇒ câu lỗi chung kèm "Thử lại"', async () => {
    const api = installFakeTopupApi();
    api.handlers.status = () => ({ network: true });
    renderAt('?vnp_TxnRef=42');
    expect(
      await screen.findByText(
        'Không có kết nối mạng. Vui lòng kiểm tra và thử lại.',
      ),
    ).toBeVisible();
    api.handlers.status = (id) => ({
      body: statusBody({ maGiaoDich: id, trangThai: 'ThanhCong' }),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(
      await screen.findByRole('heading', { name: 'Nạp tiền thành công' }),
    ).toBeVisible();
  });
});
