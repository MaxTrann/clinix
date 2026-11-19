import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PATIENT_WALLET_PATH } from '../../../shared/routes/wallet-paths';
import {
  OVERVIEW,
  cleanUpFakeWalletApi,
  installFakeWalletApi,
  page,
  serverError,
  tx,
} from '../testing/fake-wallet-api';
import { WalletPage } from './wallet-page';

// payment F1: trang "Ví của tôi" với API giả (WVI-01, WVI-02, WVI-04 đến WVI-07; WVI-03 ở `router/role-routes.test.tsx` PL-01 và `shared/routes/wallet-paths.test.ts`).

function UrlProbe() {
  const location = useLocation();
  return (
    <output data-testid="url">{location.pathname + location.search}</output>
  );
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[PATIENT_WALLET_PATH]}>
      <WalletPage />
      <UrlProbe />
    </MemoryRouter>,
  );
}

// Khối ba thẻ số dư (`<dl aria-label="Số dư ví">`) chỉ có khi tải xong
const balances = () => screen.findByLabelText('Số dư ví');
const historyTable = () => screen.findByRole('table');
const historyRequests = (api: ReturnType<typeof installFakeWalletApi>) =>
  api.requests
    .filter((r) => r.path === '/patient/wallet/transactions')
    .map((r) => r.query);

afterEach(cleanUpFakeWalletApi);

describe('trang Ví của tôi (payment F1)', () => {
  it('WVI-01 ba thẻ lấy NGUYÊN số của API; không có thẻ "Tổng số dư"; nạp quá cửa sổ ở lịch sử hiện "Chưa nhận kết quả"', async () => {
    const api = installFakeWalletApi();
    api.handlers.overview = () => ({
      body: {
        ...OVERVIEW,
        soDuKhaDung: '250000.00',
        soTienDangGiu: '100000.00',
        // Máy chủ đã lọc theo cửa sổ: web hiện đúng con số này dù lịch sử còn một dòng nạp đang xử lý khác
        napChoXacNhan: '50000.00',
        soDu: '350000.00',
      },
    });
    api.handlers.transactions = () => ({
      body: page([
        tx({
          id: 'nap-1',
          loai: 'Nap',
          soTien: '50000.00',
          trangThai: 'DangXuLy',
        }),
        tx({
          id: 'nap-2',
          loai: 'Nap',
          soTien: '70000.00',
          trangThai: 'DangXuLy',
          quaCuaSo: true,
        }),
      ]),
    });
    renderPage();

    const cards = await balances();
    const term = (label: string) =>
      within(cards).getByText(label).closest('div') as HTMLElement;
    expect(within(term('Số dư khả dụng')).getByText('250.000')).toBeVisible();
    expect(within(term('Nạp chờ xác nhận')).getByText('50.000')).toBeVisible();
    expect(
      within(term('Đang giữ chờ duyệt rút')).getByText('100.000'),
    ).toBeVisible();
    // Không có thẻ tổng và không hiện `soDu` (350.000) ở bất kỳ đâu
    expect(screen.queryByText(/Tổng số dư/)).toBeNull();
    expect(screen.queryByText('350.000')).toBeNull();

    const table = await historyTable();
    const rows = within(table).getAllByRole('row').slice(1);
    expect(within(rows[0]).getByText('Đang xử lý')).toBeVisible();
    expect(within(rows[1]).getByText('Chưa nhận kết quả')).toBeVisible();
    expect(within(table).queryByText('Thất bại')).toBeNull();
  });

  it('WVI-01 bảng lịch sử: đúng năm cột Figma, ngày giờ Việt Nam, số tiền có dấu và nội dung của máy chủ', async () => {
    const api = installFakeWalletApi();
    api.handlers.transactions = () => ({
      body: page([
        tx(),
        tx({
          id: 'vi-2',
          loai: 'Nap',
          soTien: '500000.00',
          noiDung: 'Nạp tiền vào ví qua VNPAY',
          thoiDiem: '2026-10-01T03:00:00.000Z',
        }),
      ]),
    });
    renderPage();

    const table = await historyTable();
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Thời gian', 'Loại', 'Nội dung', 'Số tiền', 'Trạng thái']);
    const [deposit, topup] = within(table).getAllByRole('row').slice(1);
    expect(deposit).toHaveTextContent('08/10/2026');
    expect(deposit).toHaveTextContent('08:05');
    expect(deposit).toHaveTextContent('Đặt cọc');
    expect(deposit).toHaveTextContent(
      'Thanh toán đặt cọc lịch hẹn CP20261008009',
    );
    expect(within(deposit).getByText('−100.000đ')).toHaveClass('text-danger');
    expect(topup).toHaveTextContent('10:00');
    expect(within(topup).getByText('+500.000đ')).toHaveClass('text-success');
    expect(within(topup).getByText('Thành công')).toBeVisible();
  });

  it('WVI-02 đang tải: số dư và lịch sử đều có thông báo đang tải, h1 luôn hiện', async () => {
    const api = installFakeWalletApi();
    let releaseOverview: (value: { body: unknown }) => void = () => {};
    let releaseHistory: (value: { body: unknown }) => void = () => {};
    api.handlers.overview = () => ({
      hold: new Promise((resolve) => (releaseOverview = resolve)),
    });
    api.handlers.transactions = () => ({
      hold: new Promise((resolve) => (releaseHistory = resolve)),
    });
    renderPage();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Ví CLINIX' }),
    ).toBeVisible();
    expect(await screen.findByText('Đang tải số dư...')).toBeVisible();
    expect(screen.getByText('Đang tải lịch sử giao dịch...')).toBeVisible();

    releaseOverview({ body: OVERVIEW });
    releaseHistory({ body: page([]) });
    expect(await screen.findByText('Chưa có giao dịch nào.')).toBeVisible();
    expect(screen.queryByText('Đang tải số dư...')).toBeNull();
  });

  it('WVI-02 rỗng: chưa có giao dịch; lọc ra rỗng thì câu khác; không vẽ bảng', async () => {
    const api = installFakeWalletApi();
    api.handlers.transactions = () => ({ body: page([]) });
    renderPage();

    expect(await screen.findByText('Chưa có giao dịch nào.')).toBeVisible();
    expect(screen.queryByRole('table')).toBeNull();
    fireEvent.change(screen.getByLabelText('Lọc theo loại giao dịch'), {
      target: { value: 'HoanTien' },
    });
    expect(
      await screen.findByText('Không có giao dịch nào thuộc loại này.'),
    ).toBeVisible();
  });

  it('WVI-02 lỗi máy chủ: câu lỗi chung và "Thử lại" gọi lại đúng API đó; số dư lỗi không che lịch sử', async () => {
    const api = installFakeWalletApi();
    let overviewFails = true;
    api.handlers.overview = () =>
      overviewFails ? serverError() : { body: OVERVIEW };
    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Đã có lỗi xảy ra. Vui lòng thử lại sau.');
    // Lịch sử vẫn tải được bình thường
    expect(await historyTable()).toBeVisible();

    overviewFails = false;
    fireEvent.click(within(alert).getByRole('button', { name: 'Thử lại' }));
    expect(await balances()).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('WVI-02 mất mạng: câu mất mạng ở lịch sử, có "Thử lại"', async () => {
    const api = installFakeWalletApi();
    api.handlers.transactions = () => ({ network: true });
    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Không có kết nối mạng. Vui lòng kiểm tra và thử lại.',
    );
    api.handlers.transactions = () => ({ body: page([tx()]) });
    fireEvent.click(within(alert).getByRole('button', { name: 'Thử lại' }));
    expect(await historyTable()).toBeVisible();
  });

  it('WVI-02 phân trang: "Trang 1/3", nút trước vô hiệu ở trang đầu, sau vô hiệu ở trang cuối; đổi loại thì về trang 1', async () => {
    const api = installFakeWalletApi();
    api.handlers.transactions = (query) => ({
      body: page([tx({ id: `vi-${query.trang}` })], {
        total: 45,
        trang: Number(query.trang),
      }),
    });
    renderPage();

    expect(await screen.findByText('Trang 1/3')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Trang trước' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    expect(await screen.findByText('Trang 2/3')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    expect(await screen.findByText('Trang 3/3')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Trang sau' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Lọc theo loại giao dịch'), {
      target: { value: 'Rut' },
    });
    expect(await screen.findByText('Trang 1/3')).toBeVisible();
    expect(historyRequests(api)).toEqual([
      { trang: '1' },
      { trang: '2' },
      { trang: '3' },
      { trang: '1', loai: 'Rut' },
    ]);
  });

  it('WVI-02 ca biên: vừa đủ một trang (total = kichThuoc) thì không hiện phân trang', async () => {
    const api = installFakeWalletApi();
    api.handlers.transactions = () => ({
      body: page([tx()], { total: 20, kichThuoc: 20 }),
    });
    renderPage();
    await historyTable();
    expect(screen.queryByRole('button', { name: 'Trang sau' })).toBeNull();
  });

  it('WVI-04 ★ số lớn hơn 2^53 hiện đủ từng chữ số (không qua `Number`)', async () => {
    const api = installFakeWalletApi();
    api.handlers.overview = () => ({
      body: { ...OVERVIEW, soDuKhaDung: '9007199254740993.00' },
    });
    api.handlers.transactions = () => ({
      body: page([tx({ loai: 'Nap', soTien: '9007199254740993.00' })]),
    });
    renderPage();
    const cards = await balances();
    expect(within(cards).getByText('9.007.199.254.740.993')).toBeVisible();
    const table = await historyTable();
    expect(within(table).getByText('+9.007.199.254.740.993đ')).toBeVisible();
  });

  it('WVI-04 ★ máy chủ trả tiền dạng số ⇒ hiện lỗi, không hiện con số đã có thể sai', async () => {
    const api = installFakeWalletApi();
    api.handlers.overview = () => ({
      body: { ...OVERVIEW, soDuKhaDung: 350000 },
    });
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Đã có lỗi xảy ra',
    );
    expect(screen.queryByText('350.000')).toBeNull();
  });

  it.each([
    ['ChoDuyet', 'Chờ duyệt'],
    ['DaDuyet', 'Đã duyệt'],
    ['TuChoi', 'Từ chối'],
  ])(
    'WVI-05 "Yêu cầu rút gần nhất" trạng thái %s ⇒ "%s", số tiền và thời điểm giờ Việt Nam (Figma 437:292)',
    async (trangThai, label) => {
      const api = installFakeWalletApi();
      api.handlers.overview = () => ({
        body: {
          ...OVERVIEW,
          yeuCauRutGanNhat: {
            maYeuCau: '12',
            soTien: '100000.00',
            trangThai,
            thoiDiemYeuCau: '2026-10-18T00:10:00.000Z',
          },
        },
      });
      renderPage();
      const box = (
        await screen.findByRole('heading', { name: 'Yêu cầu rút gần nhất' })
      ).closest('section') as HTMLElement;
      expect(within(box).getByText('100.000đ')).toBeVisible();
      expect(within(box).getByText('18/10/2026 · 07:10')).toBeVisible();
      expect(within(box).getByText(label)).toBeVisible();
    },
  );

  it('WVI-05 chưa có yêu cầu rút ⇒ "Chưa có yêu cầu rút tiền"', async () => {
    installFakeWalletApi();
    renderPage();
    const box = (
      await screen.findByRole('heading', { name: 'Yêu cầu rút gần nhất' })
    ).closest('section') as HTMLElement;
    expect(within(box).getByText('Chưa có yêu cầu rút tiền')).toBeVisible();
  });

  it('WVI-06 ★ không ghi số dư hay dữ liệu ví vào localStorage, sessionStorage, URL, console', async () => {
    // Kiểm NỘI DUNG kho sau cả luồng, không spy `Storage.prototype.setItem`: trên happy-dom `localStorage.setItem` không đi qua prototype nên spy bỏ lọt
    // (đột biến ghi `localStorage` đã xanh với bản spy, 17/11/2026)
    localStorage.clear();
    sessionStorage.clear();
    const logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map(
      (method) => vi.spyOn(console, method),
    );
    const api = installFakeWalletApi();
    api.handlers.overview = () => ({
      body: { ...OVERVIEW, soDuKhaDung: '123456.00' },
    });
    api.handlers.transactions = (query) => ({
      body: page([tx()], { total: 45, trang: Number(query.trang) }),
    });
    renderPage();
    await screen.findByText('Trang 1/3');
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    await screen.findByText('Trang 2/3');
    fireEvent.change(screen.getByLabelText('Lọc theo loại giao dịch'), {
      target: { value: 'Nap' },
    });
    await screen.findByText('Trang 1/3');
    fireEvent.click(screen.getByRole('tab', { name: 'Rút tiền' }));

    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    for (const log of logs) expect(log).not.toHaveBeenCalled();
    // Trang, bộ lọc, tab không lọt vào URL
    expect(screen.getByTestId('url').textContent).toBe(PATIENT_WALLET_PATH);
  });

  it('WVI-07 đổi tab Nạp, Rút: đúng một tab được chọn, panel tương ứng hiện; tab không mất khi số dư lỗi rồi thử lại', async () => {
    const api = installFakeWalletApi();
    let fail = true;
    api.handlers.overview = () => (fail ? serverError() : { body: OVERVIEW });
    api.handlers.transactions = () => serverError();
    renderPage();

    const topup = screen.getByRole('tab', { name: 'Nạp tiền' });
    const withdraw = screen.getByRole('tab', { name: 'Rút tiền' });
    expect(topup).toHaveAttribute('aria-selected', 'true');
    expect(withdraw).toHaveAttribute('aria-selected', 'false');

    // Cả số dư và lịch sử đều lỗi
    expect(await screen.findAllByRole('alert')).toHaveLength(2);
    fireEvent.click(withdraw);
    expect(withdraw).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Rút tiền' })).toBeVisible();

    fail = false;
    fireEvent.click(
      within(screen.getAllByRole('alert')[0]).getByRole('button', {
        name: 'Thử lại',
      }),
    );
    await balances();
    expect(screen.getByRole('tab', { name: 'Rút tiền' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: 'Nạp tiền' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('payment F2 WNT-01 tab Nạp tiền dùng hạn mức và cổng của CÙNG lần tải số dư; tab Rút (payment F6) dùng số khả dụng của cùng lần tải', async () => {
    const api = installFakeWalletApi();
    api.handlers.overview = () => ({
      body: {
        ...OVERVIEW,
        hanMucNap: { toiThieu: '100000.00', toiDa: '500000.00' },
        congThanhToan: ['MoMo', 'CongLa'],
      },
    });
    renderPage();
    const panel = screen.getByRole('tabpanel', { name: 'Nạp tiền' });
    expect(
      within(panel).getByText('Đang tải thông tin nạp tiền...'),
    ).toBeVisible();
    expect(
      await within(panel).findByText('100.000đ – 500.000đ / lần nạp'),
    ).toBeVisible();
    expect(within(panel).queryByRole('button', { name: '50.000đ' })).toBeNull();
    expect(
      within(panel)
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual(['MoMoThanh toán qua ví MoMo']);
    fireEvent.click(screen.getByRole('tab', { name: 'Rút tiền' }));
    const withdraw = screen.getByRole('tabpanel', { name: 'Rút tiền' });
    expect(withdraw).not.toHaveTextContent('Chức năng đang được phát triển.');
    expect(
      within(withdraw).getByText('Tối đa 350.000đ (số dư khả dụng hiện tại)'),
    ).toBeVisible();
  });

  it('payment F6 WRT-01 ★ gửi rút ⇒ màn "Yêu cầu đã được ghi nhận!" theo 201; số dư, khối "Yêu cầu rút gần nhất" và lịch sử TẢI LẠI từ API; vẫn ở tab Rút', async () => {
    const api = installFakeWalletApi();
    renderPage();
    await balances();
    await historyTable();
    // Sau khi gửi, máy chủ trả số mới (yêu cầu ChoDuyet, đang giữ 100.000)
    api.handlers.overview = () => ({
      body: {
        ...OVERVIEW,
        soDuKhaDung: '250000.00',
        soTienDangGiu: '100000.00',
        yeuCauRutGanNhat: {
          maYeuCau: '17',
          soTien: '100000.00',
          trangThai: 'ChoDuyet',
          thoiDiemYeuCau: '2026-10-18T00:10:00.000Z',
        },
      },
    });
    const calls = (path: string) =>
      api.requests.filter((r) => r.method === 'GET' && r.path === path).length;
    const overviewBefore = calls('/patient/wallet');
    const historyBefore = calls('/patient/wallet/transactions');

    fireEvent.click(screen.getByRole('tab', { name: 'Rút tiền' }));
    const panel = screen.getByRole('tabpanel', { name: 'Rút tiền' });
    fireEvent.change(within(panel).getByLabelText('Số tiền muốn rút'), {
      target: { value: '100000' },
    });
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Gửi yêu cầu rút tiền' }),
    );

    expect(
      await within(panel).findByText('Yêu cầu đã được ghi nhận!'),
    ).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Rút tiền' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const side = screen
      .getByRole('heading', { name: 'Yêu cầu rút gần nhất' })
      .closest('section') as HTMLElement;
    expect(await within(side).findByText('Chờ duyệt')).toBeVisible();
    const cards = await balances();
    expect(within(cards).getByText('250.000')).toBeVisible();
    expect(calls('/patient/wallet')).toBe(overviewBefore + 1);
    expect(calls('/patient/wallet/transactions')).toBe(historyBefore + 1);
    // Màn thành công vẫn còn sau khi số dư tải lại xong
    expect(within(panel).getByText('Yêu cầu đã được ghi nhận!')).toBeVisible();
  });

  it('payment F6 WRT-04 mở trang khi đã có yêu cầu ChoDuyet ⇒ tab Rút không có ô nhập', async () => {
    const api = installFakeWalletApi();
    api.handlers.overview = () => ({
      body: {
        ...OVERVIEW,
        soDuKhaDung: '250000.00',
        soTienDangGiu: '100000.00',
        yeuCauRutGanNhat: {
          maYeuCau: '17',
          soTien: '100000.00',
          trangThai: 'ChoDuyet',
          thoiDiemYeuCau: '2026-10-18T00:10:00.000Z',
        },
      },
    });
    renderPage();
    await balances();
    fireEvent.click(screen.getByRole('tab', { name: 'Rút tiền' }));
    const panel = screen.getByRole('tabpanel', { name: 'Rút tiền' });
    expect(within(panel).queryByLabelText('Số tiền muốn rút')).toBeNull();
    expect(within(panel).getByRole('status')).toHaveTextContent(
      'Bạn đang có một yêu cầu rút tiền chờ duyệt.',
    );
  });

  it('payment F6 tải số dư lỗi ⇒ tab Rút báo chưa tải được, không có ô nhập', async () => {
    const api = installFakeWalletApi();
    api.handlers.overview = () => serverError();
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Rút tiền' }));
    const panel = screen.getByRole('tabpanel', { name: 'Rút tiền' });
    expect(
      await within(panel).findByText(/Chưa tải được số dư ví/),
    ).toBeVisible();
    expect(within(panel).queryByLabelText('Số tiền muốn rút')).toBeNull();
  });

  it('payment F2 tải số dư lỗi ⇒ tab Nạp tiền báo chưa tải được (không treo "đang tải")', async () => {
    const api = installFakeWalletApi();
    api.handlers.overview = () => serverError();
    renderPage();
    const panel = screen.getByRole('tabpanel', { name: 'Nạp tiền' });
    expect(
      await within(panel).findByText(/Chưa tải được thông tin nạp tiền/),
    ).toBeVisible();
    expect(
      within(panel).queryByText('Đang tải thông tin nạp tiền...'),
    ).toBeNull();
  });

  it('ba mục "Hỗ trợ & hướng dẫn" hiện đúng Figma nhưng vô hiệu (chưa có trang đích)', async () => {
    installFakeWalletApi();
    renderPage();
    const box = screen
      .getByRole('heading', { name: 'Hỗ trợ & hướng dẫn' })
      .closest('section') as HTMLElement;
    const buttons = within(box).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual([
      'Điều khoản sử dụng ví (chưa được triển khai)',
      'Bảo mật tài khoản (chưa được triển khai)',
      'Câu hỏi thường gặp (chưa được triển khai)',
    ]);
    for (const button of buttons) expect(button).toBeDisabled();
    await historyTable();
  });
});
