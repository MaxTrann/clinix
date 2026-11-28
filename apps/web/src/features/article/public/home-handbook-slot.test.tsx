import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { emptyPublicHomeResponse } from '../../../test/empty-public-home-response';
import { resetAuthForTest } from '../../auth/auth-session';
import { setAuthState } from '../../auth/auth-store';
import { HomePage } from '../../search';
import { makePublicItem, makePublicPage } from '../testing/article-fixtures';
import { HomeHandbookSection } from './home-handbook-section';

// article F2, ABG-10 (phần khe): `HomePage` nhận MỘT khe `handbookSlot` tuỳ chọn, đặt ngay trước khối "Đặt lịch khám tại CLINIX" (PLAN article T13). Không truyền khe ⇒ trang chủ
// không có khối nào về cẩm nang và KHÔNG gọi API bài viết (ca `TCH-02` của search giữ nguyên). Dùng `HomePage` thật qua `features/search/index.ts` và `fetch` giả đúng hợp đồng.
const fetchMock = vi.fn<typeof fetch>();
let articleResponse: () => Response;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

beforeEach(() => {
  resetAuthForTest();
  setAuthState({ status: 'unauthenticated' });
  window.localStorage.clear();
  articleResponse = () =>
    json(
      makePublicPage(
        [
          makePublicItem({ baiVietId: '1', tieuDe: 'Bài một' }),
          makePublicItem({ baiVietId: '2', tieuDe: 'Bài hai' }),
        ],
        { pageSize: 4 },
      ),
    );
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input) => {
    const url = String(input);
    if (url.startsWith('/api/public/articles')) return articleResponse();
    return emptyPublicHomeResponse(url) ?? json({ items: [] });
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  resetAuthForTest();
  vi.unstubAllGlobals();
});

const articleCalls = () =>
  fetchMock.mock.calls.filter(([input]) =>
    String(input).startsWith('/api/public/articles'),
  );

function renderHome(withSlot: boolean) {
  return render(
    <MemoryRouter>
      <HomePage handbookSlot={withSlot ? <HomeHandbookSection /> : undefined} />
    </MemoryRouter>,
  );
}

describe('HomePage với khe handbookSlot (ABG-10)', () => {
  it('ABG-10 có khe ⇒ khối "Cẩm nang sức khỏe" nằm SAU "Đội ngũ bác sĩ" và TRƯỚC "Đặt lịch khám tại CLINIX"', async () => {
    renderHome(true);
    const handbook = await screen.findByRole('region', {
      name: 'Cẩm nang sức khỏe',
    });
    const doctors = screen.getByRole('region', { name: 'Đội ngũ bác sĩ' });
    const process = screen.getByRole('region', {
      name: 'Đặt lịch khám tại CLINIX',
    });

    expect(doctors.compareDocumentPosition(handbook)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(handbook.compareDocumentPosition(process)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(within(handbook).getAllByRole('heading', { level: 3 })).toHaveLength(
      2,
    );
    expect(
      within(handbook).getByRole('link', { name: 'Xem tất cả' }),
    ).toHaveAttribute('href', '/cam-nang');
    expect(articleCalls()).toHaveLength(1);
  });

  it('ABG-10 KHÔNG truyền khe ⇒ không có tiêu đề "Cẩm nang" và KHÔNG gọi API bài viết (như `TCH-02`)', async () => {
    renderHome(false);
    await screen.findByRole('region', { name: 'Đặt lịch khám tại CLINIX' });
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(2));

    expect(screen.queryByRole('heading', { name: /Cẩm nang/ })).toBeNull();
    expect(articleCalls()).toHaveLength(0);
  });

  it.each([
    [
      'lỗi máy chủ 500',
      () => json({ maLoi: 'LOI_HE_THONG', thongBao: 'x' }, 500),
    ],
    ['thân sai dạng', () => json({ tenThuongHieu: 'CLINIX' })],
    ['rỗng', () => json(makePublicPage([], { pageSize: 4 }))],
  ])(
    'ABG-10 có khe nhưng bài viết %s ⇒ trang chủ vẫn đủ các khối khác, KHÔNG có tiêu đề "Cẩm nang" và không báo lỗi',
    async (_name, response) => {
      articleResponse = response;
      renderHome(true);

      await screen.findByRole('region', { name: 'Đặt lịch khám tại CLINIX' });
      await waitFor(() => expect(articleCalls()).toHaveLength(1));
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(screen.queryByRole('heading', { name: /Cẩm nang/ })).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
      expect(
        screen.getByRole('region', { name: 'Đội ngũ bác sĩ' }),
      ).toBeVisible();
    },
  );
});
