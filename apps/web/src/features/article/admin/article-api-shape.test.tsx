import { fireEvent, screen, within } from '@testing-library/react';
import { errorMessageFor } from '../../../shared/api/error-message';
import { UnexpectedResponseError } from '../../../shared/api/errors';
import {
  makeDetail,
  makeListItem,
  makeListPage,
} from '../testing/article-fixtures';
import { createFakeArticleApi } from '../testing/fake-article-api';
import { renderArticlePages } from '../testing/render-article-pages';

// article F1, ABW-12 (phần trang): máy chủ trả thân SAI HÌNH DẠNG (thiếu khoá cần) ⇒ trang hiện ErrorState kèm "Thử lại", KHÔNG trắng trang, không văng lỗi chưa bắt.
// Đi qua lớp HTTP thật (`httpArticleApi` + `fetch` giả) để chứng minh cả chuỗi: kiểm hình dạng ⇒ lỗi ⇒ giao diện. Hợp đồng gọi đúng ở `api/article-api.test.ts`.
const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('thân phản hồi sai hình dạng (ABW-12)', () => {
  it.each([
    [
      'items không phải mảng',
      {
        items: 'x',
        total: 1,
        page: 1,
        pageSize: 20,
        demTheoTrangThai: { BanNhap: 0, DaXuatBan: 0, LuuTruAn: 0 },
      },
    ],
    ['thiếu demTheoTrangThai', { items: [], total: 0, page: 1, pageSize: 20 }],
    [
      'dòng có trangThai lạ',
      makeListPage([{ ...makeListItem(), trangThai: 'XoaMem' } as never]),
    ],
    ['không phải đối tượng', 'chuỗi lạ'],
  ])(
    'ABW-12 danh sách: %s ⇒ ErrorState kèm "Thử lại", không bảng, không trắng trang; "Thử lại" gọi lại và hiện bảng khi thân đúng',
    async (_label, body) => {
      fetchMock.mockImplementationOnce(async () => json(body));
      fetchMock.mockImplementation(async () =>
        json(
          makeListPage([makeListItem({ baiVietId: '1', tieuDe: 'Bài đúng' })]),
        ),
      );
      renderArticlePages();

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(
        errorMessageFor(new UnexpectedResponseError(200)),
      );
      expect(screen.queryByRole('table')).toBeNull();
      expect(
        screen.getByRole('heading', { level: 1, name: 'Bài viết' }),
      ).toBeVisible();
      expect(screen.getByRole('link', { name: 'Viết bài mới' })).toBeVisible();

      fireEvent.click(within(alert).getByRole('button', { name: 'Thử lại' }));

      expect(
        await screen.findByRole('table', { name: 'Danh sách bài viết' }),
      ).toBeVisible();
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.getByText(/Bài đúng/)).toBeVisible();
    },
  );

  it('ABW-12 trang sửa: chi tiết thiếu noiDung ⇒ ErrorState kèm "Thử lại", không biểu mẫu nửa vời', async () => {
    fetchMock.mockImplementationOnce(async () =>
      json({ ...makeDetail({ baiVietId: '7' }), noiDung: undefined }),
    );
    fetchMock.mockImplementation(async () =>
      json(makeDetail({ baiVietId: '7', tieuDe: 'Bài đủ khoá' })),
    );
    renderArticlePages({ path: '/admin/bai-viet/7' });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      errorMessageFor(new UnexpectedResponseError(200)),
    );
    expect(screen.queryByLabelText('Tiêu đề')).toBeNull();

    fireEvent.click(within(alert).getByRole('button', { name: 'Thử lại' }));

    expect(
      await screen.findByRole('heading', { name: 'Sửa bài viết' }),
    ).toBeVisible();
    expect(screen.getByLabelText('Tiêu đề')).toHaveValue('Bài đủ khoá');
  });

  it('ABW-12 trang sửa: đường dẫn đúng /api/admin/articles/:id qua lớp HTTP thật; mã sai dạng không gọi gì', async () => {
    fetchMock.mockImplementation(async () =>
      json(makeDetail({ baiVietId: '7' })),
    );
    renderArticlePages({ path: '/admin/bai-viet/7' });
    await screen.findByRole('heading', { name: 'Sửa bài viết' });
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/admin/articles/7');

    fetchMock.mockClear();
    renderArticlePages({ path: '/admin/bai-viet/7abc' });
    expect(
      await screen.findAllByRole('heading', {
        name: 'Không tìm thấy bài viết',
      }),
    ).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ABW-12 máy chủ 404 KHONG_TIM_THAY khi tải bài ⇒ "Không tìm thấy bài viết" (không ErrorState)', async () => {
    fetchMock.mockImplementation(async () =>
      json({ maLoi: 'KHONG_TIM_THAY', thongBao: 'câu của API' }, 404),
    );
    renderArticlePages({ path: '/admin/bai-viet/7' });

    expect(
      await screen.findByRole('heading', { name: 'Không tìm thấy bài viết' }),
    ).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('ABW-12 đối chứng dương: bản giả đúng hợp đồng thì trang dựng bình thường', async () => {
    renderArticlePages({
      api: createFakeArticleApi([
        makeDetail({ baiVietId: '1', tieuDe: 'Bài giả' }),
      ]),
    });

    expect(
      await screen.findByRole('table', { name: 'Danh sách bài viết' }),
    ).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
