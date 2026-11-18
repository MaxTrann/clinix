import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import {
  CONFIG_PATH,
  FULL_CONFIG,
  apiError,
  fieldOf,
  installFetch,
  json,
  openTab,
  reminderInputs,
  renderConfigPage,
  saveButton,
  typeInto,
} from './testing/system-config-test-kit';

// admin F5, trang: tải, trạng thái tải/lỗi, mở hộp xác nhận, "không đổi gì", Hủy thay đổi (PLAN CH-20; mã CHF5-20 đến CHF5-25 là [đề xuất], TRACKING 9A.8 mục 3).

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CHF5-20 tải thành công: nhóm tham số, bốn tab, đủ 12 giá trị (CH-20)', () => {
  it('CHF5-20 hiện tiêu đề, bốn tab (tab đầu được chọn), giá trị và nhãn của cả 12 tham số', async () => {
    const api = installFetch(() => json(FULL_CONFIG));
    renderConfigPage();

    expect(
      await screen.findByRole('heading', {
        name: 'Cài đặt hệ thống',
        level: 1,
      }),
    ).toBeInTheDocument();
    expect(await screen.findByLabelText(/Thời hạn giữ chỗ/)).toHaveValue('15');

    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Lịch khám & tiếp đón',
      'Danh sách chờ & nhắc lịch',
      'Quy tắc nâng cao',
      'Lịch sử thay đổi',
    ]);
    expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual([
      'true',
      'false',
      'false',
      'false',
    ]);

    const expected: [Parameters<typeof fieldOf>[0], string][] = [
      ['thoiGianGiuCho', '15'],
      ['checkInTruocPhut', '30'],
      ['checkInSauPhut', '15'],
      ['nguongNoShow', '3'],
      ['soLichHenToiDaMoiHoSo', '3'],
      ['soLanTuDoiLichToiDa', '2'],
      ['soMucChoToiDa', '2'],
      ['thoiHanPhanHoiLoiMoi', '60'],
      ['soNgayBaoTruocDoiGioLam', '3'],
      ['trongSoW1', '0,60'],
      ['trongSoW2', '0,40'],
    ];
    for (const [key, value] of expected)
      expect(fieldOf(key), key).toHaveValue(value);
    expect(reminderInputs().map((input) => input.value)).toEqual([
      '72',
      '24',
      '2',
    ]);

    // Đúng một lần GET, không PUT, không banner "chưa cấu hình", không nút "Đã sửa"
    expect(
      api.requests.map((request) => `${request.method} ${request.path}`),
    ).toEqual([`GET ${CONFIG_PATH}`]);
    expect(screen.queryByText(/chưa được cấu hình/)).toBeNull();
    expect(screen.queryByText('Đã sửa')).toBeNull();
  });

  it('CHF5-20 mỗi ô có nhãn gắn đúng, gợi ý miền và đơn vị; chỉ tab đang chọn hiện, tab khác ẩn', async () => {
    installFetch(() => json(FULL_CONFIG));
    renderConfigPage();
    const holdTime = await screen.findByLabelText(/Thời hạn giữ chỗ/);
    expect(holdTime).toHaveAccessibleDescription('Từ 1 đến 60 phút.');
    expect(fieldOf('checkInTruocPhut')).toHaveAccessibleDescription(
      'Từ 0 đến 240 phút trước giờ hẹn.',
    );
    expect(fieldOf('trongSoW1')).toHaveAccessibleDescription(
      'Từ 0 đến 1, tối đa 2 chữ số thập phân; hai trọng số cộng lại bằng 1,00.',
    );
    // Panel của tab đầu hiện, panel của tab khác có thuộc tính hidden (vẫn nằm trong DOM để giữ bản nháp)
    expect(
      screen.getByRole('tabpanel', { name: 'Lịch khám & tiếp đón' }),
    ).toBeVisible();
    expect(
      document.getElementById('system-config-panel-waitlist'),
    ).toHaveAttribute('hidden');
    openTab('Danh sách chờ & nhắc lịch');
    expect(
      screen.getByRole('tabpanel', { name: 'Danh sách chờ & nhắc lịch' }),
    ).toBeVisible();
    expect(
      screen.getByRole('group', { name: 'Mốc nhắc trước giờ hẹn' }),
    ).toBeInTheDocument();
  });
});

describe('CHF5-20 React StrictMode (như `main.tsx` ở chế độ dev): effect chạy hai lần không làm hỏng trang', () => {
  it('CHF5-20 tải xong vẫn có giá trị đúng; sửa rồi lưu chỉ gửi MỘT lần PUT (PUT chỉ chạy từ sự kiện bấm, không từ effect)', async () => {
    const api = installFetch((request) =>
      request.method === 'PUT'
        ? json({ ...FULL_CONFIG, thoiGianGiuCho: 20 })
        : json(FULL_CONFIG),
    );
    renderConfigPage({ strict: true });
    expect(await screen.findByLabelText(/Thời hạn giữ chỗ/)).toHaveValue('15');
    // Effect chạy hai lần ⇒ có thể có hai GET (lần đầu bị huỷ), nhưng không bao giờ có PUT
    expect(api.puts()).toHaveLength(0);

    typeInto('thoiGianGiuCho', '20');
    fireEvent.click(saveButton());
    const dialog = await screen.findByRole('dialog', {
      name: 'Xác nhận lưu thay đổi',
    });
    fireEvent.change(within(dialog).getByLabelText(/Lý do thay đổi/), {
      target: { value: 'Thử trong StrictMode' },
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Xác nhận lưu' }),
    );
    expect(
      await screen.findByText('Đã lưu cấu hình hệ thống.'),
    ).toBeInTheDocument();
    expect(api.puts()).toHaveLength(1);
    expect(fieldOf('thoiGianGiuCho')).toHaveValue('20');
  });
});

describe('CHF5-21, 22 đang tải và lỗi khi tải', () => {
  it('CHF5-21 đang tải: câu "Đang tải cấu hình hệ thống…", chưa có ô nhập', async () => {
    installFetch(() => new Promise<Response>(() => undefined));
    renderConfigPage();
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Đang tải cấu hình hệ thống…',
    );
    expect(screen.queryByLabelText(/Thời hạn giữ chỗ/)).toBeNull();
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('CHF5-22 mất mạng: câu lỗi và "Thử lại"; bấm Thử lại gọi lại GET rồi hiện biểu mẫu', async () => {
    let attempts = 0;
    const api = installFetch(() => {
      attempts += 1;
      if (attempts === 1) throw new TypeError('Failed to fetch');
      return json(FULL_CONFIG);
    });
    renderConfigPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Không có kết nối mạng');
    fireEvent.click(within(alert).getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByLabelText(/Thời hạn giữ chỗ/)).toHaveValue('15');
    expect(api.gets(CONFIG_PATH)).toHaveLength(2);
  });

  it('CHF5-22 lỗi máy chủ 500: câu chung có "Thử lại", không lộ chữ của API', async () => {
    installFetch(() => apiError(500, 'LOI_HE_THONG'));
    renderConfigPage();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Đã có lỗi xảy ra');
    expect(alert).not.toHaveTextContent('câu của API');
    expect(
      within(alert).getByRole('button', { name: 'Thử lại' }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/Thời hạn giữ chỗ/)).toBeNull();
  });
});

describe('CHF5-23 bấm Lưu mở hộp "Xác nhận lưu thay đổi", chưa gọi PUT', () => {
  it('CHF5-23 sửa một ô ⇒ dấu "Đã sửa", nút "Lưu thay đổi (1)", hộp liệt kê "trước → sau", ô lý do trống', async () => {
    const api = installFetch(() => json(FULL_CONFIG));
    renderConfigPage();
    await screen.findByLabelText(/Thời hạn giữ chỗ/);

    typeInto('thoiGianGiuCho', '20');
    expect(screen.getByText('Đã sửa')).toBeInTheDocument();
    expect(screen.getByText('1 tham số đã sửa, chưa lưu.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi (1)' }));

    const dialog = await screen.findByRole('dialog', {
      name: 'Xác nhận lưu thay đổi',
    });
    const lines = within(dialog).getByRole('list', {
      name: 'Các thay đổi sẽ lưu',
    });
    expect(within(lines).getAllByRole('listitem')).toHaveLength(1);
    expect(lines).toHaveTextContent('Thời hạn giữ chỗ');
    expect(lines).toHaveTextContent('15 phút');
    expect(lines).toHaveTextContent('20 phút');
    const reason = within(dialog).getByLabelText(/Lý do thay đổi/);
    expect(reason).toHaveValue('');
    // Ô lý do nhận focus ngay khi hộp mở
    await waitFor(() => expect(document.activeElement).toBe(reason));
    expect(api.puts()).toHaveLength(0);
  });

  it('CHF5-23 hộp liệt kê đúng các ô đã đổi, theo thứ tự trên màn hình (không theo thứ tự gõ)', async () => {
    installFetch(() => json(FULL_CONFIG));
    renderConfigPage();
    await screen.findByLabelText(/Thời hạn giữ chỗ/);

    typeInto('soNgayBaoTruocDoiGioLam', '5');
    typeInto('thoiGianGiuCho', '20');
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi (2)' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Xác nhận lưu thay đổi',
    });
    const items = within(dialog).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Thời hạn giữ chỗ');
    expect(items[1]).toHaveTextContent('Số ngày báo trước');
    expect(items[1]).toHaveTextContent('3 ngày');
    expect(items[1]).toHaveTextContent('5 ngày');
  });
});

describe('CHF5-24 không đổi gì thì không lưu và báo', () => {
  it('CHF5-24 bấm "Lưu thay đổi" khi chưa sửa gì: dòng "Không có thay đổi nào để lưu.", không hộp, không PUT', async () => {
    const api = installFetch(() => json(FULL_CONFIG));
    renderConfigPage();
    await screen.findByLabelText(/Thời hạn giữ chỗ/);

    expect(saveButton()).toBeEnabled();
    fireEvent.click(saveButton());

    expect(screen.getByRole('status')).toHaveTextContent(
      'Không có thay đổi nào để lưu.',
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.puts()).toHaveLength(0);
  });

  it('CHF5-24 sửa rồi gõ lại đúng giá trị cũ (viết khác đi) vẫn là "không đổi gì"', async () => {
    const api = installFetch(() => json(FULL_CONFIG));
    renderConfigPage();
    await screen.findByLabelText(/Thời hạn giữ chỗ/);

    typeInto('thoiGianGiuCho', '20');
    typeInto('thoiGianGiuCho', ' 015 ');
    typeInto('trongSoW1', '0.6');
    fireEvent.click(saveButton());

    expect(screen.getByRole('status')).toHaveTextContent(
      'Không có thay đổi nào để lưu.',
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.puts()).toHaveLength(0);
  });

  it('CHF5-24 gõ vào ô thì dòng thông báo cũ biến mất', async () => {
    installFetch(() => json(FULL_CONFIG));
    renderConfigPage();
    await screen.findByLabelText(/Thời hạn giữ chỗ/);
    fireEvent.click(saveButton());
    expect(screen.getByRole('status')).toHaveTextContent('Không có thay đổi');
    typeInto('thoiGianGiuCho', '16');
    expect(screen.getByRole('status')).not.toHaveTextContent(
      'Không có thay đổi',
    );
  });
});

describe('CHF5-25 Hủy thay đổi khôi phục giá trị đã lưu', () => {
  it('CHF5-25 nút mờ khi chưa đổi; sửa nhiều ô ở nhiều tab rồi Hủy thì mọi ô, mọi lỗi về như đã tải', async () => {
    installFetch(() => json(FULL_CONFIG));
    renderConfigPage();
    await screen.findByLabelText(/Thời hạn giữ chỗ/);
    const discard = screen.getByRole('button', { name: 'Hủy thay đổi' });
    expect(discard).toBeDisabled();
    expect(screen.getByText('Chưa có thay đổi nào.')).toBeInTheDocument();

    typeInto('thoiGianGiuCho', '99');
    typeInto('trongSoW1', '0,9');
    typeInto('nguongNoShow', '4');
    fireEvent.change(reminderInputs()[0], { target: { value: '100' } });
    expect(discard).toBeEnabled();
    fireEvent.click(saveButton());
    // Ô 99 vượt miền: có lỗi
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);

    fireEvent.click(discard);
    expect(fieldOf('thoiGianGiuCho')).toHaveValue('15');
    expect(fieldOf('trongSoW1')).toHaveValue('0,60');
    expect(fieldOf('nguongNoShow')).toHaveValue('3');
    expect(reminderInputs().map((input) => input.value)).toEqual([
      '72',
      '24',
      '2',
    ]);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('Đã sửa')).toBeNull();
    expect(discard).toBeDisabled();
    expect(fieldOf('thoiGianGiuCho')).toHaveAttribute('aria-invalid', 'false');
  });
});
