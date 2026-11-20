import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  adminError,
  cleanUpFakeAdminWithdrawalApi,
  detail,
  installFakeAdminWithdrawalApi,
  item,
  listPage,
} from '../testing/fake-admin-withdrawal-api';
import { FinancePage } from './finance-page';

// payment F7: màn "Quản lý tài chính ví", tab Yêu cầu rút tiền, với API giả (WQL-01, WQL-02, WQL-07). Hình theo Figma `549:2`, `566:2`, `567:2`, `581:2`. Dữ liệu giả.
// WQL-03 (Admin chi nhánh) và WQL-10 (menu) qua router thật: `router/wallet-finance-route.test.tsx`.
afterEach(cleanUpFakeAdminWithdrawalApi);

const table = () =>
  screen.findByRole('table', { name: 'Danh sách yêu cầu rút tiền' });
const filter = (name: RegExp) =>
  within(screen.getByRole('group', { name: 'Lọc theo trạng thái' })).getByRole(
    'button',
    { name },
  );
const panel = () =>
  screen.findByRole('dialog', { name: 'Chi tiết yêu cầu rút tiền' });

async function openDetail(name = 'Trần Văn C') {
  fireEvent.click(
    await screen.findByRole('button', { name: `Chi tiết yêu cầu của ${name}` }),
  );
  const dialog = await panel();
  await within(dialog).findByText('Ví của bệnh nhân');
  return dialog;
}

describe('màn Quản lý tài chính ví (payment F7)', () => {
  it('WQL-01 ba tab của Figma; tab Hoàn tiền đặc biệt (F8) hiện biểu mẫu và CHƯA gọi API khi chưa tra; tab Nạp ví chưa cộng (F9) gọi API của nó; KHÔNG gọi lại API rút tiền khi đang mở tab khác', async () => {
    const api = installFakeAdminWithdrawalApi();
    render(<FinancePage />);
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Yêu cầu rút tiền',
      'Hoàn tiền đặc biệt',
      'Nạp ví chưa cộng',
    ]);
    await table();
    fireEvent.click(screen.getByRole('tab', { name: 'Hoàn tiền đặc biệt' }));
    expect(
      within(
        screen.getByRole('tabpanel', { name: 'Hoàn tiền đặc biệt' }),
      ).getByRole('heading', { name: 'Nhập thông tin hoàn tiền' }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('tab', { name: 'Nạp ví chưa cộng' }));
    await waitFor(() =>
      expect(api.gets('/admin/payment/unposted-topups')).toHaveLength(1),
    );
    expect(api.gets()).toHaveLength(1);
    expect(api.gets('/admin/wallet/refundable-payments')).toHaveLength(0);
  });

  it('WQL-01 ★ bảng đúng cột Figma, số tiền và giờ VN; bộ lọc có số đếm của máy chủ; chọn lọc gửi `trangThai` và về trang 1', async () => {
    const api = installFakeAdminWithdrawalApi();
    api.handlers.list = () => ({
      body: listPage([
        item(),
        item({
          maYeuCau: '9',
          benhNhan: { hoTen: 'Hoàng Văn F' },
          soTien: '50000.00',
          trangThai: 'TuChoi',
          thoiDiemYeuCau: '2026-10-12T01:30:00.000Z',
          thoiDiemXuLy: '2026-10-13T02:00:00.000Z',
        }),
      ]),
    });
    render(<FinancePage />);
    const grid = await table();
    expect(
      within(grid)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual([
      'Bệnh nhân',
      'Số tiền',
      'Thời gian gửi',
      'Xử lý lúc',
      'Trạng thái',
      '',
    ]);
    const rows = within(grid).getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent(
      'Trần Văn C100.000đ10:30 16/10/2026—Chờ duyệt',
    );
    expect(rows[1]).toHaveTextContent(
      'Hoàng Văn F50.000đ08:30 12/10/202609:00 13/10/2026Từ chối',
    );
    expect(filter(/^Tất cả/)).toHaveTextContent('Tất cả5');
    expect(filter(/^Chờ duyệt/)).toHaveTextContent('Chờ duyệt3');
    expect(filter(/^Đã duyệt/)).toHaveTextContent('Đã duyệt1');
    expect(filter(/^Từ chối/)).toHaveTextContent('Từ chối1');

    fireEvent.click(filter(/^Chờ duyệt/));
    await waitFor(() => expect(api.gets()).toHaveLength(2));
    expect(api.gets()[1]!.query).toEqual({ trang: '1', trangThai: 'ChoDuyet' });
    expect(filter(/^Chờ duyệt/)).toHaveAttribute('aria-pressed', 'true');
  });

  it('WQL-01 phân trang gửi `trang`; rỗng; lỗi có "Thử lại"; mất mạng', async () => {
    const api = installFakeAdminWithdrawalApi();
    api.handlers.list = (query) => ({
      body: listPage([item({ maYeuCau: `r${query.trang}` })], {
        total: 45,
        trang: Number(query.trang),
      }),
    });
    render(<FinancePage />);
    await table();
    fireEvent.click(screen.getByRole('button', { name: /Trang sau|Sau/ }));
    await waitFor(() =>
      expect(api.gets().at(-1)!.query).toEqual({ trang: '2' }),
    );

    cleanUpFakeAdminWithdrawalApi();
    const empty = installFakeAdminWithdrawalApi();
    empty.handlers.list = () => ({ body: listPage([]) });
    const { unmount } = render(<FinancePage />);
    expect(
      await screen.findByText('Chưa có yêu cầu rút tiền nào.'),
    ).toBeVisible();
    unmount();

    const failing = installFakeAdminWithdrawalApi();
    failing.handlers.list = () => adminError(500, 'LOI_HE_THONG');
    const second = render(<FinancePage />);
    const retry = await screen.findByRole('button', { name: 'Thử lại' });
    failing.handlers.list = () => ({ network: true });
    fireEvent.click(retry);
    expect(
      await screen.findByRole('button', { name: 'Thử lại' }),
    ).toBeVisible();
    expect(failing.gets()).toHaveLength(2);
    second.unmount();
  });

  it('WQL-02 ngăn chi tiết: thông tin yêu cầu, hai số ví của máy chủ (KHÔNG có "Khả dụng", "Sau khi duyệt"), giao dịch gần đây', async () => {
    installFakeAdminWithdrawalApi();
    render(<FinancePage />);
    const dialog = await openDetail();
    expect(dialog).toHaveTextContent('Mã yêu cầu 12');
    expect(dialog).toHaveTextContent('Số tiền yêu cầu100.000đ');
    expect(dialog).toHaveTextContent('Số dư thực tế1.000.000đ');
    expect(dialog).toHaveTextContent('Đang giữ (chờ duyệt)300.000đ');
    expect(dialog).not.toHaveTextContent('Khả dụng');
    expect(dialog).not.toHaveTextContent('Sau khi duyệt');
    expect(
      within(dialog).getByRole('region', { name: 'Giao dịch gần đây' }),
    ).toHaveTextContent('Nạp ví10:00 01/10/2026+500.000đ');
    expect(dialog).not.toHaveTextContent('prototype');
  });

  it('WQL-02 ★ duyệt: hộp xác nhận Figma, MỘT POST thân rỗng dù bấm đúp, nút vô hiệu khi gửi; xong ⇒ báo, tải lại ngăn và danh sách', async () => {
    const api = installFakeAdminWithdrawalApi();
    let release: (value: { body: unknown; status?: number }) => void = () => {};
    api.handlers.approve = () => ({
      hold: new Promise((resolve) => {
        release = resolve;
      }),
    });
    render(<FinancePage />);
    const dialog = await openDetail();
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Duyệt yêu cầu' }),
    );
    const box = within(dialog).getByRole('region', { name: 'Xác nhận duyệt' });
    expect(box).toHaveTextContent('Xác nhận duyệt rút 100.000đ?');
    expect(box).toHaveTextContent('Số dư sẽ giảm 100.000đ trong ví CLINIX.');
    const confirm = within(box).getByRole('button', { name: 'Xác nhận duyệt' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(
      await within(box).findByRole('button', { name: 'Đang gửi...' }),
    ).toBeDisabled();
    expect(within(box).getByRole('button', { name: 'Hủy' })).toBeDisabled();

    const listBefore = api.gets().length;
    api.handlers.detail = () => ({
      body: detail({
        trangThai: 'DaDuyet',
        thoiDiemXuLy: '2026-10-16T04:00:00.000Z',
      }),
    });
    release({ body: { maYeuCau: '12', trangThai: 'DaDuyet' } });
    expect(
      await within(dialog).findByText('Đã duyệt yêu cầu rút tiền.'),
    ).toBeVisible();
    expect(api.posts()).toEqual([
      expect.objectContaining({
        path: '/admin/wallet/withdrawals/12/approve',
        body: {},
      }),
    ]);
    // WQL-07: đã duyệt thì không còn nút xử lý
    await within(dialog).findByText('Đã duyệt');
    expect(
      within(dialog).queryByRole('button', { name: 'Duyệt yêu cầu' }),
    ).toBeNull();
    expect(
      within(dialog).queryByRole('button', { name: 'Từ chối' }),
    ).toBeNull();
    await waitFor(() => expect(api.gets().length).toBeGreaterThan(listBefore));
  });

  it('WQL-02 từ chối: lý do BẮT BUỘC (trống, toàn khoảng trắng, 201 ký tự bị chặn; 200 ký tự được), gửi `ghiChu` đã cắt khoảng trắng', async () => {
    const api = installFakeAdminWithdrawalApi();
    render(<FinancePage />);
    const dialog = await openDetail();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Từ chối' }));
    const form = within(dialog).getByRole('form', { name: 'Xác nhận từ chối' });
    expect(form).toHaveTextContent(
      'Bắt buộc — bệnh nhân sẽ thấy lý do này trong thông báo.',
    );
    const reason = within(form).getByLabelText(/Lý do từ chối/);
    const submit = within(form).getByRole('button', {
      name: 'Xác nhận từ chối',
    });

    fireEvent.click(submit);
    expect(await within(form).findByRole('alert')).toHaveTextContent(
      'Vui lòng nhập lý do từ chối.',
    );
    fireEvent.change(reason, { target: { value: '    ' } });
    fireEvent.click(submit);
    expect(await within(form).findByRole('alert')).toHaveTextContent(
      'Vui lòng nhập lý do từ chối.',
    );
    fireEvent.change(reason, { target: { value: 'x'.repeat(201) } });
    fireEvent.click(submit);
    expect(await within(form).findByRole('alert')).toHaveTextContent(
      'Lý do từ chối tối đa 200 ký tự.',
    );
    expect(api.posts()).toHaveLength(0);

    fireEvent.change(reason, { target: { value: `  ${'y'.repeat(200)}  ` } });
    fireEvent.click(submit);
    expect(
      await within(dialog).findByText('Đã từ chối yêu cầu rút tiền.'),
    ).toBeVisible();
    expect(api.posts()).toEqual([
      expect.objectContaining({
        path: '/admin/wallet/withdrawals/12/reject',
        body: { ghiChu: 'y'.repeat(200) },
      }),
    ]);
  });

  it('WQL-02 ★ YEU_CAU_DA_XU_LY ⇒ báo "đã được xử lý bởi người khác" và TẢI LẠI; không gửi lại', async () => {
    const api = installFakeAdminWithdrawalApi();
    api.handlers.approve = () => adminError(409, 'YEU_CAU_DA_XU_LY');
    render(<FinancePage />);
    const dialog = await openDetail();
    const detailsBefore = api.gets('/admin/wallet/withdrawals/12').length;
    const listBefore = api.gets().length;
    api.handlers.detail = () => ({ body: detail({ trangThai: 'TuChoi' }) });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Duyệt yêu cầu' }),
    );
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Xác nhận duyệt' }),
    );
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Yêu cầu này đã được xử lý bởi người khác.',
    );
    await waitFor(() =>
      expect(api.gets('/admin/wallet/withdrawals/12').length).toBe(
        detailsBefore + 1,
      ),
    );
    await waitFor(() => expect(api.gets().length).toBe(listBefore + 1));
    expect(await within(dialog).findByText('Từ chối')).toBeVisible();
    expect(
      within(dialog).queryByRole('button', { name: 'Duyệt yêu cầu' }),
    ).toBeNull();
    expect(api.posts()).toHaveLength(1);
  });

  it('WQL-02 hết giờ ⇒ cảnh báo, tải lại, KHÔNG gửi lại lệnh; lỗi máy chủ khác ⇒ giữ hộp và lý do để thử lại', async () => {
    const api = installFakeAdminWithdrawalApi();
    api.handlers.reject = () => adminError(500, 'LOI_HE_THONG');
    render(<FinancePage />);
    const dialog = await openDetail();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Từ chối' }));
    const form = within(dialog).getByRole('form', { name: 'Xác nhận từ chối' });
    fireEvent.change(within(form).getByLabelText(/Lý do từ chối/), {
      target: { value: 'Sai thông tin' },
    });
    fireEvent.click(
      within(form).getByRole('button', { name: 'Xác nhận từ chối' }),
    );
    expect(await within(form).findByRole('alert')).toHaveTextContent(
      'Đã có lỗi xảy ra. Vui lòng thử lại sau.',
    );
    expect(within(form).getByLabelText(/Lý do từ chối/)).toHaveValue(
      'Sai thông tin',
    );

    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.handlers.reject = () => ({ hold: new Promise(() => {}) });
    fireEvent.click(
      within(form).getByRole('button', { name: 'Xác nhận từ chối' }),
    );
    await vi.advanceTimersByTimeAsync(15_001);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Chưa rõ thao tác đã được ghi nhận hay chưa.',
    );
    await vi.advanceTimersByTimeAsync(60_000);
    expect(api.posts()).toHaveLength(2);
  });

  it('WQL-07 yêu cầu Đã duyệt hay Từ chối: ngăn chi tiết KHÔNG có nút xử lý, có giờ xử lý', async () => {
    const api = installFakeAdminWithdrawalApi();
    for (const trangThai of ['DaDuyet', 'TuChoi']) {
      api.handlers.list = () => ({ body: listPage([item({ trangThai })]) });
      api.handlers.detail = () => ({
        body: detail({ trangThai, thoiDiemXuLy: '2026-10-07T07:00:00.000Z' }),
      });
      const view = render(<FinancePage />);
      const dialog = await openDetail();
      expect(dialog).toHaveTextContent('Xử lý lúc14:00 07/10/2026');
      expect(
        within(dialog).queryByRole('button', { name: 'Duyệt yêu cầu' }),
      ).toBeNull();
      expect(
        within(dialog).queryByRole('button', { name: 'Từ chối' }),
      ).toBeNull();
      view.unmount();
    }
  });
});
