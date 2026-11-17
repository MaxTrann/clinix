import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  NetworkError,
  TimeoutError,
  UnexpectedResponseError,
} from '../../../../shared/api/errors';
import { errorMessageFor } from '../../../../shared/api/error-message';
import { jsonResponse } from '../../testing/fetch-routing';
import {
  BRANCH_ADMIN,
  DOCTORS,
  item,
  ITEMS,
  pageBody,
  Q3,
  Q7,
  setupReviewsHarness,
} from './testing/render-reviews-page';

// doctor-exam F7: WKD-02 (phạm vi), WKD-03 (chip, lọc, tìm, trang), WKD-09 (đang tải, rỗng, lỗi, mất mạng, hết giờ), WKD-10 (nhận xét chữ thuần), WKD-16 (hàng). Mức trang qua app thật (`createAppRoutes`), `fetch` giả theo hợp đồng B7. Dữ liệu giả.
const { handlers, renderPage, listCalls, detailCalls, fetchMock } =
  setupReviewsHarness();

const pick = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const optionsOf = (label: string) =>
  within(screen.getByLabelText(label))
    .getAllByRole('option')
    .map((option) => option.textContent);
const lastList = () => listCalls().at(-1)!;
const table = () => screen.findByRole('table', { name: 'Đánh giá bác sĩ' });
const bodyRows = () => screen.getAllByRole('row').slice(1);
const chips = () =>
  within(screen.getByRole('list', { name: 'Số đánh giá theo trạng thái' }))
    .getAllByRole('listitem')
    .map((chip) => chip.textContent);

describe('trang Kiểm duyệt đánh giá — phạm vi (WKD-02)', () => {
  it('WKD-02 Toàn hệ thống: dòng phụ, cột Chi nhánh, đủ năm ô lọc với tuỳ chọn đúng; chọn chi nhánh gửi `chiNhanhId` và về trang 1', async () => {
    await renderPage();
    const grid = await table();
    expect(
      screen.getByRole('heading', { name: 'Kiểm duyệt đánh giá' }),
    ).toBeVisible();
    expect(screen.getByText('Toàn hệ thống')).toBeVisible();
    expect(
      within(grid)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual([
      'Bác sĩ',
      'Chi nhánh',
      'Bệnh nhân',
      'Sao',
      'Nội dung',
      'Ngày gửi',
      'Trạng thái',
      'Thao tác',
    ]);
    expect(within(grid).getAllByText(Q3.ten).length).toBeGreaterThan(0);
    expect(optionsOf('Chi nhánh')).toEqual([
      'Tất cả chi nhánh',
      Q3.ten,
      Q7.ten,
    ]);
    expect(optionsOf('Bác sĩ')).toEqual([
      'Tất cả bác sĩ',
      'Nguyễn Minh Anh',
      'Lê Thảo Vy',
    ]);
    expect(optionsOf('Số sao')).toEqual([
      'Tất cả',
      '5 sao',
      '4 sao',
      '3 sao',
      '2 sao',
      '1 sao',
    ]);
    expect(optionsOf('Trạng thái')).toEqual(['Tất cả', 'Hiển thị', 'Đã ẩn']);

    pick('Chi nhánh', Q7.chiNhanhId);
    await waitFor(() =>
      expect(lastList().searchParams.get('chiNhanhId')).toBe('2'),
    );
    expect(lastList().searchParams.get('page')).toBe('1');
  });

  it('WKD-02 Admin Chi nhánh: dòng phụ "Chi nhánh: <tên>", KHÔNG cột và KHÔNG ô lọc Chi nhánh, danh sách bác sĩ của chi nhánh; mọi lời gọi KHÔNG có `chiNhanhId`', async () => {
    handlers.doctors = () =>
      jsonResponse({ items: [DOCTORS[0]], total: 1, page: 1, pageSize: 100 });
    await renderPage({ scope: BRANCH_ADMIN });
    const grid = await table();
    expect(screen.getByText(`Chi nhánh: ${Q3.ten}`)).toBeVisible();
    expect(
      within(grid)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual([
      'Bác sĩ',
      'Bệnh nhân',
      'Sao',
      'Nội dung',
      'Ngày gửi',
      'Trạng thái',
      'Thao tác',
    ]);
    expect(screen.queryByLabelText('Chi nhánh')).toBeNull();
    expect(within(grid).queryByText(Q3.ten)).toBeNull();
    await waitFor(() =>
      expect(optionsOf('Bác sĩ')).toEqual(['Tất cả bác sĩ', 'Nguyễn Minh Anh']),
    );

    pick('Bác sĩ', '11');
    await waitFor(() =>
      expect(lastList().searchParams.get('bacSiId')).toBe('11'),
    );
    pick('Số sao', '5');
    pick('Trạng thái', 'DaAn');
    fireEvent.change(screen.getByLabelText('Tìm kiếm'), {
      target: { value: 'tốt' },
    });
    await waitFor(() => expect(lastList().searchParams.get('q')).toBe('tốt'));
    expect(listCalls().length).toBeGreaterThan(3);
    expect(
      listCalls().every((url) => !url.searchParams.has('chiNhanhId')),
    ).toBe(true);
  });
});

describe('trang Kiểm duyệt đánh giá — chip, lọc, tìm, trang (WKD-03)', () => {
  it('WKD-03 lần đầu: MỘT lời gọi danh sách chỉ có page và pageSize; MỘT lời gọi danh sách bác sĩ', async () => {
    await renderPage();
    await table();
    expect(listCalls()).toHaveLength(1);
    expect(Object.fromEntries(lastList().searchParams)).toEqual({
      page: '1',
      pageSize: '20',
    });
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        String(input).includes('/admin/doctor-shifts/doctors'),
      ),
    ).toHaveLength(1);
  });

  it('WKD-03 chip đếm lấy từ `demTheoTrangThai` của máy chủ (không đếm dòng của trang), không đổi khi đổi Trạng thái', async () => {
    // 3 dòng trên trang (1 dòng đã ẩn) nhưng máy chủ đếm 20 và 5: nếu đếm ở máy sẽ ra 2 và 1
    handlers.list = () =>
      jsonResponse(
        pageBody(ITEMS, { total: 25, counts: { HienThi: 20, DaAn: 5 } }),
      );
    await renderPage();
    await table();
    expect(chips()).toEqual(['20 hiển thị', '5 đã ẩn']);
    expect(screen.getByText('Hiển thị 1–20 trên 25')).toBeVisible();

    pick('Trạng thái', 'DaAn');
    await waitFor(() =>
      expect(lastList().searchParams.get('trangThai')).toBe('DaAn'),
    );
    expect(chips()).toEqual(['20 hiển thị', '5 đã ẩn']);
  });

  it('WKD-03 lọc Số sao, Bác sĩ, Trạng thái gửi đúng khoá; "Tất cả" bỏ khoá', async () => {
    await renderPage();
    await table();
    pick('Số sao', '5');
    await waitFor(() => expect(lastList().searchParams.get('soSao')).toBe('5'));
    pick('Bác sĩ', '12');
    await waitFor(() =>
      expect(lastList().searchParams.get('bacSiId')).toBe('12'),
    );
    pick('Trạng thái', 'HienThi');
    await waitFor(() =>
      expect(lastList().searchParams.get('trangThai')).toBe('HienThi'),
    );
    expect(Object.fromEntries(lastList().searchParams)).toEqual({
      page: '1',
      pageSize: '20',
      soSao: '5',
      bacSiId: '12',
      trangThai: 'HienThi',
    });
    pick('Số sao', '');
    pick('Bác sĩ', '');
    pick('Trạng thái', '');
    await waitFor(() =>
      expect(Object.fromEntries(lastList().searchParams)).toEqual({
        page: '1',
        pageSize: '20',
      }),
    );
  });

  it('WKD-03 ô tìm: gõ không gọi ngay, sau 300 ms gọi MỘT lần với `q` đã trim; KHÔNG lên URL, KHÔNG vào kho trình duyệt', async () => {
    const router = await renderPage();
    await table();
    fireEvent.change(screen.getByLabelText('Tìm kiếm'), {
      target: { value: '  Vũ' },
    });
    fireEvent.change(screen.getByLabelText('Tìm kiếm'), {
      target: { value: '  Vũ Thị  ' },
    });
    expect(listCalls()).toHaveLength(1);
    await waitFor(() => expect(listCalls()).toHaveLength(2));
    expect(lastList().searchParams.get('q')).toBe('Vũ Thị');
    await new Promise((resolve) => setTimeout(resolve, 450));
    expect(listCalls()).toHaveLength(2);
    expect(router.state.location.search).toBe('');
    expect(router.state.location.pathname).toBe('/admin/kiem-duyet-danh-gia');
    expect(router.state.location.state).toBeNull();
    expect(window.location.search).toBe('');
    expect(localStorage).toHaveLength(0);
    expect(sessionStorage).toHaveLength(0);
  });

  it('WKD-03 `q` dài hơn 100 ký tự bị cắt về 100 trước khi gửi (máy chủ trả 400 nếu dài hơn)', async () => {
    await renderPage();
    await table();
    fireEvent.change(screen.getByLabelText('Tìm kiếm'), {
      target: { value: 'b'.repeat(130) },
    });
    await waitFor(() => expect(listCalls()).toHaveLength(2));
    expect(lastList().searchParams.get('q')).toBe('b'.repeat(100));
  });

  it('WKD-03 đổi trang gửi `page`; đổi bộ lọc sau đó về trang 1', async () => {
    handlers.list = () =>
      jsonResponse(
        pageBody(ITEMS, { total: 45, counts: { HienThi: 30, DaAn: 15 } }),
      );
    await renderPage();
    await table();
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    await waitFor(() => expect(lastList().searchParams.get('page')).toBe('2'));
    expect(screen.getByText('Trang 2 / 3')).toBeVisible();
    pick('Số sao', '4');
    await waitFor(() => expect(lastList().searchParams.get('soSao')).toBe('4'));
    expect(lastList().searchParams.get('page')).toBe('1');
  });
});

describe('trang Kiểm duyệt đánh giá — trạng thái (WKD-09)', () => {
  it('WKD-09 đang tải: câu "Đang tải đánh giá…", chưa có bảng và chưa có chip; xong thì có bảng', async () => {
    let release: (response: Response) => void = () => undefined;
    handlers.list = () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      });
    await renderPage();
    expect(await screen.findByText('Đang tải đánh giá…')).toBeVisible();
    expect(screen.queryByRole('table')).toBeNull();
    expect(
      screen.queryByRole('list', { name: 'Số đánh giá theo trạng thái' }),
    ).toBeNull();
    await act(async () => release(jsonResponse(pageBody())));
    expect(await table()).toBeVisible();
    expect(screen.queryByText('Đang tải đánh giá…')).toBeNull();
  });

  it('WKD-09 rỗng không lọc: "Chưa có đánh giá nào.", không bảng; chip vẫn hiện số 0', async () => {
    handlers.list = () =>
      jsonResponse(pageBody([], { total: 0, counts: { HienThi: 0, DaAn: 0 } }));
    await renderPage();
    expect(await screen.findByText('Chưa có đánh giá nào.')).toBeVisible();
    expect(screen.queryByRole('table')).toBeNull();
    expect(chips()).toEqual(['0 hiển thị', '0 đã ẩn']);
  });

  it('WKD-09 rỗng có lọc: "Không có đánh giá nào khớp bộ lọc."; chip vẫn là số của máy chủ', async () => {
    await renderPage();
    await table();
    handlers.list = () =>
      jsonResponse(pageBody([], { total: 0, counts: { HienThi: 2, DaAn: 0 } }));
    pick('Trạng thái', 'DaAn');
    expect(
      await screen.findByText('Không có đánh giá nào khớp bộ lọc.'),
    ).toBeVisible();
    expect(screen.queryByText('Chưa có đánh giá nào.')).toBeNull();
    expect(chips()).toEqual(['2 hiển thị', '0 đã ẩn']);
  });

  it('WKD-09 lỗi 500: hộp lỗi kèm `Thử lại`, chip ẩn; `Thử lại` gọi lại ĐÚNG query và hiện bảng', async () => {
    handlers.list = () =>
      jsonResponse({ maLoi: 'LOI_HE_THONG', thongBao: 'câu của API' }, 500);
    await renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      errorMessageFor(
        new ApiError(500, { maLoi: 'LOI_HE_THONG', thongBao: 'câu của API' }),
      ),
    );
    expect(screen.queryByRole('table')).toBeNull();
    expect(
      screen.queryByRole('list', { name: 'Số đánh giá theo trạng thái' }),
    ).toBeNull();
    const first = Object.fromEntries(lastList().searchParams);

    handlers.list = () => jsonResponse(pageBody());
    fireEvent.click(within(alert).getByRole('button', { name: 'Thử lại' }));
    expect(await table()).toBeVisible();
    expect(listCalls()).toHaveLength(2);
    expect(Object.fromEntries(lastList().searchParams)).toEqual(first);
  });

  it('WKD-09 mất mạng: câu mất kết nối, không dữ liệu dở dang', async () => {
    handlers.list = () => Promise.reject(new TypeError('Failed to fetch'));
    await renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      errorMessageFor(new NetworkError()),
    );
    expect(screen.queryByRole('table')).toBeNull();
  });

  it.each([
    ['200 sai hình dạng (items không phải mảng)', { items: 'x', total: 1 }],
    [
      '200 thiếu demTheoTrangThai',
      { items: [], total: 0, page: 1, pageSize: 20 },
    ],
    [
      '200 có một dòng soSao 9',
      pageBody([item({ soSao: 9 }), item({ danhGiaId: '2' })]),
    ],
  ])('WKD-09 %s ⇒ hộp lỗi chung, không vẽ dòng nào', async (_name, body) => {
    handlers.list = () => jsonResponse(body);
    await renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      errorMessageFor(new UnexpectedResponseError(200)),
    );
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('WKD-09 403 `KHONG_DU_QUYEN` ⇒ câu lỗi của hệ thống, không bảng', async () => {
    const body = { maLoi: 'KHONG_DU_QUYEN', thongBao: 'câu của API' };
    handlers.list = () => jsonResponse(body, 403);
    await renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      errorMessageFor(new ApiError(403, body)),
    );
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('WKD-09 hết giờ 15 giây ⇒ câu hết thời gian chờ; đúng MỘT lời gọi dù chờ thêm (không tự gửi lại)', async () => {
    await renderPage();
    await table();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    handlers.list = () => new Promise<Response>(() => undefined);
    const before = listCalls().length;
    pick('Số sao', '3');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(14_999);
    });
    expect(screen.queryByRole('alert')).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      errorMessageFor(new TimeoutError()),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(listCalls()).toHaveLength(before + 1);
  });

  it('WKD-09 trang vượt cuối (dữ liệu vừa ít đi): máy chủ trả `items` rỗng ở trang 2 ⇒ tự về trang 1 và hiện lại bảng', async () => {
    handlers.list = (url) =>
      url.searchParams.get('page') === '2'
        ? jsonResponse(pageBody([], { total: 15, page: 2 }))
        : jsonResponse(pageBody(ITEMS, { total: 45 }));
    await renderPage();
    await table();
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    await waitFor(() => expect(listCalls()).toHaveLength(3));
    expect(listCalls().map((url) => url.searchParams.get('page'))).toEqual([
      '1',
      '2',
      '1',
    ]);
    expect(await table()).toBeVisible();
    expect(bodyRows()).toHaveLength(ITEMS.length);
    expect(screen.queryByText('Chưa có đánh giá nào.')).toBeNull();
  });

  it('WKD-09 `items` rỗng mà `total` còn > 0 và trang còn trong phạm vi (máy chủ trả lẫn): vẫn hiện bảng và chân phân trang, KHÔNG câu "Chưa có đánh giá nào." ở ngoài bảng', async () => {
    handlers.list = () =>
      jsonResponse(
        pageBody([], { total: 25, counts: { HienThi: 25, DaAn: 0 } }),
      );
    await renderPage();
    const grid = await table();
    expect(screen.getByText('Hiển thị 1–20 trên 25')).toBeVisible();
    // Chỉ còn câu rỗng NẰM TRONG bảng (ô `emptyMessage`), không có khối "rỗng" thay cho bảng
    expect(within(grid).getByText('Chưa có đánh giá nào.')).toBeVisible();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('WKD-09 hai yêu cầu chồng: kết quả của yêu cầu CŨ đến sau KHÔNG ghi đè kết quả mới', async () => {
    const waiting = new Map<string, (response: Response) => void>();
    handlers.list = (url) => {
      const stars = url.searchParams.get('soSao');
      if (stars === null) return jsonResponse(pageBody());
      return new Promise<Response>((resolve) => waiting.set(stars, resolve));
    };
    await renderPage();
    await table();
    pick('Số sao', '5');
    await waitFor(() => expect(waiting.has('5')).toBe(true));
    pick('Số sao', '4');
    await waitFor(() => expect(waiting.has('4')).toBe(true));
    await act(async () => {
      waiting.get('4')!(
        jsonResponse(
          pageBody([item({ danhGiaId: '8', nhanXet: 'Từ yêu cầu MỚI' })]),
        ),
      );
    });
    expect(await screen.findByText('Từ yêu cầu MỚI')).toBeVisible();
    await act(async () => {
      waiting.get('5')!(
        jsonResponse(
          pageBody([item({ danhGiaId: '9', nhanXet: 'Từ yêu cầu CŨ' })]),
        ),
      );
    });
    expect(screen.getByText('Từ yêu cầu MỚI')).toBeVisible();
    expect(screen.queryByText('Từ yêu cầu CŨ')).toBeNull();
  });

  it('WKD-09 lỗi tải danh sách bác sĩ không chặn danh sách đánh giá: báo lỗi, ô Bác sĩ và Chi nhánh chỉ còn "Tất cả"', async () => {
    handlers.doctors = () =>
      jsonResponse({ maLoi: 'LOI_HE_THONG', thongBao: 'x' }, 500);
    await renderPage();
    expect(await table()).toBeVisible();
    expect(
      await screen.findByText('Không tải được danh sách bác sĩ.'),
    ).toBeVisible();
    expect(optionsOf('Bác sĩ')).toEqual(['Tất cả bác sĩ']);
    expect(optionsOf('Chi nhánh')).toEqual(['Tất cả chi nhánh']);
  });
});

describe('trang Kiểm duyệt đánh giá — hàng và chữ thuần (WKD-10, WKD-16)', () => {
  it('WKD-16 hàng: bác sĩ, chi nhánh, người đặt, sao có tên, nhận xét, ngày gửi `dd/MM/yyyy`, nhãn trạng thái; hàng đã ẩn là "Đã ẩn"', async () => {
    await renderPage();
    await table();
    const rows = bodyRows();
    expect(rows).toHaveLength(3);
    const first = within(rows[0]);
    expect(first.getByText('Nguyễn Minh Anh')).toBeVisible();
    expect(first.getByText(Q3.ten)).toBeVisible();
    expect(first.getByText('Vũ Thị F')).toBeVisible();
    expect(first.getByRole('img', { name: '4 sao' })).toBeVisible();
    expect(first.getByText('28/05/2026')).toBeVisible();
    expect(first.getByText('Hiển thị')).toBeVisible();
    expect(
      first.getByText(
        'Tốt, sẽ giới thiệu cho bạn bè. Bác sĩ có chuyên môn cao.',
      ),
    ).toBeVisible();
    const third = within(rows[2]);
    expect(third.getByText('Đã ẩn')).toBeVisible();
    expect(third.getByRole('img', { name: '1 sao' })).toBeVisible();
    expect(third.getByText('15/05/2026')).toBeVisible();
  });

  it('WKD-16 tên người đặt rỗng (L9) và nhận xét `null` hoặc chỉ khoảng trắng ⇒ "—", không bịa tên; tên nút không có cụm "của"', async () => {
    handlers.list = () =>
      jsonResponse(
        pageBody([
          item({ danhGiaId: '5', nguoiDanhGia: { hoTen: '' }, nhanXet: null }),
          item({ danhGiaId: '6', nhanXet: '   ' }),
        ]),
      );
    await renderPage();
    await table();
    const rows = bodyRows();
    const cells = within(rows[0]).getAllByRole('cell');
    expect(cells[2]).toHaveTextContent(/^—$/);
    expect(cells[4]).toHaveTextContent(/^—$/);
    expect(within(rows[1]).getAllByRole('cell')[4]).toHaveTextContent(/^—$/);
    expect(
      within(rows[0]).getByRole('button', {
        name: 'Xem đánh giá về Nguyễn Minh Anh',
      }),
    ).toBeVisible();
    expect(
      within(rows[1]).getByRole('button', {
        name: 'Xem đánh giá của Vũ Thị F về Nguyễn Minh Anh',
      }),
    ).toBeVisible();
    expect(detailCalls()).toHaveLength(0);
  });

  it('WKD-10 nhận xét và tên chứa `<script>`, liên kết spam, HTML, thực thể: hiện NGUYÊN VĂN là chữ, không sinh phần tử script, img, a, b', async () => {
    const spam =
      '<script>alert(1)</script> Click vào đây nhận ngay iPhone: http://spam.example/x?a=1&b=2 <img src=x onerror=alert(1)> &lt;b&gt;đậm&lt;/b&gt;';
    handlers.list = () =>
      jsonResponse(
        pageBody([
          item({
            nhanXet: spam,
            nguoiDanhGia: { hoTen: '<b>Nguyễn</b> & Vũ' },
          }),
        ]),
      );
    await renderPage();
    const grid = await table();
    expect(within(grid).getByText(spam)).toBeVisible();
    expect(within(grid).getByText('<b>Nguyễn</b> & Vũ')).toBeVisible();
    for (const tag of ['script', 'img', 'a', 'b']) {
      expect(grid.querySelector(tag)).toBeNull();
    }
    expect(within(grid).queryByRole('link')).toBeNull();
  });

  it('WKD-10 nhận xét 1.000 ký tự không dấu cách và nhiều dòng: nguyên văn, giữ xuống dòng', async () => {
    const long = 'x'.repeat(1000);
    const multi = 'dòng một\n\ndòng ba';
    handlers.list = () =>
      jsonResponse(
        pageBody([
          item({ danhGiaId: '1', nhanXet: long }),
          item({ danhGiaId: '2', nhanXet: multi }),
        ]),
      );
    await renderPage();
    const grid = await table();
    expect(within(grid).getByText(long)).toBeVisible();
    const paragraph = [...grid.querySelectorAll('p')].find(
      (element) => element.textContent === multi,
    );
    expect(paragraph).toBeDefined();
  });
});
