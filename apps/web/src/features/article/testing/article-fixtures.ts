import type {
  ArticleDetail,
  ArticleListItem,
  ArticleListPage,
  ArticleStatusCounts,
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
