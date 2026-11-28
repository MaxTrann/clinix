import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { resetAuthForTest } from '../../auth/auth-session';
import {
  getAuthState,
  setAccessToken,
  setAuthState,
} from '../../auth/auth-store';
import { makePublished, toPublicDetail } from '../testing/article-fixtures';
import { findEnabledButton } from '../testing/rating-session';
import { renderPublicPages } from '../testing/render-public-pages';

// article F3, ABU-11: 401 GIỮA CHỪNG đi qua lớp `request` và `auth-session` THẬT (không bản giả API): token hết hạn lúc bấm. Hai kết cục:
// (1) làm mới THẤT BẠI ⇒ phiên về `unauthenticated` ⇒ khối tự chuyển sang chế độ khách, trang KHÔNG trắng, không báo lỗi toàn trang;
// (2) làm mới THÀNH CÔNG ⇒ lời gọi (idempotent) được gửi lại đúng MỘT lần với token mới và màn hình theo kết quả.
const fetchMock = vi.fn<typeof fetch>();
const PATH = '/cam-nang/12-sot-xuat-huyet';
const DETAIL = toPublicDetail(
  makePublished({
    baiVietId: '12',
    tieuDe: 'Sốt xuất huyết',
    noiDung: 'Diệt muỗi.',
  }),
  { luotThich: 5, luotKhongThich: 2 },
);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
const error = (maLoi: string, status: number) =>
  json({ maLoi, thongBao: maLoi }, status);

// Mỗi cặp "PHƯƠNG THỨC đường-dẫn" có một người trả lời; đường lạ ⇒ 500 để test lộ ra ngay
function serve(routes: Record<string, (call: number) => Response>) {
  const counts = new Map<string, number>();
  fetchMock.mockImplementation(async (input, init) => {
    const key = `${init?.method ?? 'GET'} ${new URL(String(input), 'http://localhost').pathname}`;
    const call = (counts.get(key) ?? 0) + 1;
    counts.set(key, call);
    return (routes[key] ?? (() => error('LOI_HE_THONG', 500)))(call);
  });
}

const callsTo = (key: string) =>
  fetchMock.mock.calls.filter(
    ([input, init]) =>
      `${init?.method ?? 'GET'} ${new URL(String(input), 'http://localhost').pathname}` ===
      key,
  );
const authorizationOf = (call: Parameters<typeof fetch>) =>
  new Headers(call[1]?.headers).get('Authorization');

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  resetAuthForTest();
  setAccessToken('old-token');
  setAuthState({
    status: 'authenticated',
    user: { vaiTro: 'BenhNhan', hoTen: 'Bệnh nhân mẫu', daXacMinhEmail: true },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetAuthForTest();
});

describe('khối đánh giá: 401 giữa chừng qua lớp thật (ABU-11)', () => {
  it('ABU-11 token hết hạn lúc bấm, làm mới bị từ chối ⇒ phiên về khách, khối sang chế độ khách; trang vẫn còn; không báo lỗi', async () => {
    serve({
      'GET /api/public/articles/12': () => json(DETAIL),
      'GET /api/patient/articles/12/rating': () => json({ loai: null }),
      'PUT /api/patient/articles/12/rating': () =>
        error('TOKEN_KHONG_HOP_LE', 401),
      'POST /api/auth/refresh': () => error('PHIEN_HET_HIEU_LUC', 401),
    });
    renderPublicPages({ path: PATH });

    fireEvent.click(await findEnabledButton('Thích (5)'));

    await waitFor(() => expect(getAuthState().status).toBe('unauthenticated'));
    expect(
      screen.getByRole('heading', { level: 1, name: 'Sốt xuất huyết' }),
    ).toBeInTheDocument();
    const group = screen.getByRole('group', { name: 'Bài viết có ích không?' });
    expect(within(group).queryByRole('alert')).toBeNull();
    // Chế độ khách: nút không bị khoá; bấm thì ra lời nhắc đăng nhập và KHÔNG gọi API ghi nữa
    const like = within(group).getByRole('button', { name: 'Thích (5)' });
    expect(like).not.toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(like);
    expect(
      within(group).getByRole('link', { name: 'Đăng nhập để đánh giá' }),
    ).toHaveAttribute('href', '/dang-nhap');
    expect(callsTo('PUT /api/patient/articles/12/rating')).toHaveLength(1);
    expect(callsTo('POST /api/auth/refresh')).toHaveLength(1);
  });

  it('ABU-11 token hết hạn, làm mới THÀNH CÔNG ⇒ PUT được gửi lại đúng MỘT lần với token mới; màn hình theo kết quả; PUT đầu mang token cũ', async () => {
    serve({
      'GET /api/public/articles/12': () => json(DETAIL),
      'GET /api/patient/articles/12/rating': () => json({ loai: null }),
      'PUT /api/patient/articles/12/rating': (call) =>
        call === 1
          ? error('TOKEN_KHONG_HOP_LE', 401)
          : json({ loai: 'Thich', luotThich: 6, luotKhongThich: 2 }),
      'POST /api/auth/refresh': () => json({ accessToken: 'new-token' }),
    });
    renderPublicPages({ path: PATH });

    fireEvent.click(await findEnabledButton('Thích (5)'));

    await screen.findByRole('button', { name: 'Thích (6)', pressed: true });
    const puts = callsTo('PUT /api/patient/articles/12/rating');
    expect(puts).toHaveLength(2);
    expect(authorizationOf(puts[0] as Parameters<typeof fetch>)).toBe(
      'Bearer old-token',
    );
    expect(authorizationOf(puts[1] as Parameters<typeof fetch>)).toBe(
      'Bearer new-token',
    );
    expect(callsTo('POST /api/auth/refresh')).toHaveLength(1);
    expect(getAuthState().status).toBe('authenticated');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('ABU-11 GET phiếu và PUT mang Authorization; chi tiết công khai KHÔNG mang (route của khách)', async () => {
    serve({
      'GET /api/public/articles/12': () => json(DETAIL),
      'GET /api/patient/articles/12/rating': () => json({ loai: 'Thich' }),
    });
    renderPublicPages({ path: PATH });

    await findEnabledButton('Thích (5)', true);

    const detail = callsTo('GET /api/public/articles/12');
    const mine = callsTo('GET /api/patient/articles/12/rating');
    expect(detail).toHaveLength(1);
    expect(mine).toHaveLength(1);
    expect(authorizationOf(detail[0] as Parameters<typeof fetch>)).toBeNull();
    expect(authorizationOf(mine[0] as Parameters<typeof fetch>)).toBe(
      'Bearer old-token',
    );
  });

  it('ABU-11 vai khác Bệnh nhân (Bác sĩ) mở bài qua lớp thật ⇒ chỉ số đếm và KHÔNG có lời gọi nào tới patient/…', async () => {
    setAuthState({
      status: 'authenticated',
      user: { vaiTro: 'BacSi', hoTen: 'Bác sĩ mẫu', daXacMinhEmail: true },
    });
    serve({ 'GET /api/public/articles/12': () => json(DETAIL) });
    renderPublicPages({ path: PATH });

    const group = await screen.findByRole('group', {
      name: 'Bài viết có ích không?',
    });
    expect(within(group).getByText('5 lượt Thích')).toBeInTheDocument();
    expect(within(group).queryAllByRole('button')).toHaveLength(0);
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        String(input).includes('/patient/'),
      ),
    ).toHaveLength(0);
  });
});
