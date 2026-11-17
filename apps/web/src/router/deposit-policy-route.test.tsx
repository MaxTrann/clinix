import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ADMIN_DEPOSIT_POLICY_PATH } from '../shared/routes/wallet-paths';
import {
  BRANCH_SCOPE,
  cleanUpDepositPolicy,
  deferred,
  renderDepositPolicy,
} from './deposit-policy-harness';

// payment F5 — màn "Đặt cọc & Hoàn tiền" của Quản trị viên qua ROUTER THẬT (khung Admin, guard, menu) với API giả: WCP-01…WCP-05, WCP-07 (WCP-06 ở `policy-form.test.ts`). Dữ liệu giả.
afterEach(cleanUpDepositPolicy);

const servicesPanel = () => screen.findByRole('region', { name: 'Dịch vụ' });
const serviceButton = async (name: RegExp) =>
  within(await servicesPanel()).findByRole('button', { name });
const depositInput = () => screen.findByLabelText('Mức đặt cọc');
const hoursInput = (index: number) =>
  screen.getByLabelText(`Hủy trước (giờ) của mốc ${index + 1}`);
const rateInput = (index: number) =>
  screen.getByLabelText(`Hoàn cọc (%) của mốc ${index + 1}`);
const type = (element: HTMLElement, value: string) =>
  fireEvent.change(element, { target: { value } });

describe('màn Đặt cọc & Hoàn tiền (payment F5)', () => {
  it('WCP-01 bảng mặc định CHỈ ĐỌC (không nút "Chỉnh sửa"), dịch vụ theo nhóm có nhãn "Mặc định" / "Riêng" kèm mức cọc; chọn dịch vụ thì hiện cọc và mốc của nó', async () => {
    renderDepositPolicy();

    const defaults = await screen.findByRole('region', {
      name: 'Chính sách hủy / hoàn mặc định',
    });
    expect(within(defaults).getByText('Toàn hệ thống')).toBeVisible();
    expect(
      within(defaults)
        .getAllByRole('row')
        .slice(1)
        .map((row) => row.textContent),
    ).toEqual(['≥ 24h100%', '≥ 2h50%', '≥ 0h0%']);
    expect(within(defaults).queryByRole('button')).toBeNull();

    const panel = await servicesPanel();
    expect(
      within(panel)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(['Khám theo chuyên khoa', 'Khám tổng quát']);
    const heart = await serviceButton(/Tim mạch/);
    expect(heart).toHaveTextContent('300.000đ');
    expect(heart).toHaveTextContent('Mặc định');
    const bones = await serviceButton(/Cơ Xương Khớp/);
    expect(bones).toHaveTextContent('350.000đ · Cọc 100.000đ');
    expect(bones).toHaveTextContent('Riêng');

    // Chưa chọn: khung phải là câu hướng dẫn của Figma
    expect(
      screen.getByText(
        'Chọn một dịch vụ bên trái để xem / chỉnh đặt cọc và chính sách riêng',
      ),
    ).toBeVisible();

    fireEvent.click(bones);
    expect(bones).toHaveAttribute('aria-pressed', 'true');
    expect(await depositInput()).toHaveValue('100000');
    expect(hoursInput(0)).toHaveValue('24');
    expect(rateInput(0)).toHaveValue('100');
    expect(hoursInput(1)).toHaveValue('2');
    expect(rateInput(1)).toHaveValue('50');
  });

  it('WCP-02 ★ thêm, xoá, sửa mốc và "Áp dụng bảng mẫu"; lưu MỘT lần (nút tắt khi đang gửi, bấm đúp không gửi hai lần); lưu xong nhãn đổi thành "Riêng"', async () => {
    const pending = deferred();
    const { api } = renderDepositPolicy({
      before: (fake) => {
        fake.next.put.push(() => pending.promise);
      },
    });
    fireEvent.click(await serviceButton(/Tim mạch/));
    type(await depositInput(), '50000');

    // Thêm hai mốc, xoá mốc đầu, sửa mốc còn lại
    fireEvent.click(screen.getByRole('button', { name: 'Thêm mốc' }));
    fireEvent.click(screen.getByRole('button', { name: 'Thêm mốc' }));
    type(hoursInput(0), '99');
    fireEvent.click(screen.getByRole('button', { name: 'Xoá mốc 1' }));
    type(hoursInput(0), '12');
    type(rateInput(0), '70');
    expect(screen.queryByLabelText('Hủy trước (giờ) của mốc 2')).toBeNull();

    // Áp dụng bảng mẫu thay toàn bộ mốc bằng 24 → 100, 2 → 50, 0 → 0
    fireEvent.click(screen.getByRole('button', { name: 'Áp dụng bảng mẫu' }));
    expect(
      [0, 1, 2].map((i) =>
        [hoursInput(i), rateInput(i)].map((e) => (e as HTMLInputElement).value),
      ),
    ).toEqual([
      ['24', '100'],
      ['2', '50'],
      ['0', '0'],
    ]);

    const save = screen.getByRole('button', { name: 'Lưu' });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(
      await screen.findByRole('button', { name: 'Đang lưu…' }),
    ).toBeDisabled();
    expect(api.puts()).toHaveLength(1);
    expect(api.puts()[0]!.body).toEqual({
      mucDatCoc: '50000',
      moc: [
        { soGioTruocToiThieu: 24, tyLeHoan: 100 },
        { soGioTruocToiThieu: 2, tyLeHoan: 50 },
        { soGioTruocToiThieu: 0, tyLeHoan: 0 },
      ],
    });

    pending.release(
      pending.json({
        dichVuKhamId: '7',
        mucDatCoc: '50000.00',
        moc: [
          { soGioTruocToiThieu: 24, tyLeHoan: 100 },
          { soGioTruocToiThieu: 2, tyLeHoan: 50 },
          { soGioTruocToiThieu: 0, tyLeHoan: 0 },
        ],
      }),
    );
    expect(
      await screen.findByText('Đã lưu chính sách của dịch vụ.'),
    ).toBeVisible();
    expect(api.puts()).toHaveLength(1);
    const heart = await serviceButton(/Tim mạch/);
    expect(heart).toHaveTextContent('Riêng');
    expect(heart).toHaveTextContent('Cọc 50.000đ');
    expect(heart).toHaveAttribute('aria-pressed', 'true');
  });

  it('WCP-02 "Hủy" bỏ thay đổi chưa lưu, quay về bản đã tải', async () => {
    renderDepositPolicy();
    fireEvent.click(await serviceButton(/Cơ Xương Khớp/));
    type(await depositInput(), '1');
    fireEvent.click(screen.getByRole('button', { name: 'Xoá mốc 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(await depositInput()).toHaveValue('100000');
    expect(hoursInput(0)).toHaveValue('24');
    expect(hoursInput(1)).toHaveValue('2');
  });

  it('WCP-03 lỗi máy chủ theo loi[].ma gắn ĐÚNG ô (aria-invalid, aria-describedby), giữ nguyên nội dung đang gõ; định dạng sai thì không gửi', async () => {
    const { api } = renderDepositPolicy({
      before: (fake) => {
        fake.next.put.push(
          () =>
            new Response(
              JSON.stringify({
                maLoi: 'CHINH_SACH_COC_KHONG_HOP_LE',
                thongBao: 'Chính sách đặt cọc và hoàn tiền không hợp lệ.',
                loi: [{ truong: 'moc[1].tyLeHoan', ma: 'TY_LE_MOC_TANG' }],
              }),
              { status: 400 },
            ),
        );
      },
    });
    fireEvent.click(await serviceButton(/Cơ Xương Khớp/));
    await depositInput();
    type(rateInput(1), '90');
    type(rateInput(0), '50');
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    const message =
      'Hủy càng sát giờ hẹn thì tỷ lệ hoàn không được cao hơn mốc xa hơn.';
    expect(await screen.findByText(message)).toBeVisible();
    expect(rateInput(1)).toHaveAttribute('aria-invalid', 'true');
    expect(rateInput(1)).toHaveAccessibleDescription(message);
    expect(rateInput(0)).not.toHaveAttribute('aria-invalid');
    // Nội dung vẫn còn
    expect(rateInput(1)).toHaveValue('90');
    expect(rateInput(0)).toHaveValue('50');
    expect(screen.queryByText('Đã lưu chính sách của dịch vụ.')).toBeNull();

    // Định dạng sai (chữ, cọc vượt giá) ⇒ lỗi ở ô, KHÔNG có PUT mới
    type(await depositInput(), '400000');
    type(hoursInput(0), 'abc');
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(
      await screen.findByText('Mức đặt cọc không được lớn hơn giá dịch vụ.'),
    ).toBeVisible();
    expect(
      screen.getByText('Số giờ phải là số nguyên không âm.'),
    ).toBeVisible();
    expect(api.puts()).toHaveLength(1);
  });

  it('WCP-04 cảnh báo "không hoàn khi hủy" khi có cọc mà không có mốc; cọc 0 thì không cảnh báo; vẫn lưu được', async () => {
    const { api } = renderDepositPolicy();
    fireEvent.click(await serviceButton(/Tim mạch/));
    const warning =
      'Có đặt cọc nhưng chưa có mốc hoàn nào: Bệnh nhân hủy lịch sẽ không được hoàn cọc.';
    expect(await depositInput()).toHaveValue('0');
    expect(screen.queryByText(warning)).toBeNull();
    type(await depositInput(), '100000');
    expect(screen.getByText(warning)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(
      await screen.findByText('Đã lưu chính sách của dịch vụ.'),
    ).toBeVisible();
    expect(api.puts()[0]!.body).toEqual({ mucDatCoc: '100000', moc: [] });
  });

  it('WCP-05 menu "Đặt cọc & Hoàn tiền" có `to` với Admin toàn hệ thống và sáng khi ở trang', async () => {
    renderDepositPolicy();
    const nav = await screen.findByRole('navigation', {
      name: 'Điều hướng Admin',
    });
    const link = await within(nav).findByRole('link', {
      name: 'Đặt cọc & Hoàn tiền',
    });
    expect(link).toHaveAttribute('href', ADMIN_DEPOSIT_POLICY_PATH);
    expect(link).toHaveAttribute('aria-current', 'page');
  });

  it('WCP-05 Admin chi nhánh: mục menu ẩn, mở thẳng đường dẫn thì thấy trang không đủ quyền và KHÔNG gọi API chính sách', async () => {
    const { api } = renderDepositPolicy({
      before: (fake) => {
        fake.scope = BRANCH_SCOPE;
      },
    });
    expect(
      await screen.findByRole('heading', { name: 'Không đủ quyền truy cập' }),
    ).toBeVisible();
    const nav = screen.getByRole('navigation', { name: 'Điều hướng Admin' });
    expect(within(nav).queryByText('Đặt cọc & Hoàn tiền')).toBeNull();
    expect(api.requests).toEqual([]);
  });

  it('WCP-07 đang tải, lỗi máy chủ (có "Thử lại"), mất mạng, danh sách rỗng', async () => {
    const list = deferred();
    renderDepositPolicy({
      before: (fake) => {
        fake.next.list.push(() => list.promise);
        fake.next.list.push(
          () =>
            new Response(
              JSON.stringify({ maLoi: 'LOI_HE_THONG', thongBao: 'x' }),
              {
                status: 500,
              },
            ),
        );
        fake.next.list.push(() =>
          Promise.reject(new TypeError('Failed to fetch')),
        );
        fake.next.list.push(() => list.json({ nhom: [] }));
      },
    });
    expect(
      await screen.findByText('Đang tải danh sách dịch vụ…'),
    ).toBeVisible();
    list.release(
      new Response(JSON.stringify({ maLoi: 'LOI_HE_THONG', thongBao: 'x' }), {
        status: 500,
      }),
    );
    const panel = await servicesPanel();
    expect(await within(panel).findByRole('alert')).toHaveTextContent(
      'Đã có lỗi xảy ra. Vui lòng thử lại sau.',
    );
    fireEvent.click(within(panel).getByRole('button', { name: 'Thử lại' }));
    await waitFor(() =>
      expect(within(panel).getByRole('alert')).toHaveTextContent(
        'Đã có lỗi xảy ra. Vui lòng thử lại sau.',
      ),
    );
    fireEvent.click(within(panel).getByRole('button', { name: 'Thử lại' }));
    expect(
      await within(panel).findByText(
        'Không có kết nối mạng. Vui lòng kiểm tra và thử lại.',
      ),
    ).toBeVisible();
    fireEvent.click(within(panel).getByRole('button', { name: 'Thử lại' }));
    expect(
      await within(panel).findByText('Chưa có dịch vụ khám nào.'),
    ).toBeVisible();
  });

  it('WCP-07 dịch vụ không còn tồn tại (404 khi mở) ⇒ câu riêng, không đưa form', async () => {
    renderDepositPolicy({
      before: (fake) => {
        fake.next.detail.push(
          () =>
            new Response(
              JSON.stringify({ maLoi: 'KHONG_TIM_THAY', thongBao: 'x' }),
              { status: 404 },
            ),
        );
      },
    });
    fireEvent.click(await serviceButton(/Tim mạch/));
    expect(
      await screen.findByText(
        'Dịch vụ không còn tồn tại. Hãy tải lại danh sách.',
      ),
    ).toBeVisible();
    expect(screen.queryByLabelText('Mức đặt cọc')).toBeNull();
  });
});
