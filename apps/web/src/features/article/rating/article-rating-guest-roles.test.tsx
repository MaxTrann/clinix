import { act, fireEvent, screen, within } from '@testing-library/react';
import { LOGIN_PATH } from '../../auth';
import { makePublished } from '../testing/article-fixtures';
import { createFakeArticleApi } from '../testing/fake-article-api';
import { renderPublicPages } from '../testing/render-public-pages';
import {
  findEnabledButton,
  resetSession,
  setUnknownSession,
  signIn,
  signOutAsGuest,
} from '../testing/rating-session';

// article F3: khối "Bài viết có ích không?" ở chế độ KHÁCH (ABU-01), vai khác Bệnh nhân (ABU-05) và lúc phiên chưa rõ. Dựng trong trang chi tiết thật,
// bản giả API làm đúng hợp đồng B3 (khách 401, vai khác 403) nên lời gọi ghi lỡ gửi đi sẽ lộ ra ở `calls` và ở lỗi.
const PATH = '/cam-nang/12-sot-xuat-huyet';
const GROUP = 'Bài viết có ích không?';

function setup() {
  const api = createFakeArticleApi([
    makePublished({
      baiVietId: '12',
      tieuDe: 'Sốt xuất huyết',
      noiDung: 'Diệt muỗi.',
    }),
  ]);
  api.seedRatings('12', { thich: 5, khongThich: 2 });
  return api;
}

const findGroup = () => screen.findByRole('group', { name: GROUP });
const ratingCalls = (api: ReturnType<typeof setup>) =>
  (['getMyRating', 'setRating', 'clearRating'] as const).map(
    (method) => api.callsTo(method).length,
  );

beforeEach(() => resetSession());

describe('khối đánh giá: khách (ABU-01)', () => {
  it('ABU-01 khách bấm Thích ⇒ lời nhắc "Đăng nhập để đánh giá" là liên kết tới LOGIN_PATH; KHÔNG gọi API; số đếm và nút không đổi', async () => {
    const api = setup();
    signOutAsGuest(api);
    renderPublicPages({ api, path: PATH });

    const like = await screen.findByRole('button', { name: 'Thích (5)' });
    const dislike = screen.getByRole('button', { name: 'Không thích (2)' });
    expect(like).toHaveAttribute('aria-pressed', 'false');
    expect(dislike).toHaveAttribute('aria-pressed', 'false');
    // Nút của khách KHÔNG bị vô hiệu im lặng
    expect(like).not.toHaveAttribute('aria-disabled', 'true');
    expect(dislike).not.toHaveAttribute('aria-disabled', 'true');
    expect(
      screen.queryByRole('link', { name: 'Đăng nhập để đánh giá' }),
    ).toBeNull();

    fireEvent.click(like);

    const link = screen.getByRole('link', { name: 'Đăng nhập để đánh giá' });
    expect(link).toHaveAttribute('href', LOGIN_PATH);
    expect(ratingCalls(api)).toEqual([0, 0, 0]);
    expect(api.ratingRows('12')).toBe(7);
    expect(like).toHaveAttribute('aria-pressed', 'false');
    expect(
      screen.getByRole('button', { name: 'Thích (5)' }),
    ).toBeInTheDocument();
  });

  it('ABU-01 khách bấm Không thích ⇒ cùng lời nhắc, không gọi API; bấm nhiều lần vẫn MỘT lời nhắc', async () => {
    const api = setup();
    signOutAsGuest(api);
    renderPublicPages({ api, path: PATH });

    const dislike = await screen.findByRole('button', {
      name: 'Không thích (2)',
    });
    fireEvent.click(dislike);
    fireEvent.click(dislike);
    fireEvent.click(screen.getByRole('button', { name: 'Thích (5)' }));

    expect(
      screen.getAllByRole('link', { name: 'Đăng nhập để đánh giá' }),
    ).toHaveLength(1);
    expect(ratingCalls(api)).toEqual([0, 0, 0]);
  });

  it('ABU-01 lời nhắc nằm TRONG nhóm "Bài viết có ích không?" và có vùng bấm 44 px', async () => {
    const api = setup();
    signOutAsGuest(api);
    renderPublicPages({ api, path: PATH });

    fireEvent.click(await screen.findByRole('button', { name: 'Thích (5)' }));
    const group = await findGroup();
    const link = within(group).getByRole('link', {
      name: 'Đăng nhập để đánh giá',
    });
    expect(link.className).toContain('min-h-[44px]');
  });

  it('ABU-01 (âm) bản giả từ chối khách như máy chủ: nếu web lỡ gọi API ghi thì nhận 401, không ai ghi được phiếu', async () => {
    const api = setup();
    signOutAsGuest(api);
    await expect(api.setRating('12', 'Thich')).rejects.toMatchObject({
      status: 401,
    });
    expect(api.ratingRows('12')).toBe(7);
  });

  it('ABU-01 khách xem bài: KHÔNG gọi GET phiếu của mình', async () => {
    const api = setup();
    signOutAsGuest(api);
    renderPublicPages({ api, path: PATH });
    await findGroup();
    await act(async () => {});
    expect(ratingCalls(api)).toEqual([0, 0, 0]);
  });
});

describe('khối đánh giá: vai khác Bệnh nhân (ABU-05)', () => {
  it.each(['BacSi', 'LeTan', 'QuanTriVien'] as const)(
    'ABU-05 vai %s chỉ thấy số đếm: không nút, không liên kết, không gọi API',
    async (vaiTro) => {
      const api = setup();
      signIn(api, vaiTro, 'nv-1');
      renderPublicPages({ api, path: PATH });

      const group = await findGroup();
      expect(within(group).getByText('5 lượt Thích')).toBeInTheDocument();
      expect(within(group).getByText('2 lượt Không thích')).toBeInTheDocument();
      expect(within(group).queryAllByRole('button')).toHaveLength(0);
      expect(within(group).queryByRole('link')).toBeNull();
      await act(async () => {});
      expect(ratingCalls(api)).toEqual([0, 0, 0]);
    },
  );

  it('ABU-05 (âm) bản giả từ chối vai khác như máy chủ (403): nếu web lỡ gọi thì phiếu không được ghi', async () => {
    const api = setup();
    signIn(api, 'BacSi', 'nv-1');
    await expect(api.setRating('12', 'Thich')).rejects.toMatchObject({
      status: 403,
    });
    expect(api.ratingRows('12')).toBe(7);
  });
});

describe('khối đánh giá: lúc phiên chưa rõ (Q1)', () => {
  it.each(['checking', 'error'] as const)(
    'ABU-05 phiên %s ⇒ chỉ số đếm, không nút, không gọi API',
    async (status) => {
      const api = setup();
      setUnknownSession(status);
      renderPublicPages({ api, path: PATH });

      const group = await findGroup();
      expect(within(group).getByText('5 lượt Thích')).toBeInTheDocument();
      expect(within(group).queryAllByRole('button')).toHaveLength(0);
      await act(async () => {});
      expect(ratingCalls(api)).toEqual([0, 0, 0]);
    },
  );

  it('ABU-05 phiên rõ là khách ⇒ nút hiện ra sau (số đếm giữ nguyên, không gọi API)', async () => {
    const api = setup();
    setUnknownSession('checking');
    renderPublicPages({ api, path: PATH });
    const group = await findGroup();
    expect(within(group).queryAllByRole('button')).toHaveLength(0);

    act(() => signOutAsGuest(api));

    expect(
      await screen.findByRole('button', { name: 'Thích (5)' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('5 lượt Thích')).toBeNull();
    expect(ratingCalls(api)).toEqual([0, 0, 0]);
  });

  it('ABU-05 phiên rõ là Bệnh nhân ⇒ chỉ LÚC ĐÓ mới gọi GET phiếu (đúng một lần, đúng bài 12) rồi nút dùng được', async () => {
    const api = setup();
    setUnknownSession('checking');
    renderPublicPages({ api, path: PATH });
    await findGroup();
    await act(async () => {});
    expect(api.callsTo('getMyRating')).toHaveLength(0);

    act(() => signIn(api));

    await findEnabledButton('Thích (5)');
    expect(api.callsTo('getMyRating')).toHaveLength(1);
    expect(api.callsTo('getMyRating')[0].args[0]).toBe('12');
  });

  it('ABU-05 Bệnh nhân đăng xuất giữa chừng ⇒ khối chuyển sang chế độ khách, trang không trắng', async () => {
    const api = setup();
    signIn(api);
    renderPublicPages({ api, path: PATH });
    await findEnabledButton('Thích (5)');

    act(() => signOutAsGuest(api));

    expect(
      screen.getByRole('heading', { level: 1, name: 'Sốt xuất huyết' }),
    ).toBeInTheDocument();
    const like = screen.getByRole('button', { name: 'Thích (5)' });
    expect(like).not.toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(like);
    expect(
      screen.getByRole('link', { name: 'Đăng nhập để đánh giá' }),
    ).toHaveAttribute('href', LOGIN_PATH);
    expect(api.callsTo('setRating')).toHaveLength(0);
  });
});
