import type { EntityManager } from 'typeorm';
import type { LoaiDanhGiaBaiViet } from '../entities/enums.js';

// Số đếm Thích / Không thích của MỘT bài (article B3; PLAN article 5.7, 5.10, T11). Dùng chung cho chi tiết công khai (cùng `runReadOnly` với câu chi tiết) và cho `PUT`, `DELETE`
// (cùng giao dịch ghi, nên thấy phiếu vừa ghi). Đếm theo `(bai_viet_id, loai)`: chỉ mục phủ `benh_nhan_danh_gia_bai_viet_index_24`, không quét bảng. Chỉ ĐỌC.

/** Tổng lượt của một bài; loại không có phiếu nào thì 0. */
export interface RatingTotals {
  luotThich: number;
  luotKhongThich: number;
}

const RATING_COUNTS_SQL =
  'SELECT loai, COUNT(*) AS soLuot FROM benh_nhan_danh_gia_bai_viet WHERE bai_viet_id = ? GROUP BY loai';

/** Số Thích và Không thích của bài `baiVietId`, tính ở máy chủ bằng `manager` của người gọi (cùng ảnh chụp hay cùng giao dịch). Số dòng trả về là `string | number` tuỳ driver nên ép bằng `Number`. */
export async function readRatingCounts(
  manager: EntityManager,
  baiVietId: string,
): Promise<RatingTotals> {
  const rows: { loai: LoaiDanhGiaBaiViet; soLuot: string | number }[] =
    await manager.query(RATING_COUNTS_SQL, [baiVietId]);
  const totals: RatingTotals = { luotThich: 0, luotKhongThich: 0 };
  for (const row of rows) {
    if (row.loai === 'Thich') totals.luotThich = Number(row.soLuot);
    else if (row.loai === 'KhongThich')
      totals.luotKhongThich = Number(row.soLuot);
  }
  return totals;
}
