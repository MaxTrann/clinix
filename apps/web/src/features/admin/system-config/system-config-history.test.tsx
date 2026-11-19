import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import {
  CONFIG_PATH,
  FULL_CONFIG,
  HISTORY_PATH,
  apiError,
  fieldOf,
  historyItem,
  historyPage,
  installFetch,
  json,
  openTab,
  renderConfigPage,
  saveButton,
  typeInto,
  type RecordedRequest,
} from './testing/system-config-test-kit';
import {
  CONFIG_KEYS,
  type HistoryItem,
  type HistoryPage,
} from './system-config-types';

// admin F5, tab "Lịch sử thay đổi" (PLAN CH-19 phía giao diện; mã CHF5-40 đến CHF5-47 là [đề xuất], TRACKING admin 9A.8 mục 3).

afterEach(() => {
  vi.unstubAllGlobals();
});

type HistoryHandler = (
  request: RecordedRequest,
) => Response | Promise<Response>;

function setup(history: HistoryHandler) {
  return installFetch((request) => {
    if (request.path === HISTORY_PATH) return history(request);
    if (request.method === 'PUT')
      return json({ ...FULL_CONFIG, thoiGianGiuCho: 20 });
    return json(FULL_CONFIG);
  });
}

const staticHistory = (page: HistoryPage) => () => json(page);

async function openHistory() {
  await screen.findByLabelText(/Thời hạn giữ chỗ/);
  openTab('Lịch sử thay đổi');
}

const historyTable = () =>
  screen.findByRole('table', { name: 'Lịch sử thay đổi cấu hình' });
const dataRows = (table: HTMLElement) =>
  within(table).getAllByRole('row').slice(1);

describe('CHF5-40 tải trang 1, mới nhất trước, giờ Việt Nam (CH-19)', () => {
  it('CHF5-40 chưa gọi API lịch sử khi chưa mở tab; mở tab thì GET page=1 pageSize=20 và hiện đúng thứ tự, cột và giờ Việt Nam', async () => {
    const newer = historyItem({
      id: '57',
      thoiDiem: '2026-11-18T10:15:03.000Z',
      nguoiThucHien: 'Nguyễn Văn A',
      lyDo: 'Tăng giờ giữ chỗ',
      thayDoi: [{ khoa: 'thoiGianGiuCho', truoc: 15, sau: 20 }],
    });
    const older = historyItem({
      id: '56',
      thoiDiem: '2026-11-18T17:00:00.000Z',
      nguoiThucHien: 'Trần Thị B',
      lyDo: 'Đổi ngưỡng',
      thayDoi: [
        { khoa: 'nguongNoShow', truoc: 3, sau: 4 },
        { khoa: 'trongSoW1', truoc: 0.6, sau: 0.7 },
        { khoa: 'trongSoW2', truoc: 0.4, sau: 0.3 },
      ],
    });
    // Thứ tự là của API (mới nhất trước): web KHÔNG tự sắp lại, nên mục có giờ muộn hơn vẫn đứng sau nếu API trả vậy
    const api = setup(staticHistory(historyPage([newer, older])));
    renderConfigPage();
    await screen.findByLabelText(/Thời hạn giữ chỗ/);
    expect(api.gets(HISTORY_PATH)).toHaveLength(0);

    openTab('Lịch sử thay đổi');
    const table = await historyTable();
    const request = api.gets(HISTORY_PATH);
    expect(request).toHaveLength(1);
    expect(request[0].query).toEqual({ page: '1', pageSize: '20' });

    const rows = dataRows(table);
    expect(rows).toHaveLength(2);
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual([
      'Thời điểm',
      'Người thực hiện',
      'Lý do',
      'Thay đổi',
      'Chi tiết',
    ]);
    const first = within(rows[0]).getAllByRole('cell');
    expect(first.map((cell) => cell.textContent)).toEqual([
      '18/11/2026 17:15:03',
      'Nguyễn Văn A',
      'Tăng giờ giữ chỗ',
      '1 tham số: Thời hạn giữ chỗ',
      'Chi tiết',
    ]);
    const second = within(rows[1]).getAllByRole('cell');
    expect(second[0]).toHaveTextContent('19/11/2026 00:00:00');
    expect(second[3]).toHaveTextContent(
      '3 tham số: Ngưỡng no-show khoá đặt lịch, Trọng số đánh giá bác sĩ (w1), +1',
    );
    expect(screen.getByText('Hiển thị 1 – 2 trên 2')).toBeInTheDocument();
    // Tab Lịch sử đang mở: biểu mẫu tham số (và nút lưu) bị ẩn
    expect(screen.queryByRole('button', { name: /^Lưu thay đổi/ })).toBeNull();
  });
});

describe('CHF5-41 rỗng, đang tải, lỗi', () => {
  it('CHF5-41 chưa có lịch sử (200, danh sách rỗng): "Chưa có thay đổi nào." và "Hiển thị 0 trên 0"', async () => {
    setup(staticHistory(historyPage([], { total: 0 })));
    renderConfigPage();
    await openHistory();
    const table = await historyTable();
    expect(
      within(table).getByText('Chưa có thay đổi nào.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Hiển thị 0 trên 0')).toBeInTheDocument();
  });

  it('CHF5-41 đang tải: "Đang tải lịch sử thay đổi…"', async () => {
    setup(() => new Promise<Response>(() => undefined));
    renderConfigPage();
    await openHistory();
    expect(
      await screen.findByText('Đang tải lịch sử thay đổi…'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('table', { name: 'Lịch sử thay đổi cấu hình' }),
    ).toBeNull();
  });

  it('CHF5-41 lỗi mạng: câu lỗi có "Thử lại"; bấm thì gọi lại và hiện bảng', async () => {
    let attempts = 0;
    const api = setup(() => {
      attempts += 1;
      if (attempts === 1) throw new TypeError('Failed to fetch');
      return json(historyPage([historyItem()]));
    });
    renderConfigPage();
    await openHistory();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Không có kết nối mạng');
    fireEvent.click(within(alert).getByRole('button', { name: 'Thử lại' }));
    expect(await historyTable()).toBeInTheDocument();
    expect(api.gets(HISTORY_PATH)).toHaveLength(2);
  });

  it('CHF5-41 máy chủ 403 (không phải Toàn hệ thống): câu "Bạn không có quyền…", không có nút Thử lại', async () => {
    setup(() => apiError(403, 'KHONG_DU_QUYEN'));
    renderConfigPage();
    await openHistory();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Bạn không có quyền thực hiện thao tác này.',
    );
    expect(within(alert).queryByRole('button')).toBeNull();
  });
});

describe('CHF5-42 nhiều trang', () => {
  const pageOf = (page: number): HistoryPage =>
    historyPage(
      [historyItem({ id: `p${page}`, lyDo: `Mục của trang ${page}` })],
      {
        total: 45,
        page,
      },
    );

  it('CHF5-42 "Hiển thị 1 – 20 trên 45", Trang 1 / 3; Sau và Trước gọi đúng `page`, luôn `pageSize=20`', async () => {
    const api = setup((request) => json(pageOf(Number(request.query.page))));
    renderConfigPage();
    await openHistory();
    await historyTable();
    expect(screen.getByText('Hiển thị 1 – 20 trên 45')).toBeInTheDocument();
    expect(screen.getByText('Trang 1 / 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trang trước' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    await screen.findByText('Mục của trang 2');
    expect(screen.getByText('Trang 2 / 3')).toBeInTheDocument();
    expect(screen.getByText('Hiển thị 21 – 40 trên 45')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    await screen.findByText('Mục của trang 3');
    expect(screen.getByRole('button', { name: 'Trang sau' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Trang trước' }));
    await screen.findByText('Mục của trang 2');
    expect(api.gets(HISTORY_PATH).map((request) => request.query)).toEqual([
      { page: '1', pageSize: '20' },
      { page: '2', pageSize: '20' },
      { page: '3', pageSize: '20' },
      { page: '2', pageSize: '20' },
    ]);
  });

  it('CHF5-42 trang vượt số trang hiện có (400 TRANG_KHONG_HOP_LE): về trang 1 thay vì báo lỗi', async () => {
    const api = setup((request) =>
      request.query.page === '2'
        ? apiError(400, 'DU_LIEU_KHONG_HOP_LE', [
            { truong: 'page', ma: 'TRANG_KHONG_HOP_LE' },
          ])
        : json(pageOf(Number(request.query.page))),
    );
    renderConfigPage();
    await openHistory();
    await screen.findByText('Mục của trang 1');
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));

    await waitFor(() => expect(api.gets(HISTORY_PATH)).toHaveLength(3));
    expect(await screen.findByText('Mục của trang 1')).toBeInTheDocument();
    expect(screen.getByText('Trang 1 / 3')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('CHF5-42 lỗi 400 khác (không phải trang) thì vẫn báo lỗi, không về trang 1 âm thầm', async () => {
    setup((request) =>
      request.query.page === '2'
        ? apiError(400, 'DU_LIEU_KHONG_HOP_LE', [
            { truong: 'pageSize', ma: 'PHAI_LA_SO' },
          ])
        : json(pageOf(1)),
    );
    renderConfigPage();
    await openHistory();
    await screen.findByText('Mục của trang 1');
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

describe('CHF5-43 giá trị trước và sau: đơn vị, mảng, trọng số, "Chưa có", đúng chiều', () => {
  const rowsOf = (dialog: HTMLElement) =>
    within(within(dialog).getByRole('table', { name: 'Các tham số đã đổi' }))
      .getAllByRole('row')
      .slice(1)
      .map((row) =>
        within(row)
          .getAllByRole('cell')
          .map((cell) => cell.textContent),
      );

  async function openDetailOf(item: HistoryItem) {
    setup(staticHistory(historyPage([item])));
    renderConfigPage();
    await openHistory();
    await historyTable();
    fireEvent.click(
      screen.getByRole('button', { name: /^Xem chi tiết thay đổi lúc/ }),
    );
    return screen.findByRole('dialog', { name: 'Chi tiết thay đổi cấu hình' });
  }

  it('CHF5-43 một lần sửa: cột Trước là giá trị cũ, cột Sau là giá trị mới (không đảo), kèm đơn vị', async () => {
    const dialog = await openDetailOf(
      historyItem({
        thayDoi: [
          { khoa: 'thoiDiemNhacLich', truoc: [72, 24, 2], sau: [48, 24, 2] },
          { khoa: 'trongSoW1', truoc: 0.6, sau: 0.7 },
          { khoa: 'checkInTruocPhut', truoc: 30, sau: 45 },
        ],
      }),
    );
    expect(rowsOf(dialog)).toEqual([
      ['Mốc nhắc trước giờ hẹn', '72, 24, 2 giờ', '48, 24, 2 giờ'],
      ['Trọng số đánh giá bác sĩ (w1)', '0,60', '0,70'],
      ['Check-in sớm tối đa', '30 phút trước giờ hẹn', '45 phút trước giờ hẹn'],
    ]);
  });

  it('CHF5-43 tạo lần đầu: `truoc = null` ở cả 12 mục ⇒ "Chưa có" ở cột Trước, tóm tắt "Tạo cấu hình lần đầu (12 tham số)"', async () => {
    const item = historyItem({
      lyDo: 'Khởi tạo cấu hình',
      thayDoi: CONFIG_KEYS.map((khoa) => ({
        khoa,
        truoc: null,
        sau: FULL_CONFIG[khoa] as number | number[],
      })),
    });
    const dialog = await openDetailOf(item);
    const rows = rowsOf(dialog);
    expect(rows).toHaveLength(12);
    for (const [, before] of rows) expect(before).toBe('Chưa có');
    expect(rows[0]).toEqual(['Thời hạn giữ chỗ', 'Chưa có', '15 phút']);
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Đóng chi tiết' }),
    );
    expect(
      within(await historyTable()).getByText(
        'Tạo cấu hình lần đầu (12 tham số)',
      ),
    ).toBeInTheDocument();
  });

  it('CHF5-43 khoá lạ (API thêm tham số mới) không làm vỡ trang: in khoá thô và giá trị thô', async () => {
    const dialog = await openDetailOf(
      historyItem({ thayDoi: [{ khoa: 'thamSoMoi', truoc: 1, sau: [2, 3] }] }),
    );
    expect(rowsOf(dialog)).toEqual([['thamSoMoi', '1', '2, 3']]);
  });
});

describe('CHF5-44 chữ tự do của người dùng chỉ là văn bản, không bao giờ là HTML', () => {
  it('CHF5-44 `lyDo` và tên người thực hiện chứa thẻ HTML hiện NGUYÊN VĂN ở bảng và ở panel; không sinh phần tử nào', async () => {
    const reason = '<img src=x onerror=alert(1)> <b>đậm</b>\ndòng hai';
    const actor = '<script>alert(1)</script> Ngô';
    setup(
      staticHistory(
        historyPage([historyItem({ lyDo: reason, nguoiThucHien: actor })]),
      ),
    );
    renderConfigPage();
    await openHistory();
    const table = await historyTable();

    const cells = within(dataRows(table)[0]).getAllByRole('cell');
    expect(cells[1].textContent).toBe(actor);
    expect(cells[2].textContent).toBe(reason);
    expect(document.body.querySelector('img, b, script, [onerror]')).toBeNull();

    fireEvent.click(
      screen.getByRole('button', { name: /^Xem chi tiết thay đổi lúc/ }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Chi tiết thay đổi cấu hình',
    });
    expect(dialog.textContent).toContain(reason);
    expect(dialog.textContent).toContain(actor);
    expect(document.body.querySelector('img, b, script, [onerror]')).toBeNull();
  });

  it('CHF5-44 lý do rỗng (nhật ký lệch khuôn) hiện "—", không để ô trống', async () => {
    setup(staticHistory(historyPage([historyItem({ lyDo: '' })])));
    renderConfigPage();
    await openHistory();
    const cells = within(dataRows(await historyTable())[0]).getAllByRole(
      'cell',
    );
    expect(cells[2]).toHaveTextContent('—');
  });
});

describe('CHF5-45 panel chi tiết một lần đổi', () => {
  it('CHF5-45 mở bằng nút "Chi tiết": người thực hiện, thời điểm giờ Việt Nam, lý do; đóng bằng nút hay Esc; focus về nút đã mở', async () => {
    setup(
      staticHistory(
        historyPage([
          historyItem({
            thoiDiem: '2026-11-18T10:15:03.000Z',
            lyDo: 'Tăng giờ giữ chỗ',
          }),
        ]),
      ),
    );
    renderConfigPage();
    await openHistory();
    await historyTable();

    const opener = screen.getByRole('button', {
      name: 'Xem chi tiết thay đổi lúc 18/11/2026 17:15:03',
    });
    opener.focus();
    fireEvent.click(opener);
    const dialog = await screen.findByRole('dialog', {
      name: 'Chi tiết thay đổi cấu hình',
    });
    expect(within(dialog).getByText('Nguyễn Văn A')).toBeInTheDocument();
    expect(within(dialog).getByText('18/11/2026 17:15:03')).toBeInTheDocument();
    expect(within(dialog).getByText('Tăng giờ giữ chỗ')).toBeInTheDocument();
    expect(within(dialog).getByText('15 phút')).toBeInTheDocument();
    expect(within(dialog).getByText('20 phút')).toBeInTheDocument();

    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Đóng chi tiết' }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);

    fireEvent.click(opener);
    await screen.findByRole('dialog', { name: 'Chi tiết thay đổi cấu hình' });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('CHF5-46 lịch sử được tải lại sau khi lưu', () => {
  it('CHF5-46 mỗi lần mở tab là một lần tải mới; lần lưu vừa xong hiện ở đầu danh sách', async () => {
    const items: HistoryItem[] = [historyItem({ id: '56', lyDo: 'Lần cũ' })];
    const api = installFetch((request) => {
      if (request.path === HISTORY_PATH) return json(historyPage(items));
      if (request.method === 'PUT') {
        items.unshift(historyItem({ id: '57', lyDo: 'Lần vừa lưu' }));
        return json({ ...FULL_CONFIG, thoiGianGiuCho: 20 });
      }
      return json(FULL_CONFIG);
    });
    renderConfigPage();
    await screen.findByLabelText(/Thời hạn giữ chỗ/);

    openTab('Lịch sử thay đổi');
    let table = await historyTable();
    expect(dataRows(table)).toHaveLength(1);

    openTab('Lịch khám & tiếp đón');
    typeInto('thoiGianGiuCho', '20');
    fireEvent.click(saveButton());
    const dialog = await screen.findByRole('dialog', {
      name: 'Xác nhận lưu thay đổi',
    });
    fireEvent.change(within(dialog).getByLabelText(/Lý do thay đổi/), {
      target: { value: 'Lần vừa lưu' },
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Xác nhận lưu' }),
    );
    await screen.findByText('Đã lưu cấu hình hệ thống.');
    expect(fieldOf('thoiGianGiuCho')).toHaveValue('20');

    openTab('Lịch sử thay đổi');
    await waitFor(() => expect(api.gets(HISTORY_PATH)).toHaveLength(2));
    await screen.findByText('Lần vừa lưu');
    table = await historyTable();
    expect(
      dataRows(table).map(
        (row) => within(row).getAllByRole('cell')[2].textContent,
      ),
    ).toEqual(['Lần vừa lưu', 'Lần cũ']);
  });
});

describe('CHF5-47 tab lịch sử không làm mất bản nháp ở các tab tham số', () => {
  it('CHF5-47 đang sửa dở, sang tab Lịch sử rồi quay lại: ô giữ nguyên giá trị đã gõ và dấu "Đã sửa"', async () => {
    setup(staticHistory(historyPage([historyItem()])));
    renderConfigPage();
    await screen.findByLabelText(/Thời hạn giữ chỗ/);
    typeInto('thoiGianGiuCho', '33');

    openTab('Lịch sử thay đổi');
    await historyTable();
    // Biểu mẫu vẫn nằm trong DOM (chỉ ẩn bằng `hidden`) nên bản nháp còn nguyên; người dùng không thấy tab tham số
    expect(
      screen.queryByRole('tabpanel', { name: 'Lịch khám & tiếp đón' }),
    ).toBeNull();
    await act(async () => {
      openTab('Lịch khám & tiếp đón');
    });
    expect(fieldOf('thoiGianGiuCho')).toHaveValue('33');
    expect(screen.getByText('Đã sửa')).toBeInTheDocument();
    expect(CONFIG_PATH).toBe('/admin/system-config');
  });
});
