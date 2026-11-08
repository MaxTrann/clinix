import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import {
  GENERIC_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  TIMEOUT_ERROR_MESSAGE,
} from '../../../shared/api/error-message';
import { logout } from '../../auth';
import { getAuthState } from '../../auth/auth-store';
import { hang, json } from '../testing/fake-lookup-api';
import {
  advance,
  renderLookupPage,
  resultRow,
  resultRows,
  searchBox,
  searchFor,
  typeSearch,
  startFakeClock,
} from '../testing/lookup-harness';

// patient F8 (TRACKING F8-E, F8-I): lỗi của lời gọi tìm. Mã ca LK-nn là [đề xuất]; mỗi ca ghi mã TC-18 và Q22 (trạng thái chưa có frame:
// câu chữ theo PLAN 5.9 hoặc thành phần có sẵn). "Thử lại" chỉ chạy khi bấm, không tự thử lại.
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const retryButton = () => screen.getByRole('button', { name: 'Thử lại' });

async function mountFailing(
  failure: (init?: RequestInit) => Response | Promise<Response>,
) {
  const api = await renderLookupPage({
    before: ({ lookup }) => lookup.failNext('search', failure),
  });
  startFakeClock();
  return api;
}

describe('lỗi mạng, quá giờ, 5xx, phản hồi lạ (TC-18, Q22)', () => {
  it('LK-34 TC-18 mất mạng ⇒ câu mất mạng + "Thử lại", KHÔNG tự thử lại; bấm "Thử lại" gọi lại đúng truy vấn và hiện kết quả', async () => {
    const { lookup } = await mountFailing(() => {
      throw new TypeError('Failed to fetch');
    });
    await searchFor('example');

    expect(screen.getByRole('alert')).toHaveTextContent(NETWORK_ERROR_MESSAGE);
    await advance(10_000);
    expect(lookup.searches).toHaveLength(1);

    fireEvent.click(retryButton());
    await advance(0);
    expect(lookup.searches).toHaveLength(2);
    expect(lookup.searches[1].query.get('q')).toBe('example');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(resultRows()).toHaveLength(3);
  });

  it('LK-35 TC-18 quá giờ (15 giây) ⇒ câu quá giờ + "Thử lại"', async () => {
    await mountFailing((init) => hang(init));
    await searchFor('example');
    await advance(15_000);

    expect(screen.getByRole('alert')).toHaveTextContent(TIMEOUT_ERROR_MESSAGE);
    expect(retryButton()).toBeVisible();
  });

  it('LK-36 TC-18 500 LOI_HE_THONG ⇒ câu chung + "Thử lại"; không lộ thongBao hay requestId của API', async () => {
    await mountFailing(() =>
      json(500, {
        maLoi: 'LOI_HE_THONG',
        thongBao: 'chi tiết nội bộ của API',
        requestId: 'req-123',
      }),
    );
    await searchFor('example');

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(GENERIC_ERROR_MESSAGE);
    expect(alert).not.toHaveTextContent('chi tiết nội bộ');
    expect(alert).not.toHaveTextContent('req-123');
    expect(retryButton()).toBeVisible();
  });

  it('LK-37 TC-18 phản hồi 200 sai hình dạng ⇒ câu chung + "Thử lại" (không trang trắng)', async () => {
    await mountFailing(() => json(200, { items: 'không phải mảng' }));
    await searchFor('example');

    expect(screen.getByRole('alert')).toHaveTextContent(GENERIC_ERROR_MESSAGE);
    expect(retryButton()).toBeVisible();
  });

  it('LK-38 TC-18 HTML 502 của proxy ⇒ câu chung, không lộ HTML', async () => {
    await mountFailing(
      () => new Response('<html>Bad Gateway</html>', { status: 502 }),
    );
    await searchFor('example');

    expect(screen.getByRole('alert')).toHaveTextContent(GENERIC_ERROR_MESSAGE);
    expect(screen.queryByText(/Bad Gateway/)).toBeNull();
  });
});

describe('đăng xuất giữa chừng (client huỷ, TC-18)', () => {
  it('LK-42b TC-18 đăng xuất giữa lúc TÌM ⇒ không câu lỗi, không "Thử lại"', async () => {
    await mountFailing((init) => hang(init));
    await searchFor('example');
    expect(screen.getByText('Đang tìm...')).toBeInTheDocument();

    await act(async () => {
      await logout();
    });
    expect(getAuthState().status).toBe('unauthenticated');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
  });

  it('LK-42c TC-18 đăng xuất giữa lúc TẢI HỒ SƠ ⇒ không câu lỗi, không "Thử lại"', async () => {
    const { lookup } = await renderLookupPage();
    startFakeClock();
    await searchFor('example');
    lookup.failNext('detail', (init) => hang(init));
    fireEvent.click(resultRow(/Đặng Văn Hùng/));
    await advance(0);
    expect(screen.getByText('Đang tải hồ sơ...')).toBeInTheDocument();

    await act(async () => {
      await logout();
    });
    expect(getAuthState().status).toBe('unauthenticated');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
  });
});

describe('lỗi có câu riêng theo MÃ (Q22, PLAN 5.9)', () => {
  it('LK-39 Q22 400 TU_KHOA_KHONG_HOP_LE (luật web và API lệch) ⇒ "Nhập ít nhất 2 ký tự để tìm kiếm." và KHÔNG có "Thử lại"', async () => {
    await mountFailing(() =>
      json(400, {
        maLoi: 'DU_LIEU_KHONG_HOP_LE',
        thongBao: 'Dữ liệu không hợp lệ.',
        loi: [{ truong: 'q', ma: 'TU_KHOA_KHONG_HOP_LE' }],
      }),
    );
    await searchFor('example');

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Nhập ít nhất 2 ký tự để tìm kiếm.',
    );
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
  });

  it('LK-40 Q22 403 KHONG_DU_QUYEN ⇒ "Bạn không có quyền thực hiện thao tác này." không có "Thử lại"', async () => {
    await mountFailing(() =>
      json(403, { maLoi: 'KHONG_DU_QUYEN', thongBao: 'x' }),
    );
    await searchFor('example');

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Bạn không có quyền thực hiện thao tác này.',
    );
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
  });

  it('LK-41 TC-18 401 PHIEN_HET_HIEU_LUC ⇒ lớp client xoá phiên, trang không hiện thêm câu lỗi', async () => {
    // Đồng hồ thật: `waitFor` của Testing Library không chạy được khi `setTimeout` bị giả; Enter bỏ qua phần đợi 300 ms
    await renderLookupPage({
      before: ({ lookup }) =>
        lookup.failNext('search', () =>
          json(401, { maLoi: 'PHIEN_HET_HIEU_LUC', thongBao: 'x' }),
        ),
    });
    typeSearch('example');
    fireEvent.keyDown(searchBox(), { key: 'Enter' });
    await waitFor(() => expect(getAuthState().status).toBe('unauthenticated'));

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
  });

  it('LK-42 TC-18 sau lỗi, gõ từ khoá khác tìm bình thường và câu lỗi biến mất', async () => {
    await mountFailing(() =>
      json(500, { maLoi: 'LOI_HE_THONG', thongBao: 'x' }),
    );
    await searchFor('zz');
    expect(screen.getByRole('alert')).toBeInTheDocument();

    await searchFor('example');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(resultRows()).toHaveLength(3);
  });
});
