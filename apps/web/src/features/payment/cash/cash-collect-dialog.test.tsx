import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MA_LICH_HEN,
  apiError,
  cashPreviewBody,
  cleanUpFakeCashApi,
  collectedBody,
  installFakeCashApi,
} from '../testing/fake-cash-api';
import { CashCollectDialog } from './cash-collect-dialog';
import { formatVietnamDateTime } from './cash-format';

// payment F4: hộp "Thu tiền & tiếp đón" với API giả (WTQ-01 đến WTQ-03, WTQ-05 đến WTQ-07). Hình theo Figma `492:2`. Dữ liệu giả.

afterEach(cleanUpFakeCashApi);

function renderDialog() {
  const onClose = vi.fn();
  const onChanged = vi.fn();
  render(
    <CashCollectDialog
      maLichHen={MA_LICH_HEN}
      appointment={{
        nguoiKham: 'Nguyễn Văn A',
        thoiGian: '18/10 lúc 08:00',
        bacSi: 'ThS.BS Nguyễn Minh Anh',
      }}
      returnFocusRef={createRef<HTMLElement>()}
      onClose={onClose}
      onChanged={onChanged}
    />,
  );
  return { onClose, onChanged };
}

const submitButton = () =>
  screen.findByRole('button', { name: 'Thu tiền & tiếp đón' });
const posts = (api: ReturnType<typeof installFakeCashApi>) =>
  api.calls.filter((call) => call.method === 'POST');
const collectPath = `/reception/appointments/${MA_LICH_HEN}/collect-cash`;

describe('CashCollectDialog (payment F4)', () => {
  it('WTQ-01 ★ hiện ba số do máy chủ trả, KHÔNG tính ở client (đã thanh toán trước cố ý khác giá − thu tại quầy)', async () => {
    const api = installFakeCashApi();
    // Đột biến: nếu client lấy giá trừ thu tại quầy sẽ ra 100.000đ, không phải 99.000đ
    api.handlers.preview = () => ({
      body: cashPreviewBody({ daThanhToanTruoc: '99000.00' }),
    });
    renderDialog();
    expect(await submitButton()).toBeEnabled();
    expect(
      screen.getByRole('dialog', { name: 'Thu tiền & tiếp đón' }),
    ).toBeVisible();
    expect(screen.getByText('300.000đ')).toBeVisible();
    expect(screen.getByText('99.000đ')).toBeVisible();
    expect(screen.queryByText('100.000đ')).toBeNull();
    // "200.000đ" ở dòng Thu tại quầy và trong dải cảnh báo
    expect(screen.getAllByText('200.000đ')).toHaveLength(2);
    expect(screen.getByText('Nguyễn Văn A')).toBeVisible();
    expect(screen.getByText(`#${MA_LICH_HEN}`)).toBeVisible();
    expect(screen.getByText('18/10 lúc 08:00')).toBeVisible();
    expect(api.calls).toEqual([
      {
        method: 'GET',
        path: `/reception/appointments/${MA_LICH_HEN}/cash-preview`,
        body: undefined,
      },
    ]);
  });

  it('WTQ-02 ★ xác nhận: nút vô hiệu khi gửi, BẤM ĐÚP chỉ một lời gọi, thân chỉ có soTien là số nguyên đồng', async () => {
    const api = installFakeCashApi();
    let release: (value: { body: unknown; status?: number }) => void = () => {};
    api.handlers.collect = () => ({
      hold: new Promise((resolve) => (release = resolve)),
    });
    const { onClose } = renderDialog();
    const button = await submitButton();
    fireEvent.click(button);
    fireEvent.click(button);
    expect(
      await screen.findByRole('button', { name: 'Đang thu tiền...' }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Hủy' })).toBeDisabled();
    // Đang gửi thì Esc không đóng
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(posts(api)).toEqual([
      { method: 'POST', path: collectPath, body: { soTien: '200000' } },
    ]);
    release({ body: collectedBody() });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Đã thu tiền và tiếp đón bệnh nhân.',
    );
    expect(posts(api)).toHaveLength(1);
  });

  it('WTQ-03 SO_TIEN_KHONG_KHOP ⇒ báo lệch, TẢI LẠI số mới, báo trang tải lại; bấm lại gửi số mới', async () => {
    const api = installFakeCashApi();
    api.handlers.collect = () => apiError(409, 'SO_TIEN_KHONG_KHOP');
    const { onChanged } = renderDialog();
    const button = await submitButton();
    // Máy chủ đã đổi số (Bệnh nhân vừa trả thêm bằng ví): lần tải lại sau lỗi thấy số mới
    api.handlers.preview = () => ({
      body: cashPreviewBody({
        daThanhToanTruoc: '150000.00',
        thuTaiQuay: '150000.00',
      }),
    });
    fireEvent.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Số tiền thu không khớp số còn phải thu.',
    );
    expect(onChanged).toHaveBeenCalledTimes(1);
    // Số mới về sau lần tải lại
    expect(await screen.findAllByText('150.000đ')).toHaveLength(3);
    api.handlers.collect = () => ({ body: collectedBody() });
    fireEvent.click(await submitButton());
    await screen.findByRole('status');
    expect(posts(api).map((call) => call.body)).toEqual([
      { soTien: '200000' },
      { soTien: '150000' },
    ]);
  });

  it('WTQ-03 NGOAI_KHUNG_GIO_TIEP_DON ⇒ nêu tu, den theo giờ Việt Nam; vẫn cho bấm lại', async () => {
    const api = installFakeCashApi();
    api.handlers.collect = () => ({
      status: 409,
      body: {
        maLoi: 'NGOAI_KHUNG_GIO_TIEP_DON',
        thongBao: 'câu của máy chủ',
        chiTiet: {
          tu: '2026-10-18T00:30:00.000Z',
          den: '2026-10-18T01:15:00.000Z',
        },
      },
    });
    renderDialog();
    fireEvent.click(await submitButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Chỉ thu tiền và tiếp đón từ 07:30 18/10/2026 đến 08:15 18/10/2026.',
    );
    expect(await submitButton()).toBeEnabled();
  });

  it.each([
    [
      409,
      'LICH_HEN_KHONG_CHO_THU_TIEN',
      'Lịch hẹn không còn ở trạng thái đã xác nhận.',
    ],
    [409, 'KHONG_CON_PHAI_THU', 'Lịch hẹn không còn khoản phải thu.'],
    [404, 'KHONG_TIM_THAY', 'Không tìm thấy lịch hẹn.'],
  ])(
    'WTQ-03 thu trả %i %s ⇒ đúng câu theo mã, dừng (chỉ còn `Đóng`), báo trang tải lại',
    async (status, maLoi, message) => {
      const api = installFakeCashApi();
      api.handlers.collect = () => apiError(status, maLoi);
      const { onChanged, onClose } = renderDialog();
      fireEvent.click(await submitButton());
      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(
        screen.queryByRole('button', { name: 'Thu tiền & tiếp đón' }),
      ).toBeNull();
      expect(onChanged).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getAllByRole('button', { name: 'Đóng' })[1]!);
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(posts(api)).toHaveLength(1);
    },
  );

  it('WTQ-03 bản xem trước trả 409 LICH_HEN_KHONG_CHO_THU_TIEN ⇒ câu theo mã, không có nút thu, báo trang tải lại', async () => {
    const api = installFakeCashApi();
    api.handlers.preview = () => apiError(409, 'LICH_HEN_KHONG_CHO_THU_TIEN');
    const { onChanged } = renderDialog();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Lịch hẹn không còn ở trạng thái đã xác nhận.',
    );
    expect(
      screen.queryByRole('button', { name: 'Thu tiền & tiếp đón' }),
    ).toBeNull();
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  });

  it('WTQ-03 mất mạng khi gửi ⇒ cảnh báo chưa rõ, KHÔNG tự gửi lại; mã lạ ⇒ câu chung; cả hai cho bấm lại, chọn câu theo maLoi không theo thongBao', async () => {
    const api = installFakeCashApi();
    api.handlers.collect = () => ({ network: true });
    renderDialog();
    fireEvent.click(await submitButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Chưa rõ tiền đã được ghi nhận hay chưa.',
    );
    expect(posts(api)).toHaveLength(1);

    api.handlers.collect = () => apiError(409, 'MA_LA_CHUA_BIET');
    fireEvent.click(await submitButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Đã có lỗi xảy ra. Vui lòng thử lại sau.',
    );
    expect(screen.queryByText('câu của máy chủ')).toBeNull();
    expect(await submitButton()).toBeEnabled();
  });

  it('WTQ-05 thành công ⇒ phiếu thu do máy chủ trả (số phiếu, thời điểm giờ Việt Nam, người thu), chỉ còn `Đóng`, báo trang tải lại', async () => {
    installFakeCashApi();
    const { onChanged, onClose } = renderDialog();
    fireEvent.click(await submitButton());
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Đã thu tiền và tiếp đón bệnh nhân.',
    );
    expect(screen.getByText('77')).toBeVisible();
    expect(screen.getByText('08:05 18/10/2026')).toBeVisible();
    expect(screen.getByText('Lễ Tân Mẫu')).toBeVisible();
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole('button', { name: 'Thu tiền & tiếp đón' }),
    ).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'Đóng' })[1]!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('WTQ-06 `Hủy`, nút X, Esc và bấm lớp phủ đóng hộp, KHÔNG gọi route ghi nào', async () => {
    const api = installFakeCashApi();
    const { onClose, onChanged } = renderDialog();
    await submitButton();
    // Tiêu điểm đầu vào nút an toàn `Hủy`
    expect(screen.getByRole('button', { name: 'Hủy' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Hủy' }));
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('dialog').parentElement!);
    expect(onClose).toHaveBeenCalledTimes(4);
    expect(posts(api)).toEqual([]);
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('WTQ-07 không lưu thông tin tiền ở kho trình duyệt hay URL', async () => {
    installFakeCashApi();
    const before = window.location.href;
    renderDialog();
    fireEvent.click(await submitButton());
    await screen.findByRole('status');
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(window.location.href).toBe(before);
  });

  it('WTQ-01 bản xem trước đang tải, mất mạng (có "Thử lại"), phản hồi sai hình dạng (tiền là number) ⇒ không có số nào hiện', async () => {
    const api = installFakeCashApi();
    api.handlers.preview = () => ({ network: true });
    renderDialog();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Đang tải số tiền cần thu...',
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không có kết nối mạng.',
    );
    expect(
      screen.getByRole('button', { name: 'Thu tiền & tiếp đón' }),
    ).toBeDisabled();
    api.handlers.preview = () => ({
      body: cashPreviewBody({ thuTaiQuay: 200000 }),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Đã có lỗi xảy ra. Vui lòng thử lại sau.',
    );
    expect(screen.queryByText('200.000đ')).toBeNull();
  });

  it('định dạng ngày giờ theo giờ Việt Nam, không theo múi giờ máy (17:30Z là 00:30 hôm sau)', () => {
    expect(formatVietnamDateTime('2026-11-09T17:30:00.000Z')).toBe(
      '00:30 10/11/2026',
    );
  });
});
