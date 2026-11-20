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
  installFakeSpecialRefundApi,
  refundable,
} from '../testing/fake-special-refund-api';
import { SpecialRefundTab } from './special-refund-tab';

// payment F8: tab "Hoàn tiền đặc biệt" với API giả (WQL-04, WQL-05, WQL-09). Hình theo Figma `550:2`; bước tra theo mã lịch hẹn và màn xác nhận là [đề xuất]
// (Trung chốt 20/11/2026). Dữ liệu giả.
afterEach(cleanUpFakeAdminWithdrawalApi);

const CODE = 'CLX-20261010-7K3QF';
const REASON = 'Phòng khám đổi lịch đột xuất, hoàn bù cho bệnh nhân';

const codeInput = () => screen.getByRole('textbox', { name: /Mã lịch hẹn/ });
const amountInput = () =>
  screen.getByRole('textbox', { name: /Số tiền hoàn \(VNĐ\)/ });
const reasonInput = () =>
  screen.getByRole('textbox', { name: /Lý do hoàn tiền/ });
const reviewButton = () =>
  screen.getByRole('button', { name: 'Xem xác nhận hoàn tiền' });

async function searchCode(code = CODE) {
  fireEvent.change(codeInput(), { target: { value: code } });
  fireEvent.click(screen.getByRole('button', { name: 'Tìm' }));
}

async function choosePayment(maGiaoDich = '77', maLichHen = CODE) {
  fireEvent.click(
    await screen.findByRole('radio', {
      name: `Khoản #${maGiaoDich} của lịch ${maLichHen}`,
    }),
  );
}

function fillForm(amount = '100000', reason = REASON) {
  fireEvent.change(amountInput(), { target: { value: amount } });
  fireEvent.change(reasonInput(), { target: { value: reason } });
}

async function openConfirm() {
  fireEvent.click(reviewButton());
  return screen.findByRole('dialog', { name: 'Xác nhận hoàn tiền đặc biệt' });
}

describe('tab Hoàn tiền đặc biệt (payment F8)', () => {
  it('WQL-04 ★ đủ luồng: tra mã lịch, chọn khoản, nhập số tiền và lý do, màn xác nhận, gửi MỘT lời gọi đúng thân; xong thì báo, xoá biểu mẫu, tải lại danh sách', async () => {
    const api = installFakeSpecialRefundApi();
    render(<SpecialRefundTab />);
    // Dải thông tin của Figma `550:2`
    expect(
      screen.getByText(/Mỗi lịch hẹn chỉ được hoàn đặc biệt/),
    ).toBeVisible();
    expect(api.requests).toHaveLength(0);

    await searchCode(`  ${CODE}  `);
    await choosePayment();
    expect(api.lists()).toHaveLength(1);
    expect(api.lists()[0]!.query).toEqual({ maLichHen: CODE });
    fillForm('100000', `  ${REASON}  `);

    const dialog = await openConfirm();
    // Chưa gửi gì khi mới mở màn xác nhận
    expect(api.posts()).toHaveLength(0);
    expect(within(dialog).getByText('#77')).toBeVisible();
    expect(within(dialog).getByText(CODE)).toBeVisible();
    expect(within(dialog).getByText('100.000đ')).toBeVisible();
    expect(within(dialog).getByText(REASON)).toBeVisible();

    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Xác nhận hoàn tiền' }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Đã hoàn 100.000đ vào ví của bệnh nhân.',
    );
    expect(api.posts()).toEqual([
      expect.objectContaining({
        path: '/admin/wallet/special-refunds',
        body: { maGiaoDich: '77', soTien: '100000', lyDo: REASON },
      }),
    ]);
    expect(
      screen.queryByRole('dialog', { name: 'Xác nhận hoàn tiền đặc biệt' }),
    ).toBeNull();
    expect(amountInput()).toHaveValue('');
    expect(reasonInput()).toHaveValue('');
    await waitFor(() => expect(api.lists()).toHaveLength(2));
    expect(
      await screen.findByRole('radio', { name: `Khoản #77 của lịch ${CODE}` }),
    ).not.toBeChecked();
  });

  it('WQL-04 kiểm ở web trước khi mở xác nhận: thiếu mã lịch, chưa chọn khoản, số tiền sai (0, âm, số lẻ, chữ, dấu chấm nghìn), lý do ngắn hơn 10 hay dài hơn 255 ⇒ báo dưới ô, KHÔNG gửi', async () => {
    const api = installFakeSpecialRefundApi();
    render(<SpecialRefundTab />);

    fireEvent.click(screen.getByRole('button', { name: 'Tìm' }));
    expect(await screen.findByText('Vui lòng nhập mã lịch hẹn.')).toBeVisible();
    expect(codeInput()).toHaveAttribute('aria-invalid', 'true');
    expect(api.requests).toHaveLength(0);

    await searchCode();
    await screen.findByRole('radio', { name: `Khoản #77 của lịch ${CODE}` });
    fireEvent.click(reviewButton());
    expect(
      screen.getByText('Vui lòng chọn khoản thanh toán cần hoàn.'),
    ).toBeVisible();
    expect(
      screen.getByText('Số tiền hoàn phải là số nguyên dương, tính bằng đồng.'),
    ).toBeVisible();
    expect(
      screen.getByText('Vui lòng nhập lý do (ít nhất 10 ký tự).'),
    ).toBeVisible();

    await choosePayment();
    for (const bad of ['0', '-1000', '1000.5', 'abc', '100.000', '012']) {
      fillForm(bad);
      fireEvent.click(reviewButton());
      expect(amountInput()).toHaveAttribute('aria-invalid', 'true');
    }
    // Biên: 9 ký tự sau trim ⇒ chặn; 256 ⇒ chặn
    fillForm('100000', '  123456789  ');
    fireEvent.click(reviewButton());
    expect(
      screen.getByText('Vui lòng nhập lý do (ít nhất 10 ký tự).'),
    ).toBeVisible();
    fillForm('100000', 'a'.repeat(256));
    fireEvent.click(reviewButton());
    expect(screen.getByText('Lý do tối đa 255 ký tự.')).toBeVisible();
    expect(
      screen.queryByRole('dialog', { name: 'Xác nhận hoàn tiền đặc biệt' }),
    ).toBeNull();
    expect(api.posts()).toHaveLength(0);

    // Biên hợp lệ: đúng 10 và đúng 255 ký tự
    fillForm('1', '1234567890');
    expect(await openConfirm()).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Quay lại' }));
    fillForm('1', 'a'.repeat(255));
    expect(await openConfirm()).toBeVisible();
    expect(api.posts()).toHaveLength(0);
  });

  it('WQL-04 ★ bấm đúp "Xác nhận hoàn tiền" chỉ MỘT lời gọi; nút vô hiệu khi đang gửi', async () => {
    const api = installFakeSpecialRefundApi();
    let release: (value: { body: unknown; status?: number }) => void = () => {};
    api.handlers.create = () => ({
      hold: new Promise((resolve) => (release = resolve)),
    });
    render(<SpecialRefundTab />);
    await searchCode();
    await choosePayment();
    fillForm();
    const dialog = await openConfirm();
    const confirm = within(dialog).getByRole('button', {
      name: 'Xác nhận hoàn tiền',
    });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(
      within(dialog).getByRole('button', { name: 'Đang gửi...' }),
    ).toBeDisabled();
    expect(
      within(dialog).getByRole('button', { name: 'Quay lại' }),
    ).toBeDisabled();
    release({ body: { maGiaoDich: '77', soTien: '100000.00' } });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Đã hoàn 100.000đ',
    );
    expect(api.posts()).toHaveLength(1);
  });

  it('WQL-04 ★ `DA_HOAN_DAC_BIET` ⇒ đóng xác nhận, báo, tải lại danh sách; khoản không còn trong danh sách thì tự bỏ chọn', async () => {
    const api = installFakeSpecialRefundApi();
    api.handlers.create = () => adminError(409, 'DA_HOAN_DAC_BIET');
    render(<SpecialRefundTab />);
    await searchCode();
    await choosePayment();
    fillForm();
    const dialog = await openConfirm();
    api.handlers.list = () => ({ body: { items: [] } });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Xác nhận hoàn tiền' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Khoản thanh toán này đã được hoàn đặc biệt. Danh sách đã được tải lại.',
    );
    expect(
      screen.queryByRole('dialog', { name: 'Xác nhận hoàn tiền đặc biệt' }),
    ).toBeNull();
    expect(
      await screen.findByText(
        /Không có khoản thanh toán qua ví nào còn hoàn được/,
      ),
    ).toBeVisible();
    expect(api.lists()).toHaveLength(2);
    // Bấm lại không mở xác nhận vì không còn khoản nào được chọn
    fireEvent.click(reviewButton());
    expect(
      screen.getByText('Vui lòng chọn khoản thanh toán cần hoàn.'),
    ).toBeVisible();
    expect(api.posts()).toHaveLength(1);
  });

  it('WQL-04 vượt trần ⇒ báo số trần do máy chủ trả trong 409, giữ số tiền và lý do để sửa, tải lại danh sách; `KHONG_TIM_THAY` ⇒ báo và tải lại', async () => {
    const api = installFakeSpecialRefundApi();
    api.handlers.create = () => ({
      status: 409,
      body: {
        maLoi: 'SO_TIEN_HOAN_VUOT_QUA_DA_THANH_TOAN',
        thongBao: 'câu của máy chủ',
        chiTiet: { conCoTheHoan: '150000.00' },
      },
    });
    render(<SpecialRefundTab />);
    await searchCode();
    await choosePayment();
    fillForm('200000');
    fireEvent.click(
      within(await openConfirm()).getByRole('button', {
        name: 'Xác nhận hoàn tiền',
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Số tiền hoàn vượt quá số còn hoàn được (150.000đ). Danh sách đã được tải lại.',
    );
    expect(amountInput()).toHaveValue('200000');
    expect(reasonInput()).toHaveValue(REASON);
    await waitFor(() => expect(api.lists()).toHaveLength(2));

    api.handlers.create = () => adminError(404, 'KHONG_TIM_THAY');
    await choosePayment();
    fireEvent.click(
      within(await openConfirm()).getByRole('button', {
        name: 'Xác nhận hoàn tiền',
      }),
    );
    expect(
      await screen.findByText(
        'Khoản thanh toán không còn hoàn được. Danh sách đã được tải lại.',
      ),
    ).toBeVisible();
    await waitFor(() => expect(api.lists()).toHaveLength(3));
  });

  it('WQL-05 số trần hiện nguyên `conCoTheHoan` của máy chủ (không tự lấy đã thanh toán trừ đã hoàn) và web KHÔNG chặn theo trần: số lớn hơn vẫn được gửi để máy chủ quyết', async () => {
    const api = installFakeSpecialRefundApi();
    // Cố ý cho ba số không khớp phép trừ: nếu web tự tính sẽ hiện 400.000đ
    api.handlers.list = () => ({
      body: {
        items: [
          refundable({
            soTien: '500000.00',
            daHoan: '100000.00',
            conCoTheHoan: '123456.00',
          }),
        ],
      },
    });
    render(<SpecialRefundTab />);
    await searchCode();
    await choosePayment();
    const option = screen
      .getByRole('radio', { name: `Khoản #77 của lịch ${CODE}` })
      .closest('label')!;
    expect(within(option).getByText('Còn hoàn được: 123.456đ')).toBeVisible();
    expect(within(option).getByText('Đã thanh toán: 500.000đ')).toBeVisible();
    expect(within(option).getByText('Đã hoàn: 100.000đ')).toBeVisible();
    expect(
      screen.getByText('Tối đa 123.456đ (số còn hoàn được của khoản đã chọn).'),
    ).toBeVisible();
    expect(screen.queryByText(/400\.000đ/)).toBeNull();

    fillForm('999999');
    fireEvent.click(
      within(await openConfirm()).getByRole('button', {
        name: 'Xác nhận hoàn tiền',
      }),
    );
    await waitFor(() => expect(api.posts()).toHaveLength(1));
    expect(api.posts()[0]!.body).toMatchObject({ soTien: '999999' });
  });

  it('WQL-09 danh sách: đang tải, mất mạng có "Thử lại", rỗng, phản hồi sai hình dạng (tiền là number)', async () => {
    const api = installFakeSpecialRefundApi();
    api.handlers.list = () => ({ network: true });
    const view = render(<SpecialRefundTab />);
    await searchCode();
    // Kiểm ngay sau khi bấm "Tìm", trước khi API giả trả lời
    expect(screen.getByText('Đang tìm khoản thanh toán...')).toBeVisible();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không có kết nối mạng.',
    );
    api.handlers.list = () => ({ body: { items: [] } });
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(
      await screen.findByText(
        /Không có khoản thanh toán qua ví nào còn hoàn được/,
      ),
    ).toBeVisible();
    view.unmount();

    api.handlers.list = () => ({
      body: { items: [refundable({ conCoTheHoan: 300000 })] },
    });
    render(<SpecialRefundTab />);
    await searchCode();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Đã có lỗi xảy ra. Vui lòng thử lại sau.',
    );
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it('WQL-09 gửi: mất mạng ⇒ câu "chưa rõ" và tải lại, KHÔNG tự gửi lại; máy chủ từ chối lý do ⇒ báo dưới ô lý do; lỗi khác ⇒ giữ màn xác nhận để thử lại', async () => {
    const api = installFakeSpecialRefundApi();
    api.handlers.create = () => ({ network: true });
    render(<SpecialRefundTab />);
    await searchCode();
    await choosePayment();
    fillForm();
    fireEvent.click(
      within(await openConfirm()).getByRole('button', {
        name: 'Xác nhận hoàn tiền',
      }),
    );
    expect(
      await screen.findByText(/Chưa rõ thao tác đã được ghi nhận hay chưa/),
    ).toBeVisible();
    await waitFor(() => expect(api.lists()).toHaveLength(2));
    expect(api.posts()).toHaveLength(1);

    api.handlers.create = () => ({
      status: 400,
      body: {
        maLoi: 'DU_LIEU_KHONG_HOP_LE',
        thongBao: 'câu của máy chủ',
        loi: [{ truong: 'lyDo', ma: 'LY_DO_BAT_BUOC' }],
      },
    });
    await choosePayment();
    fireEvent.click(
      within(await openConfirm()).getByRole('button', {
        name: 'Xác nhận hoàn tiền',
      }),
    );
    expect(
      await screen.findByText(/Lý do không hợp lệ\. Vui lòng nhập 10 đến 255/),
    ).toBeVisible();
    expect(reasonInput()).toHaveAttribute('aria-invalid', 'true');
    expect(
      screen.queryByRole('dialog', { name: 'Xác nhận hoàn tiền đặc biệt' }),
    ).toBeNull();

    api.handlers.create = () => adminError(500, 'LOI_HE_THONG');
    fillForm();
    const dialog = await openConfirm();
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Xác nhận hoàn tiền' }),
    );
    expect(
      await within(dialog).findByText(
        'Đã có lỗi xảy ra. Vui lòng thử lại sau.',
      ),
    ).toBeVisible();
    expect(
      within(dialog).getByRole('button', { name: 'Xác nhận hoàn tiền' }),
    ).toBeEnabled();
  });

  it('WQL-08 (nếp F9) không lưu mã lịch, tên, số tiền hay lý do ở kho trình duyệt và URL', async () => {
    installFakeSpecialRefundApi();
    const before = window.location.href;
    render(<SpecialRefundTab />);
    await searchCode();
    await choosePayment();
    fillForm();
    fireEvent.click(
      within(await openConfirm()).getByRole('button', {
        name: 'Xác nhận hoàn tiền',
      }),
    );
    await screen.findByRole('status');
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(window.location.href).toBe(before);
  });
});
