import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { StrictMode } from 'react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeMatchMedia } from '../../../test/fake-match-media';
import type { VaiTro } from '../../auth';
import { setAuthState } from '../../auth/auth-store';
import { patientAppointmentDetailPath } from '../../../shared/routes/booking-paths';
import {
  apiError,
  cleanUpFakeNotificationApi,
  installFakeNotificationApi,
  notice,
} from '../testing/fake-notification-api';
import {
  getUnreadSnapshot,
  resetUnreadStore,
  setUnreadCount,
} from '../unread/unread-store';
import { NotificationCenterPage } from './notification-center-page';

// notification F2 — trang Trung tâm thông báo (PLAN 5.10, 5.11): WTB-06…WTB-14, WTB-17, phần trang của WTB-03. API giả, đồng hồ giả (chỉ `Date`).
// Màn rộng là mặc định của happy-dom (1024 px); màn hẹp giả `matchMedia`. Mã ca NCP-nn là [đề xuất].
const PATH = '/benh-nhan/thong-bao';
const NOW = new Date('2026-11-20T03:00:00.000Z');

let api: ReturnType<typeof installFakeNotificationApi>;

function signedInAs(vaiTro: VaiTro = 'BenhNhan') {
  setAuthState({
    status: 'authenticated',
    user: { vaiTro, hoTen: 'Người dùng mẫu', daXacMinhEmail: true },
  });
}

function renderPage(path = PATH, { strict = false } = {}) {
  const router = createMemoryRouter(
    [
      { path: '/benh-nhan/thong-bao', element: <NotificationCenterPage /> },
      { path: '*', element: <p>Trang đích</p> },
    ],
    { initialEntries: [path] },
  );
  const app = <RouterProvider router={router} />;
  render(strict ? <StrictMode>{app}</StrictMode> : app);
  return router;
}

/** `count` thông báo, id giảm dần (mới nhất trước); `unreadIds` là các id chưa đọc. */
function seed(count: number, unreadIds: string[] = []) {
  for (let i = count; i >= 1; i -= 1)
    api.inbox.push(
      notice({
        id: String(i),
        tieuDe: `Tiêu đề ${i}`,
        noiDung: `Nội dung ${i}`,
        daDoc: !unreadIds.includes(String(i)),
      }),
    );
}

const list = () => screen.findByRole('list', { name: 'Danh sách thông báo' });
const rows = async () => within(await list()).getAllByRole('button');
const listCalls = () => api.callsTo('GET', '/notifications');
const markAllButton = () =>
  screen.getByRole('button', { name: /Đánh dấu tất cả đã đọc|Đang đánh dấu/ });
const tab = (name: string) =>
  screen
    .getByRole('group', { name: 'Lọc thông báo' })
    .querySelector(
      `button:nth-child(${['Tất cả', 'Chưa đọc', 'Đã đọc'].indexOf(name) + 1})`,
    ) as HTMLButtonElement;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  api = installFakeNotificationApi();
  resetUnreadStore();
  signedInAs();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  cleanUpFakeNotificationApi();
});

describe('danh sách (WTB-06)', () => {
  it('WTB-06 NCP-01 mới nhất trước; hàng chưa đọc có chấm, chữ đậm, tên đọc "Chưa đọc"; hàng đã đọc không; thời gian tương đối và tuyệt đối giờ Việt Nam', async () => {
    seed(3, ['3']);
    renderPage();
    const [first, second] = await rows();
    expect(first).toHaveTextContent('Tiêu đề 3');
    expect(second).toHaveTextContent('Tiêu đề 2');
    expect(first).toHaveAccessibleName(/^Chưa đọc\. Tiêu đề 3/);
    expect(within(first!).getByTestId('unread-dot')).toBeInTheDocument();
    expect(first!.querySelector('.font-bold')).toHaveTextContent('Tiêu đề 3');
    expect(second).not.toHaveAccessibleName(/Chưa đọc/);
    expect(within(second!).queryByTestId('unread-dot')).toBeNull();
    // 01:00 UTC = 08:00 giờ Việt Nam; NOW là 03:00 UTC
    expect(first).toHaveTextContent('2 giờ trước · 08:00 20/11/2026');
    expect(listCalls()[0]?.authorization).toBe('Bearer token-gia');
  });

  it('WTB-06 NCP-02 ba bộ lọc là nút `aria-pressed`; chọn bộ lọc ghi `?loc=` lên URL và gửi đúng `trangThaiDoc`; URL lạ ⇒ mặc định', async () => {
    seed(2, ['2']);
    const router = renderPage();
    await list();
    expect(tab('Tất cả')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(tab('Chưa đọc'));
    await waitFor(() =>
      expect(router.state.location.search).toBe('?loc=chua-doc'),
    );
    expect(tab('Chưa đọc')).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(listCalls()).toHaveLength(2));
    const fetched = api.fetchMock.mock.calls.map((call) => String(call[0]));
    expect(fetched.at(-1)).toContain('trangThaiDoc=chua-doc');
    expect(fetched.at(-1)).toContain('page=1');
    expect(fetched.at(-1)).toContain('pageSize=20');
  });

  it('WTB-06 NCP-03 mở thẳng `?loc=da-doc&trang=2` ⇒ gửi đúng trang và bộ lọc; giá trị lạ (`loc=abc`, `trang=0`, `trang=x`) ⇒ Tất cả, trang 1', async () => {
    seed(25);
    renderPage(`${PATH}?loc=da-doc&trang=2`);
    await list();
    expect(String(api.fetchMock.mock.calls.at(-1)?.[0])).toContain(
      'page=2&pageSize=20&trangThaiDoc=da-doc',
    );
    expect(tab('Đã đọc')).toHaveAttribute('aria-pressed', 'true');
  });

  it.each(['?loc=abc', '?trang=0', '?trang=x', '?trang=-1'])(
    'WTB-06 NCP-03b URL lạ %s ⇒ Tất cả, trang 1',
    async (search) => {
      seed(1);
      renderPage(`${PATH}${search}`);
      await list();
      expect(String(api.fetchMock.mock.calls.at(-1)?.[0])).toContain(
        'page=1&pageSize=20&trangThaiDoc=tat-ca',
      );
    },
  );
});

describe('phân trang và bộ lọc (WTB-07)', () => {
  it('WTB-07 NCP-04 "Trang sau" ghi `?trang=2`; đổi bộ lọc khi đang ở trang 2 ⇒ về trang 1 (URL bỏ `trang`)', async () => {
    seed(45, ['45']);
    const router = renderPage();
    await list();
    expect(screen.getByText('Trang 1/3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Trang trước/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Trang sau/ }));
    await waitFor(() => expect(router.state.location.search).toBe('?trang=2'));
    await screen.findByText('Trang 2/3');
    fireEvent.click(tab('Chưa đọc'));
    await waitFor(() =>
      expect(router.state.location.search).toBe('?loc=chua-doc'),
    );
  });

  it('WTB-07 NCP-05 trang vượt cuối ⇒ câu rỗng có nút "Về trang cuối" dẫn tới trang cuối', async () => {
    seed(45);
    const router = renderPage(`${PATH}?trang=9`);
    expect(
      await screen.findByText('Trang này không còn thông báo.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Về trang cuối' }));
    await waitFor(() => expect(router.state.location.search).toBe('?trang=3'));
    expect(await rows()).toHaveLength(5);
  });
});

describe('mở chi tiết (WTB-08, WTB-11, WTB-12)', () => {
  it('WTB-08 NCP-06 chọn hàng chưa đọc ⇒ panel có nội dung đầy đủ; `POST read` ĐÚNG một lần dù bấm đúp và chọn lại; hàng hết chấm; chuông lấy số máy chủ trả', async () => {
    seed(3, ['3', '2']);
    renderPage();
    const [first] = await rows();
    fireEvent.click(first!);
    fireEvent.click(first!);
    const detail = screen.getByRole('region', { name: 'Chi tiết thông báo' });
    expect(
      within(detail).getByRole('heading', { name: 'Tiêu đề 3' }),
    ).toBeInTheDocument();
    expect(detail).toHaveTextContent('Nội dung 3');
    await waitFor(() =>
      expect(within(first!).queryByTestId('unread-dot')).toBeNull(),
    );
    fireEvent.click((await rows())[1]!);
    fireEvent.click((await rows())[0]!);
    await waitFor(() => expect(getUnreadSnapshot().unread).toBe(0));
    expect(api.callsTo('POST', '/notifications/3/read')).toHaveLength(1);
    expect(api.callsTo('POST', '/notifications/2/read')).toHaveLength(1);
  });

  it('WTB-08 NCP-07 `StrictMode`: mở một lần ⇒ một `POST read`; hàng đã đọc ⇒ không gọi', async () => {
    seed(2, ['2']);
    renderPage(PATH, { strict: true });
    const [unreadRow, readRow] = await rows();
    fireEvent.click(unreadRow!);
    fireEvent.click(readRow!);
    await waitFor(() =>
      expect(api.callsTo('POST', '/notifications/2/read')).toHaveLength(1),
    );
    expect(api.callsTo('POST', '/notifications/1/read')).toHaveLength(0);
  });

  it('WTB-08 NCP-08 `POST read` thất bại ⇒ vẫn xem được, nhắc nhỏ, hàng vẫn chưa đọc; mở lại ⇒ thử lần nữa', async () => {
    seed(1, ['1']);
    api.replyNext('POST /notifications/1/read', apiError(500, 'LOI_HE_THONG'));
    renderPage();
    const [row] = await rows();
    fireEvent.click(row!);
    expect(
      await screen.findByText('Chưa đánh dấu được là đã đọc. Thử lại sau.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Chi tiết thông báo' }),
    ).toHaveTextContent('Nội dung 1');
    expect(within(row!).getByTestId('unread-dot')).toBeInTheDocument();
    fireEvent.click(row!);
    await waitFor(() =>
      expect(api.callsTo('POST', '/notifications/1/read')).toHaveLength(2),
    );
    await waitFor(() =>
      expect(within(row!).queryByTestId('unread-dot')).toBeNull(),
    );
  });

  it('WTB-11 NCP-09 lịch hẹn ⇒ nút "Xem lịch hẹn" tới chi tiết lịch của Bệnh nhân (mã mã hoá); bấm thì sang trang đích', async () => {
    api.inbox.push(
      notice({
        id: '9',
        lienKet: { kieu: 'LichHen', maLichHen: 'CP/1' },
        nhom: 'LichHen',
      }),
    );
    const router = renderPage();
    fireEvent.click((await rows())[0]!);
    const link = screen.getByRole('link', { name: 'Xem lịch hẹn' });
    expect(link).toHaveAttribute('href', patientAppointmentDetailPath('CP/1'));
    fireEvent.click(link);
    await screen.findByText('Trang đích');
    expect(router.state.location.pathname).toBe(
      patientAppointmentDetailPath('CP/1'),
    );
  });

  it('WTB-11 NCP-10 ô (kiểu, vai trò) không có đích ⇒ không nút (ví của Bác sĩ; liên kết `null`)', async () => {
    signedInAs('BacSi');
    api.inbox.push(notice({ id: '2' }), notice({ id: '1', lienKet: null }));
    renderPage();
    const [vi, none] = await rows();
    fireEvent.click(vi!);
    expect(screen.queryByRole('link')).toBeNull();
    fireEvent.click(none!);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('WTB-12 NCP-11 nội dung có thẻ HTML ⇒ hiện nguyên chữ, không tạo phần tử; mã lạ (`nhom: null`) ⇒ nhóm "Khác"', async () => {
    api.inbox.push(
      notice({
        nhom: null,
        loai: 'MaLa',
        tieuDe: 'Thông báo',
        noiDung: '<b>đậm</b><img src=x onerror=alert(1)>',
      }),
    );
    renderPage();
    fireEvent.click((await rows())[0]!);
    const detail = screen.getByRole('region', { name: 'Chi tiết thông báo' });
    expect(detail).toHaveTextContent('<b>đậm</b><img src=x onerror=alert(1)>');
    expect(document.querySelector('b, img')).toBeNull();
    expect(detail).toHaveTextContent('Khác');
  });
});

describe('đánh dấu tất cả (WTB-09, WTB-17)', () => {
  it('WTB-09 NCP-12 đang gửi ⇒ khoá, bấm đúp chỉ một POST; xong ⇒ số về 0, nút vô hiệu, danh sách tải lại không còn chấm', async () => {
    seed(3, ['3', '1']);
    api.replyNext('POST /notifications/read-all', { hold: true });
    renderPage();
    await list();
    const button = markAllButton();
    expect(button).toBeEnabled();
    fireEvent.click(button);
    fireEvent.click(button);
    expect(markAllButton()).toBeDisabled();
    expect(markAllButton()).toHaveTextContent('Đang đánh dấu…');
    expect(api.callsTo('POST', '/notifications/read-all')).toHaveLength(1);
    // Phản hồi treo không chạy "máy chủ" giả: tự đánh dấu như backend đã làm
    for (const row of api.inbox) row.daDoc = true;
    await act(async () => {
      api.release({ body: { daDanhDau: 2, soChuaDoc: 0 } });
    });
    await waitFor(() => expect(getUnreadSnapshot().unread).toBe(0));
    expect(markAllButton()).toBeDisabled();
    expect(markAllButton()).toHaveTextContent('Đánh dấu tất cả đã đọc');
    await waitFor(() => expect(listCalls()).toHaveLength(2));
    expect(screen.getByText('Bạn không có thông báo chưa đọc.')).toBeVisible();
  });

  it('WTB-09 NCP-13 không còn chưa đọc ⇒ nút vô hiệu ngay', async () => {
    seed(1);
    renderPage();
    await list();
    expect(markAllButton()).toBeDisabled();
  });

  it('WTB-09 NCP-13b lỗi ⇒ câu báo, nút bật lại', async () => {
    seed(1, ['1']);
    renderPage();
    await list();
    expect(markAllButton()).toBeEnabled();
    api.replyNext(
      'POST /notifications/read-all',
      apiError(500, 'LOI_HE_THONG'),
    );
    fireEvent.click(markAllButton());
    expect(
      await screen.findByText('Chưa đánh dấu được tất cả. Thử lại sau.'),
    ).toBeInTheDocument();
    expect(markAllButton()).toBeEnabled();
  });

  it('WTB-17 NCP-14 số chưa đọc là số của MÁY CHỦ, không đếm danh sách đang hiện (trang 1 toàn đã đọc nhưng máy chủ còn 2)', async () => {
    seed(25, ['2', '1']);
    renderPage();
    await list();
    expect(screen.getByText('Bạn có 2 thông báo chưa đọc.')).toBeVisible();
    expect(markAllButton()).toBeEnabled();
    expect(getUnreadSnapshot().unread).toBe(2);
  });

  it('WTB-17 NCP-15 kho trình duyệt và URL: sau khi xem, đọc và đánh dấu tất cả ⇒ `localStorage`, `sessionStorage` rỗng; URL không chứa nội dung', async () => {
    seed(2, ['2']);
    const router = renderPage();
    fireEvent.click((await rows())[0]!);
    fireEvent.click(markAllButton());
    await waitFor(() => expect(listCalls()).toHaveLength(2));
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(router.state.location.search).toBe('');
    expect(
      `${router.state.location.pathname}${router.state.location.hash}`,
    ).toBe(PATH);
  });
});

describe('trạng thái (WTB-10) và số tăng (WTB-03)', () => {
  it('WTB-10 NCP-16 đang tải ⇒ khung giữ chỗ `role="status"`; xong ⇒ mất', async () => {
    seed(1);
    api.replyNext('GET /notifications', { hold: true });
    renderPage();
    expect(
      await screen.findByRole('status', { name: 'Đang tải thông báo' }),
    ).toBeInTheDocument();
    await act(async () => {
      api.release({
        body: { items: [], total: 0, page: 1, pageSize: 20, soChuaDoc: 0 },
      });
    });
    expect(
      screen.queryByRole('status', { name: 'Đang tải thông báo' }),
    ).toBeNull();
  });

  it.each([
    ['tat-ca', 'Bạn chưa có thông báo nào.'],
    ['chua-doc', 'Bạn không có thông báo chưa đọc.'],
    ['da-doc', 'Bạn chưa có thông báo đã đọc.'],
  ])('WTB-10 NCP-17 rỗng ở bộ lọc %s ⇒ câu riêng', async (loc, text) => {
    renderPage(`${PATH}?loc=${loc}`);
    const empty = await screen.findAllByText(text);
    expect(empty.length).toBeGreaterThan(0);
    expect(screen.queryByRole('list')).toBeNull();
  });

  it.each([
    [
      apiError(500, 'LOI_HE_THONG'),
      'Hệ thống đang gặp sự cố. Vui lòng thử lại sau.',
    ],
    [
      apiError(400, 'DU_LIEU_KHONG_HOP_LE'),
      'Bộ lọc không hợp lệ. Vui lòng tải lại trang.',
    ],
    [
      { network: true } as const,
      'Không tải được thông báo. Kiểm tra kết nối rồi thử lại.',
    ],
    [
      { body: { items: 'x' } },
      'Hệ thống đang gặp sự cố. Vui lòng thử lại sau.',
    ],
  ])(
    'WTB-10 NCP-18 lỗi tải ⇒ câu theo loại lỗi, có "Thử lại" tải lại được (%#)',
    async (reply, text) => {
      seed(1);
      api.replyNext('GET /notifications', reply);
      renderPage();
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(text);
      fireEvent.click(within(alert).getByRole('button', { name: 'Thử lại' }));
      expect(await rows()).toHaveLength(1);
    },
  );

  it('WTB-03 NCP-19 số chưa đọc tăng (thăm dò) khi đang ở trang 1 ⇒ tải lại danh sách; ở trang 2 ⇒ không', async () => {
    seed(25, ['25']);
    renderPage();
    await list();
    expect(listCalls()).toHaveLength(1);
    act(() => setUnreadCount(4));
    await waitFor(() => expect(listCalls()).toHaveLength(2));
  });

  it('WTB-03 NCP-19b ở trang 2: số tăng ⇒ không tải lại', async () => {
    seed(25, ['25']);
    renderPage(`${PATH}?trang=2`);
    await list();
    act(() => setUnreadCount(4));
    await act(async () => {
      await Promise.resolve();
    });
    expect(listCalls()).toHaveLength(1);
  });
});

describe('màn hẹp và bàn phím (WTB-13, WTB-14)', () => {
  beforeEach(() => {
    fakeMatchMedia(375);
  });

  it('WTB-14 WTB-13 NCP-20 375 px: danh sách và chi tiết là hai màn; mở ⇒ tiêu điểm vào tiêu đề, có "Quay lại"; Quay lại ⇒ về danh sách, tiêu điểm về hàng vừa mở', async () => {
    seed(3, ['2']);
    renderPage();
    const second = (await rows())[1]!;
    fireEvent.click(second);
    expect(screen.queryByRole('list')).toBeNull();
    const heading = screen.getByRole('heading', { name: 'Tiêu đề 2' });
    expect(heading).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Quay lại' }));
    const again = (await rows())[1]!;
    expect(again).toHaveTextContent('Tiêu đề 2');
    expect(again).toHaveFocus();
  });

  it('WTB-13 NCP-21 Esc đóng màn chi tiết, tiêu điểm về hàng vừa mở; màn rộng thì không có "Quay lại"', async () => {
    seed(2);
    renderPage();
    const first = (await rows())[0]!;
    fireEvent.click(first);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect((await rows())[0]).toHaveFocus();
  });
});

describe('màn rộng', () => {
  it('WTB-14 NCP-22 1024 px: danh sách và chi tiết cùng màn, chưa chọn thì có câu gợi ý; không có nút "Quay lại"', async () => {
    seed(1);
    renderPage();
    await list();
    expect(
      screen.getByText('Chọn một thông báo để xem chi tiết.'),
    ).toBeInTheDocument();
    fireEvent.click((await rows())[0]!);
    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Quay lại' })).toBeNull();
  });
});
