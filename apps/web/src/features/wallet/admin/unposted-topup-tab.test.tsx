import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanUpFakeAdminWithdrawalApi } from '../testing/fake-admin-withdrawal-api';
import {
  adminError,
  installFakeUnpostedTopupApi,
  unposted,
  UNPOSTED_PATH,
} from '../testing/fake-unposted-topup-api';
import { UnpostedTopupTab } from './unposted-topup-tab';

// payment F9: tab "Nạp ví chưa cộng" với API giả (WQL-06, WQL-08, WQL-09). Hình theo Figma `551:2`. Dữ liệu giả.
afterEach(cleanUpFakeAdminWithdrawalApi);

const table = () =>
  screen.findByRole('table', { name: 'Danh sách nạp ví chưa cộng' });
const openCredit = async (name = 'Trần Thị B') => {
  fireEvent.click(
    await screen.findByRole('button', {
      name: `Cộng ví cho giao dịch của ${name}`,
    }),
  );
  return screen.findByRole('dialog', { name: 'Cộng ví thủ công' });
};
const openUnprocessable = async (name = 'Trần Thị B') => {
  fireEvent.click(
    await screen.findByRole('button', {
      name: `Ghi nhận không thể xử lý giao dịch của ${name}`,
    }),
  );
  return screen.findByRole('dialog', { name: 'Không thể xử lý' });
};
const REASON = 'Ngân hàng đang tra soát lại giao dịch này';

describe('tab Nạp ví chưa cộng (payment F9)', () => {
  it('WQL-06 ★ bảng theo Figma: mã GD và cổng, bệnh nhân, số tiền, xác minh, lượt thử, trạng thái xử lý; dải thông tin', async () => {
    const api = installFakeUnpostedTopupApi();
    api.handlers.list = () => ({
      body: {
        items: [
          unposted(),
          unposted({
            maGiaoDich: '42',
            phuongThuc: 'MoMo',
            maGiaoDichCong: null,
            benhNhan: { hoTen: 'Hoàng Văn F' },
            soTien: '200000.00',
            trangThaiXuLy: 'KhongTheXuLy',
            lyDoKhongTheXuLy: REASON,
          }),
        ],
      },
    });
    render(<UnpostedTopupTab />);
    const rows = within(await table()).getAllByRole('row');
    expect(rows).toHaveLength(3);
    const first = within(rows[1]!);
    expect(first.getByText('#41')).toBeVisible();
    expect(first.getByText('VNPAY: VNP20261010091500U2')).toBeVisible();
    expect(first.getByText('Trần Thị B')).toBeVisible();
    expect(first.getByText('500.000đ')).toBeVisible();
    expect(first.getByText('Đã xác minh')).toBeVisible();
    // 02:15:42Z là 09:15 giờ Việt Nam
    expect(first.getByText('09:15 10/10/2026')).toBeVisible();
    expect(first.getByText('Đã thử 3/3 lần — hết lượt')).toBeVisible();
    expect(first.getByText('Chờ xử lý')).toBeVisible();
    const second = within(rows[2]!);
    expect(second.getByText('MOMO')).toBeVisible();
    // Badge "Không thể xử lý" và nút cùng chữ: badge nằm trong ô trạng thái, kèm lý do
    expect(second.getAllByText('Không thể xử lý')).toHaveLength(2);
    expect(second.getByText(REASON)).toBeVisible();
    expect(screen.getByText(/đã hết lượt đối soát tự động/)).toBeVisible();
  });

  it('WQL-06 ★ Cộng ví: bước xác nhận hiện số của máy chủ; gửi thân RỖNG đúng một lần (bấm đúp); thành công ⇒ câu kết quả, đóng ngăn, tải lại bảng', async () => {
    const api = installFakeUnpostedTopupApi();
    let release: (value: { body: unknown; status?: number }) => void = () => {};
    api.handlers.credit = () => ({
      hold: new Promise((resolve) => (release = resolve)),
    });
    render(<UnpostedTopupTab />);
    const dialog = await openCredit();
    expect(within(dialog).getByText('500.000đ')).toBeVisible();
    expect(within(dialog).getByText(/sẽ được cộng 500\.000đ/)).toBeVisible();
    const confirm = within(dialog).getByRole('button', {
      name: 'Xác nhận cộng ví',
    });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(
      await within(dialog).findByRole('button', { name: 'Đang gửi...' }),
    ).toBeDisabled();
    expect(api.posts()).toEqual([
      {
        method: 'POST',
        path: `${UNPOSTED_PATH}/41/credit`,
        query: {},
        body: {},
      },
    ]);
    api.handlers.list = () => ({ body: { items: [] } });
    release({ body: { maGiaoDich: '41', trangThaiDoiSoat: 'DaDoiSoat' } });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Đã cộng tiền vào ví của bệnh nhân.',
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(
      await screen.findByText('Không có giao dịch nạp ví nào cần xử lý.'),
    ).toBeVisible();
    expect(api.lists()).toHaveLength(2);
    expect(api.posts()).toHaveLength(1);
  });

  it('WQL-06 Cộng ví trả 409 GIAO_DICH_NAP_DA_DOI_SOAT ⇒ câu riêng, đóng ngăn, tải lại; KHÔNG theo thongBao của máy chủ', async () => {
    const api = installFakeUnpostedTopupApi();
    api.handlers.credit = () => adminError(409, 'GIAO_DICH_NAP_DA_DOI_SOAT');
    render(<UnpostedTopupTab />);
    const dialog = await openCredit();
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Xác nhận cộng ví' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Giao dịch này đã được cộng vào ví. Danh sách đã được tải lại.',
    );
    expect(screen.queryByText('câu của máy chủ')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(api.lists()).toHaveLength(2));
  });

  it('WQL-06 404 hay mất mạng khi gửi ⇒ đóng ngăn, tải lại, KHÔNG tự gửi lại; lỗi lạ ⇒ giữ ngăn để thử lại', async () => {
    const api = installFakeUnpostedTopupApi();
    api.handlers.credit = () => ({ network: true });
    render(<UnpostedTopupTab />);
    fireEvent.click(
      within(await openCredit()).getByRole('button', {
        name: 'Xác nhận cộng ví',
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Chưa rõ thao tác đã được ghi nhận hay chưa.',
    );
    expect(api.posts()).toHaveLength(1);

    api.handlers.credit = () => adminError(404, 'KHONG_TIM_THAY');
    fireEvent.click(
      within(await openCredit()).getByRole('button', {
        name: 'Xác nhận cộng ví',
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Giao dịch không còn ở danh sách cần xử lý.',
    );

    api.handlers.credit = () => adminError(500, 'LOI_HE_THONG');
    const dialog = await openCredit();
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Xác nhận cộng ví' }),
    );
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Đã có lỗi xảy ra. Vui lòng thử lại sau.',
    );
    expect(
      within(dialog).getByRole('button', { name: 'Xác nhận cộng ví' }),
    ).toBeEnabled();
  });

  it('WQL-06 Không thể xử lý: lý do BẮT BUỘC (10 đến 255 sau khi cắt khoảng trắng) ⇒ lỗi dưới ô, không gửi; đúng thì gửi lyDo đã cắt, giữ dòng ở bảng', async () => {
    const api = installFakeUnpostedTopupApi();
    render(<UnpostedTopupTab />);
    const dialog = await openUnprocessable();
    const box = within(dialog).getByRole('textbox', { name: /Lý do/ });
    const submit = within(dialog).getByRole('button', { name: 'Xác nhận' });
    for (const value of ['', '         ', 'Ngắn quá', 'a'.repeat(256)]) {
      fireEvent.change(box, { target: { value } });
      fireEvent.click(submit);
      expect(await within(dialog).findByRole('alert')).toBeVisible();
      expect(box).toHaveAttribute('aria-invalid', 'true');
    }
    expect(api.posts()).toEqual([]);

    fireEvent.change(box, { target: { value: `  ${REASON}  ` } });
    fireEvent.click(submit);
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Đã ghi nhận không thể xử lý.',
    );
    expect(api.posts()).toEqual([
      {
        method: 'POST',
        path: `${UNPOSTED_PATH}/41/mark-unprocessable`,
        query: {},
        body: { lyDo: REASON },
      },
    ]);
  });

  it('WQL-06 máy chủ từ chối lý do (400, loi[].truong = lyDo) ⇒ lỗi dưới ô, giữ ngăn và chữ đã nhập', async () => {
    const api = installFakeUnpostedTopupApi();
    api.handlers.unprocessable = () => ({
      status: 400,
      body: {
        maLoi: 'DU_LIEU_KHONG_HOP_LE',
        thongBao: 'câu của máy chủ',
        loi: [{ truong: 'lyDo', ma: 'LY_DO_BAT_BUOC' }],
      },
    });
    render(<UnpostedTopupTab />);
    const dialog = await openUnprocessable();
    const box = within(dialog).getByRole('textbox', { name: /Lý do/ });
    fireEvent.change(box, { target: { value: REASON } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Vui lòng nhập lý do',
    );
    expect(box).toHaveValue(REASON);
  });

  it('WQL-06 `Hủy` đóng ngăn, không gọi route ghi nào', async () => {
    const api = installFakeUnpostedTopupApi();
    render(<UnpostedTopupTab />);
    const dialog = await openCredit();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hủy' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.posts()).toEqual([]);
  });

  it('WQL-08 không lưu tên hay số tiền ở kho trình duyệt và URL', async () => {
    installFakeUnpostedTopupApi();
    const before = window.location.href;
    render(<UnpostedTopupTab />);
    fireEvent.click(
      within(await openCredit()).getByRole('button', {
        name: 'Xác nhận cộng ví',
      }),
    );
    await screen.findByRole('status');
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(window.location.href).toBe(before);
  });

  it('WQL-09 đang tải, rỗng, mất mạng (có "Thử lại"), phản hồi sai hình dạng (tiền là number)', async () => {
    const api = installFakeUnpostedTopupApi();
    api.handlers.list = () => ({ network: true });
    const view = render(<UnpostedTopupTab />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Đang tải danh sách nạp ví chưa cộng...',
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không có kết nối mạng.',
    );
    api.handlers.list = () => ({ body: { items: [] } });
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(
      await screen.findByText('Không có giao dịch nạp ví nào cần xử lý.'),
    ).toBeVisible();
    view.unmount();

    api.handlers.list = () => ({
      body: { items: [unposted({ soTien: 500000 })] },
    });
    render(<UnpostedTopupTab />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Đã có lỗi xảy ra. Vui lòng thử lại sau.',
    );
    expect(screen.queryByText('500.000đ')).toBeNull();
  });
});
