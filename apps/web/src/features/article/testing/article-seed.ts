import type { ArticleDetail } from '../api/article-types';
import { makeDetail } from './article-fixtures';

// Ba bài đủ ba trạng thái cho test danh sách: id 2 (nháp, cập nhật mới nhất), id 1 (đã xuất bản), id 3 (lưu trữ, cũ nhất)
export function makeSeed(): ArticleDetail[] {
  return [
    makeDetail({
      baiVietId: '1',
      tieuDe: 'Sốt xuất huyết',
      trangThai: 'DaXuatBan',
      thoiDiemXuatBan: '2026-11-20T03:00:00.000Z',
      capNhatLanCuoi: '2026-11-21T03:00:00.000Z',
      hashtag: ['sốt', 'trẻ-em'],
      noiDung: 'Nội dung bài một.',
    }),
    makeDetail({
      baiVietId: '2',
      tieuDe: 'Tiểu đường',
      trangThai: 'BanNhap',
      capNhatLanCuoi: '2026-11-22T03:00:00.000Z',
      hashtag: ['trẻ-em'],
      noiDung: 'Nội dung bài hai.',
    }),
    makeDetail({
      baiVietId: '3',
      tieuDe: 'Tim mạch',
      trangThai: 'LuuTruAn',
      thoiDiemXuatBan: '2026-11-10T03:00:00.000Z',
      capNhatLanCuoi: '2026-11-19T03:00:00.000Z',
      hashtag: [],
      noiDung: 'Nội dung bài ba.',
    }),
  ];
}

// `count` bài nháp có tiêu đề "Bài n" (n từ 1), cập nhật giảm dần theo n: để dựng nhiều trang
export function makeMany(count: number): ArticleDetail[] {
  return Array.from({ length: count }, (_, index) =>
    makeDetail({
      baiVietId: String(index + 1),
      tieuDe: `Bài ${index + 1}`,
      capNhatLanCuoi: new Date(
        Date.UTC(2026, 10, 27, 3, 0) - index * 60_000,
      ).toISOString(),
      noiDung: `Nội dung ${index + 1}`,
    }),
  );
}
