import type {
  ArticleDetail,
  ArticleListItem,
  ArticleListPage,
  ArticleStatusCounts,
  PublicArticleDetail,
  PublicArticleItem,
  PublicArticlePage,
} from '../api/article-types';

// Dữ liệu giả đúng hợp đồng PLAN article 5.7 (không phải của ai). Chỉ dùng trong test.
export function makeDetail(
  overrides: Partial<ArticleDetail> = {},
): ArticleDetail {
  return {
    baiVietId: '1',
    tieuDe: 'Phòng ngừa sốt xuất huyết',
    moTaNgan: 'Cách phòng ngừa sốt xuất huyết tại nhà.',
    trangThai: 'BanNhap',
    thoiDiemXuatBan: null,
    thoiDiemTao: '2026-11-27T03:00:00.000Z',
    capNhatLanCuoi: '2026-11-27T03:00:00.000Z',
    tacGia: { taiKhoanId: '1', hoTen: 'Quản trị viên mẫu' },
    hashtag: ['sốt-xuất-huyết'],
    anhDaiDien: null,
    noiDung: 'Diệt muỗi và lăng quăng.',
    ...overrides,
  };
}

// Dòng của danh sách: như chi tiết nhưng KHÔNG có `noiDung`
export function toListItem(detail: ArticleDetail): ArticleListItem {
  const { noiDung, ...item } = detail;
  void noiDung;
  return { ...item, hashtag: [...item.hashtag] };
}

export function makeListItem(
  overrides: Partial<ArticleListItem> = {},
): ArticleListItem {
  return toListItem(makeDetail(overrides));
}

export function countByStatus(
  items: readonly { trangThai: keyof ArticleStatusCounts }[],
): ArticleStatusCounts {
  const counts: ArticleStatusCounts = {
    BanNhap: 0,
    DaXuatBan: 0,
    LuuTruAn: 0,
  };
  for (const item of items) counts[item.trangThai] += 1;
  return counts;
}

export function makeListPage(
  items: ArticleListItem[],
  overrides: Partial<ArticleListPage> = {},
): ArticleListPage {
  return {
    items,
    total: items.length,
    page: 1,
    pageSize: 20,
    demTheoTrangThai: countByStatus(items),
    ...overrides,
  };
}

// ----- Công khai (article F2): API công khai chỉ trả bài ĐÃ XUẤT BẢN, không có tác giả, không có trạng thái -----
export function makePublished(
  overrides: Partial<ArticleDetail> = {},
): ArticleDetail {
  return makeDetail({
    trangThai: 'DaXuatBan',
    thoiDiemXuatBan: '2026-11-28T03:00:00.000Z',
    ...overrides,
  });
}

// Đúng 6 khoá của danh sách công khai (hợp đồng B2)
export function toPublicItem(detail: ArticleDetail): PublicArticleItem {
  return {
    baiVietId: detail.baiVietId,
    tieuDe: detail.tieuDe,
    moTaNgan: detail.moTaNgan,
    anhDaiDien: detail.anhDaiDien,
    thoiDiemXuatBan: detail.thoiDiemXuatBan,
    hashtag: [...detail.hashtag],
  };
}

export function toPublicDetail(detail: ArticleDetail): PublicArticleDetail {
  return { ...toPublicItem(detail), noiDung: detail.noiDung };
}

export function makePublicItem(
  overrides: Partial<PublicArticleItem> = {},
): PublicArticleItem {
  return toPublicItem(makePublished(overrides));
}

export function makePublicPage(
  items: PublicArticleItem[],
  overrides: Partial<PublicArticlePage> = {},
): PublicArticlePage {
  return {
    items,
    total: items.length,
    page: 1,
    pageSize: 9,
    ...overrides,
  };
}

// `count` bài đã xuất bản "Bài n" (n từ 1); bài 1 xuất bản MỚI nhất (thời điểm giảm dần theo n) nên thứ tự công khai là 1, 2, 3…
export function makeManyPublished(count: number): ArticleDetail[] {
  return Array.from({ length: count }, (_, index) =>
    makePublished({
      baiVietId: String(index + 1),
      tieuDe: `Bài ${index + 1}`,
      thoiDiemXuatBan: new Date(
        Date.UTC(2026, 10, 28, 3, 0) - index * 60_000,
      ).toISOString(),
      noiDung: `Nội dung ${index + 1}`,
      hashtag: [],
    }),
  );
}
