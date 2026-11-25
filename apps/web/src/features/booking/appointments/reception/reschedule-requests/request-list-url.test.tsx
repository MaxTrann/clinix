import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeRecord } from '../../../testing/fake-reschedule-requests-api';
import {
  makeHandledDetail,
  makeRequestDetail,
  makeRequestRows,
} from '../../../testing/reschedule-requests-fixtures';
import {
  cleanUpRequestsPage,
  currentUrl,
  detailLink,
  DOCTORS,
  doctorSelect,
  lastListQuery,
  listQueries,
  loaded,
  renderRequests,
  rowCodes,
  searchBox,
  submitSearch,
  tabButton,
  typeCode,
  type FakeRequestsApi,
} from '../../../testing/reschedule-requests-harness';
import { REQUEST_TEXT } from '../../common/reschedule-requests/request-text';

// reschedule F4, WXD-10 theo PLAN reschedule 7.11 ("URL giữ tab") và WXD-66…WXD-68 `[đề xuất]`: tab, trang, mã lịch và bác sĩ nằm trên URL; tải lại và nút Quay lại từ trang chi tiết giữ nguyên; giá trị URL sai về mặc định.
// Hàm thuần đọc, ghi URL ở `request-query-state.test.ts`. Dữ liệu giả.
afterEach(cleanUpRequestsPage);

const LIST = '/le-tan/yeu-cau-doi-lich';
const CODE = 'CLX-20261120-7K3M9';

const handled = (count: number) =>
  makeRequestRows(count).map((row) => makeHandledDetail('DaDuyet', row));

const seedHandled = (api: FakeRequestsApi, count: number) => {
  api.records = handled(count).map((detail) => fakeRecord(detail, '9'));
  api.doctors = DOCTORS;
};

describe('bộ lọc trên URL', () => {
  it('WXD-66 vào bằng URL có tab, trang và bác sĩ: truy vấn ĐẦU TIÊN đã mang đúng bộ lọc, tab và ô chọn hiện đúng', async () => {
    const { api } = renderRequests({
      before: (fake) => seedHandled(fake, 45),
      entry: `${LIST}?tab=da-xu-ly&page=2&bacSiId=9`,
    });
    await loaded();
    expect(listQueries(api)[0]).toEqual({
      trangThai: 'DaDuyet,TuChoi',
      page: '2',
      bacSiId: '9',
    });
    expect(tabButton('Đã xử lý')).toHaveAttribute('aria-pressed', 'true');
    await screen.findByRole('option', { name: 'Lê Thảo Vy' });
    expect(doctorSelect().value).toBe('9');
    expect(await screen.findByText('Trang 2 / 3')).toBeInTheDocument();
  });

  it('WXD-66 vào bằng URL có mã lịch: ô tìm hiện mã, truy vấn đầu mang `q` chữ HOA đã chuẩn hoá (URL chữ thường cũng được)', async () => {
    const { api } = renderRequests({
      before: (fake) => {
        fake.records = [
          fakeRecord(makeRequestDetail({ yeuCauId: '1', maLichHen: CODE })),
        ];
      },
      entry: `${LIST}?q=${CODE.toLowerCase()}`,
    });
    await loaded();
    expect(listQueries(api)[0]).toEqual({
      trangThai: 'ChoDuyet',
      page: '1',
      q: CODE,
    });
    expect(searchBox().value).toBe(CODE);
  });

  it('WXD-10 tải lại trang: dựng lại với CHÍNH URL hiện tại thì giữ nguyên tab, trang, bác sĩ và mã (không lưu ở kho trình duyệt)', async () => {
    const first = renderRequests({
      before: (fake) => seedHandled(fake, 45),
    });
    await screen.findByText(REQUEST_TEXT.emptyWaiting);
    fireEvent.click(tabButton('Đã xử lý'));
    await screen.findByText('Trang 1 / 3');
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    await screen.findByText('Trang 2 / 3');
    const url = currentUrl()!;
    expect(url).toBe(`${LIST}?tab=da-xu-ly&page=2`);

    first.unmount();
    cleanUpRequestsPage();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);

    const second = renderRequests({
      before: (fake) => seedHandled(fake, 45),
      entry: url,
    });
    await screen.findByText('Trang 2 / 3');
    expect(tabButton('Đã xử lý')).toHaveAttribute('aria-pressed', 'true');
    expect(lastListQuery(second.api)).toEqual({
      trangThai: 'DaDuyet,TuChoi',
      page: '2',
    });
  });

  it('WXD-10 mở chi tiết rồi "Quay lại danh sách": về ĐÚNG tab, trang và bộ lọc đã mở, và danh sách tải lại đúng truy vấn đó', async () => {
    const { api } = renderRequests({
      before: (fake) => seedHandled(fake, 45),
      entry: `${LIST}?tab=da-xu-ly&page=2&bacSiId=9`,
    });
    await loaded();
    const code = rowCodes()[0]!;
    fireEvent.click(detailLink(code));
    await screen.findByRole('heading', { name: REQUEST_TEXT.detailTitle });
    expect(currentUrl()).toMatch(/^\/le-tan\/yeu-cau-doi-lich\/\d+$/);

    fireEvent.click(screen.getByRole('link', { name: REQUEST_TEXT.back }));
    await loaded();
    expect(currentUrl()).toBe(`${LIST}?tab=da-xu-ly&bacSiId=9&page=2`);
    expect(lastListQuery(api)).toEqual({
      trangThai: 'DaDuyet,TuChoi',
      page: '2',
      bacSiId: '9',
    });
    expect(tabButton('Đã xử lý')).toHaveAttribute('aria-pressed', 'true');
  });

  it('WXD-66 URL chỉ có khoá KHÁC mặc định, thứ tự cố định (tab, bác sĩ, mã, trang), dù người dùng đổi bộ lọc theo thứ tự nào', async () => {
    renderRequests({ before: (fake) => seedHandled(fake, 3) });
    await screen.findByText(REQUEST_TEXT.emptyWaiting);
    await screen.findByRole('option', { name: 'Lê Thảo Vy' });
    typeCode(CODE);
    submitSearch();
    await waitFor(() => expect(currentUrl()).toBe(`${LIST}?q=${CODE}`));
    fireEvent.change(doctorSelect(), { target: { value: '9' } });
    await waitFor(() =>
      expect(currentUrl()).toBe(`${LIST}?bacSiId=9&q=${CODE}`),
    );
    fireEvent.click(tabButton('Đã xử lý'));
    await waitFor(() =>
      expect(currentUrl()).toBe(`${LIST}?tab=da-xu-ly&bacSiId=9&q=${CODE}`),
    );
  });
});

describe('URL sai', () => {
  it('WXD-68 giá trị sai (tab lạ, trang 0, bác sĩ không phải id, mã sai dạng, khoá lạ) ⇒ về mặc định: truy vấn đầu CHỈ có `trangThai=ChoDuyet` và `page=1`', async () => {
    const { api } = renderRequests({
      before: (fake) => {
        fake.records = makeRequestRows(2).map((row) =>
          fakeRecord(makeRequestDetail(row)),
        );
      },
      entry: `${LIST}?tab=zzz&page=0&bacSiId=abc&q=khong-phai-ma&chiNhanhId=3&pageSize=100`,
    });
    await loaded();
    expect(listQueries(api)).toEqual([{ trangThai: 'ChoDuyet', page: '1' }]);
    expect(tabButton('Chờ duyệt')).toHaveAttribute('aria-pressed', 'true');
    expect(searchBox().value).toBe('');
    // Khoá lạ KHÔNG bao giờ đi tiếp lên API (sẽ là 400 `TRUONG_KHONG_DUOC_PHEP`)
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each(['99999999999', '-1', '1.5', '007', 'abc'])(
    'WXD-68 `page=%s` ⇒ trang 1, không đẩy giá trị tự gõ lên API',
    async (page) => {
      const { api } = renderRequests({
        before: (fake) => {
          fake.records = makeRequestRows(2).map((row) =>
            fakeRecord(makeRequestDetail(row)),
          );
        },
        entry: `${LIST}?page=${page}`,
      });
      await loaded();
      expect(listQueries(api)).toEqual([{ trangThai: 'ChoDuyet', page: '1' }]);
    },
  );

  it('WXD-68 sau khi người dùng đổi bộ lọc, URL được ghi lại ở dạng CHUẨN (khoá lạ và giá trị sai không sống tiếp)', async () => {
    renderRequests({
      before: (fake) => {
        fake.records = [
          fakeRecord(makeHandledDetail('DaDuyet', { yeuCauId: '1' })),
        ];
      },
      entry: `${LIST}?foo=bar&page=0&q=sai`,
    });
    await screen.findByText(REQUEST_TEXT.emptyWaiting);
    fireEvent.click(tabButton('Đã xử lý'));
    await waitFor(() => expect(currentUrl()).toBe(`${LIST}?tab=da-xu-ly`));
  });
});

describe('dữ liệu cá nhân và nhật ký', () => {
  it('WXD-10 suốt luồng lọc: không localStorage, sessionStorage, cookie, không console; URL không chứa tên người khám', async () => {
    const consoleSpies = (
      ['log', 'info', 'warn', 'error', 'debug'] as const
    ).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    );
    localStorage.clear();
    sessionStorage.clear();
    renderRequests({
      before: (fake) => {
        fake.records = [
          fakeRecord(
            makeRequestDetail({
              yeuCauId: '1',
              maLichHen: CODE,
              nguoiKham: { hoTen: 'Tên Người Khám Giả', laNguoiThan: false },
            }),
            '9',
          ),
        ];
        fake.doctors = DOCTORS;
      },
    });
    await loaded();
    await screen.findByRole('option', { name: 'Lê Thảo Vy' });
    typeCode(CODE);
    submitSearch();
    fireEvent.change(doctorSelect(), { target: { value: '9' } });
    fireEvent.click(tabButton('Đã xử lý'));
    fireEvent.click(tabButton('Chờ duyệt'));
    await waitFor(() => expect(currentUrl()).toContain('bacSiId=9'));

    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(document.cookie).toBe('');
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
    expect(currentUrl()).not.toMatch(/Tên|Khám|%/);
    consoleSpies.forEach((spy) => spy.mockRestore());
  });
});
