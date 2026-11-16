import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderExamPage, useFixedClock } from './testing/render-exam-page';

// doctor-exam F5, WXH-08, BDK-02, BDK-09 (phần trang): dữ liệu sức khoẻ (người khám, năm, tháng, mã ca, nội dung hồ sơ) KHÔNG vào kho trình duyệt, URL ngoài `?ca=<mã lịch hẹn>`, `document.title`, log. Chạy qua đủ các thao tác: lọc người khám,
// đổi năm, chọn tháng, chọn ca. Kiểm cả `localStorage.length` và `sessionStorage.length` (không chỉ spy `setItem`: spy dựng lại sau `mockRestore` có thể không thấy lần gọi; bài học F4). Bộ quét tĩnh mã nguồn ở `patient-exam-hygiene.test.ts` (WXH-16).
const PATH = '/benh-nhan/ho-so-kham-benh';

const consoleSpies = [
  vi.spyOn(console, 'log'),
  vi.spyOn(console, 'info'),
  vi.spyOn(console, 'warn'),
  vi.spyOn(console, 'error'),
  vi.spyOn(console, 'debug'),
];
let initialTitle = '';

beforeEach(() => {
  useFixedClock();
  localStorage.clear();
  sessionStorage.clear();
  initialTitle = document.title;
  for (const spy of consoleSpies) spy.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const monthCard = (title: string) =>
  screen.findByRole('region', { name: title });
const people = () => screen.getByRole('group', { name: 'Lọc theo người khám' });
const years = () => screen.getByRole('group', { name: 'Năm' });

function expectClean(router: ReturnType<typeof renderExamPage>['router']) {
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
  expect(document.title).toBe(initialTitle);
  expect(document.cookie).toBe('');
  const { location } = router.state;
  expect(location.pathname).toBe(PATH);
  expect(location.hash).toBe('');
  expect(location.state).toBeNull();
  // URL chỉ có `?ca=` (hoặc không có gì)
  expect(
    [...new URLSearchParams(location.search).keys()].filter(
      (key) => key !== 'ca',
    ),
  ).toEqual([]);
  // Lời cảnh báo `act(...)` của React là chuyện của bộ test (cập nhật đến giữa hai lần chờ), không phải log của ứng dụng
  for (const spy of consoleSpies) {
    const own = spy.mock.calls.filter(
      (args) => !String(args[0]).includes('not wrapped in act'),
    );
    expect(own).toEqual([]);
  }
}

describe('doctor-exam F5 — dữ liệu sức khoẻ không lên kho, URL, tiêu đề, log', () => {
  it('WXH-08, BDK-02 người khám, năm, tháng KHÔNG lên URL, kho trình duyệt hay `document.title` sau mỗi thao tác lọc', async () => {
    const { router } = renderExamPage();
    await monthCard('Tháng 10 2026');
    expectClean(router);
    expect(router.state.location.search).toBe('');

    fireEvent.click(
      within(people()).getByRole('button', { name: 'Bùi Minh Khoa · Con' }),
    );
    await monthCard('Tháng 10 2026');
    expectClean(router);
    expect(router.state.location.search).toBe('');

    // Người thân không có ca năm 2025: quay về "tất cả" rồi mới đổi năm
    fireEvent.click(
      within(people()).getByRole('button', { name: 'Tất cả người đi khám' }),
    );
    await monthCard('Tháng 10 2026');
    fireEvent.click(within(years()).getByRole('button', { name: '2025' }));
    await monthCard('Tháng 12 2025');
    expectClean(router);
    expect(router.state.location.search).toBe('');

    fireEvent.click(within(years()).getByRole('button', { name: '2026' }));
    await monthCard('Tháng 10 2026');
    fireEvent.click(screen.getByRole('button', { name: 'Tháng 3, 2 ca' }));
    await monthCard('Tháng 3 2026');
    expectClean(router);
    expect(router.state.location.search).toBe('');
  });

  it('WXH-08 chọn ca: URL CHỈ có `?ca=<mã lịch hẹn>`, dùng REPLACE; nội dung hồ sơ và tên người khám không vào kho, tiêu đề, log', async () => {
    const { router } = renderExamPage();
    const card = await monthCard('Tháng 10 2026');
    fireEvent.click(within(card).getByRole('button', { name: /Tiêu hóa/ }));
    await screen.findByRole('heading', { level: 2, name: 'Tiêu hóa' });

    expect(router.state.location.search).toBe('?ca=CLX-A2');
    expect(router.state.historyAction).toBe('REPLACE');
    expect([
      ...new URLSearchParams(router.state.location.search).entries(),
    ]).toEqual([['ca', 'CLX-A2']]);
    expectClean(router);
    expect(window.location.search).not.toContain('Tiêu');
  });

  it('WXH-08 đổi người khám, năm hay tháng XOÁ `?ca=` (ca cũ không còn trong danh sách đang xem)', async () => {
    const { router } = renderExamPage();
    const card = await monthCard('Tháng 10 2026');
    fireEvent.click(within(card).getByRole('button', { name: /Tiêu hóa/ }));
    await screen.findByRole('heading', { level: 2, name: 'Tiêu hóa' });
    expect(router.state.location.search).toBe('?ca=CLX-A2');

    // Điều hướng của router dữ liệu hoàn tất bất đồng bộ: chờ URL đổi thay vì đọc ngay
    fireEvent.click(screen.getByRole('button', { name: 'Tháng 6, 5 ca' }));
    await waitFor(() => expect(router.state.location.search).toBe(''));
    await monthCard('Tháng 6 2026');
    expect(
      within(
        screen.getByRole('region', { name: 'Chi tiết ca khám' }),
      ).getByText('Chọn một ca khám để xem hồ sơ'),
    ).toBeInTheDocument();

    const june = await monthCard('Tháng 6 2026');
    fireEvent.click(within(june).getAllByRole('button')[0]);
    await screen.findByRole('heading', { level: 2, name: 'Cơ Xương Khớp' });
    expect(router.state.location.search).toBe('?ca=CLX-J1');

    fireEvent.click(
      within(people()).getByRole('button', { name: 'Bùi Minh Khoa · Con' }),
    );
    await waitFor(() => expect(router.state.location.search).toBe(''));
    await monthCard('Tháng 10 2026');

    fireEvent.click(
      within(
        screen.getByRole('region', { name: 'Tháng 10 2026' }),
      ).getAllByRole('button')[0],
    );
    await screen.findByRole('heading', { level: 2, name: 'Nhi khoa' });
    expect(router.state.location.search).toBe('?ca=CLX-A1');
    // Người thân không có ca năm 2025: trang báo năm trống, `?ca=` vẫn bị xoá
    fireEvent.click(within(years()).getByRole('button', { name: '2025' }));
    await waitFor(() => expect(router.state.location.search).toBe(''));
    await screen.findByText('Năm 2025 chưa có ca khám nào đã hoàn thành.');
    expectClean(router);
  });

  it('WXH-08 mở thẳng `?ca=` rồi đổi bộ lọc: `?ca=` cũng bị xoá; không thao tác nào ghi kho hay log', async () => {
    const { router } = renderExamPage({ url: `${PATH}?ca=CLX-A2` });
    await monthCard('Tháng 10 2026');
    await screen.findByRole('heading', { level: 2, name: 'Tiêu hóa' });
    expect(router.state.location.search).toBe('?ca=CLX-A2');
    fireEvent.click(screen.getByRole('button', { name: 'Tháng 6, 5 ca' }));
    await waitFor(() => expect(router.state.location.search).toBe(''));
    await monthCard('Tháng 6 2026');
    expectClean(router);
  });

  it('BDK-09 không ghi `Storage.prototype.setItem`, không `history.state` mang dữ liệu; mã ca không là dữ liệu nội dung', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const { router } = renderExamPage();
    const card = await monthCard('Tháng 10 2026');
    fireEvent.click(within(card).getByRole('button', { name: /Tiêu hóa/ }));
    await screen.findByRole('heading', { level: 2, name: 'Tiêu hóa' });
    expect(setItem).not.toHaveBeenCalled();
    expect(router.state.location.state).toBeNull();
    setItem.mockRestore();
  });
});
