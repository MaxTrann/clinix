import type { Paged } from '../../common/paging/paged.js';
import { toCents } from '../../pricing/money.js';
import type { DoctorFilters, DoctorSort } from './doctor-filter.parser.js';
import type { PublicDoctorItem } from './public-doctor.dto.js';

/** Lọc theo giá/điểm, sắp xếp và cắt trang trong bộ nhớ (PLAN 5.4). Hàm thuần, không đọc DB. */
export interface DoctorListWindow {
  page: number;
  pageSize: number;
}

/** Điểm "4.5" ⇒ 45 (phần mười) để so sánh bằng số nguyên; `null` = chưa có đánh giá. */
function ratingTenths(item: PublicDoctorItem): number | null {
  const value = item.danhGia.diemTrungBinh;
  return value === null ? null : Math.round(Number(value) * 10);
}

function compareBigint(a: bigint, b: bigint): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Khoá cuối ổn định: số năm kinh nghiệm giảm dần → họ tên → id (Q12). */
function byDefault(a: PublicDoctorItem, b: PublicDoctorItem): number {
  return (
    b.soNamKinhNghiem - a.soNamKinhNghiem ||
    a.hoTen.localeCompare(b.hoTen, 'vi') ||
    compareBigint(BigInt(a.bacSiId), BigInt(b.bacSiId))
  );
}

const COMPARATORS: Record<
  DoctorSort,
  (a: PublicDoctorItem, b: PublicDoctorItem) => number
> = {
  kinhNghiem: byDefault,
  giaTangDan: (a, b) =>
    compareBigint(toCents(a.gia.giaKham), toCents(b.gia.giaKham)) ||
    byDefault(a, b),
  // Điểm cao trước; chưa có đánh giá xếp cuối; rồi nhiều lượt hơn trước.
  danhGiaCao: (a, b) =>
    (ratingTenths(b) ?? -1) - (ratingTenths(a) ?? -1) ||
    b.danhGia.soDanhGia - a.danhGia.soDanhGia ||
    byDefault(a, b),
};

export function filterSortPage(
  items: readonly PublicDoctorItem[],
  filters: Pick<
    DoctorFilters,
    'giaTuCents' | 'giaDenCents' | 'diemTuTenths' | 'sapXep'
  >,
  window: DoctorListWindow,
): Paged<PublicDoctorItem> {
  const { giaTuCents, giaDenCents, diemTuTenths } = filters;
  const matched = items.filter((item) => {
    const price = toCents(item.gia.giaKham);
    // Khoảng đóng ở cả hai đầu (Q12).
    if (giaTuCents !== null && price < giaTuCents) return false;
    if (giaDenCents !== null && price > giaDenCents) return false;
    if (diemTuTenths !== null) {
      const tenths = ratingTenths(item);
      // Chưa có đánh giá bị loại khi có `diemTu` (Q12).
      if (tenths === null || tenths < diemTuTenths) return false;
    }
    return true;
  });
  matched.sort(COMPARATORS[filters.sapXep]);
  const start = (window.page - 1) * window.pageSize;
  return {
    items: matched.slice(start, start + window.pageSize),
    total: matched.length,
    page: window.page,
    pageSize: window.pageSize,
  };
}
