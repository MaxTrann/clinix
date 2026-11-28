import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import {
  readRatingCounts,
  type RatingTotals,
} from '../common/rating-counts.js';
import type { LoaiDanhGiaBaiViet } from '../entities/enums.js';

// SQL của API đánh giá bài viết (article B3; PLAN article 5.7, 5.10, T11, T12). Mọi giá trị đi qua tham số `?`; các câu SQL cố định là hằng UPPER_SNAKE_CASE.
// Ghi (`PUT`, `DELETE`) chạy trong MỘT giao dịch READ COMMITTED (nếp `ArticleAdminRepository`): khoá hàng bài bằng `FOR SHARE` (chỉ khi `DaXuatBan`) → ghi hay xoá phiếu → đếm.
// `FOR SHARE` là thứ chặn "phiếu ghi SAU khi bài đã bị ẩn" (ABR-07): Quản trị viên đổi trạng thái bằng `FOR UPDATE` nên phải chờ mọi giao dịch đánh giá đang chạy, còn nếu ẩn xong trước thì câu khoá
// không còn dòng nào (404, không ghi gì). Nhiều Bệnh nhân đánh giá cùng bài thì S + S tương thích, không chặn nhau.
// Chỉ mục dùng sẵn (không thêm): khoá chính `bai_viet`; khoá chính kép `(benh_nhan_id, bai_viet_id)` của phiếu; `benh_nhan_danh_gia_bai_viet_index_24 (bai_viet_id, loai)` cho câu đếm (xem `common/rating-counts.ts`).

// Khoá hàng bài ĐÃ XUẤT BẢN (T11): không có dòng ⇒ bài không tồn tại, `BanNhap` hay `LuuTruAn` (cùng một kết quả, không ghi gì).
const LOCK_PUBLISHED_SQL =
  "SELECT bai_viet_id FROM bai_viet WHERE bai_viet_id = ? AND trang_thai = 'DaXuatBan' FOR SHARE";
// Đặt hoặc đổi loại: MỘT dòng cho mỗi (Bệnh nhân, bài). `VALUES(loai)` đã deprecated từ MySQL 8.0.20 nhưng chạy ở 8.4; chấp nhận theo T11 và tiền lệ `admin/branches/branch.repository.ts`.
const UPSERT_RATING_SQL =
  'INSERT INTO benh_nhan_danh_gia_bai_viet (benh_nhan_id, bai_viet_id, loai) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE loai = VALUES(loai)';
// Thu hồi: chỉ phiếu CỦA CHÍNH người gọi; không có phiếu thì xoá 0 dòng (vẫn thành công)
const DELETE_RATING_SQL =
  'DELETE FROM benh_nhan_danh_gia_bai_viet WHERE benh_nhan_id = ? AND bai_viet_id = ?';
// Phiếu của CHÍNH mình kèm kiểm bài đã xuất bản, MỘT câu (một ảnh chụp, không cần giao dịch): không có dòng ⇒ bài không công khai; `loai` NULL ⇒ chưa đánh giá.
const OWN_RATING_SQL =
  "SELECT d.loai AS loai FROM bai_viet b LEFT JOIN benh_nhan_danh_gia_bai_viet d ON d.bai_viet_id = b.bai_viet_id AND d.benh_nhan_id = ? WHERE b.bai_viet_id = ? AND b.trang_thai = 'DaXuatBan'";

@Injectable()
export class PatientRatingRepository {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  /** Giao dịch ghi phiếu, READ COMMITTED: ít khoá khoảng hơn; khoá chính kép mới là thứ chặn trùng khi hai tab của cùng một người đua nhau (ABR-08). */
  transaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.db.transaction('READ COMMITTED', work);
  }

  /** Khoá hàng bài (`FOR SHARE`); `true` nếu bài đang `DaXuatBan`. Phải gọi trong giao dịch ghi và TRƯỚC mọi câu ghi (ABR-07). */
  async lockPublished(
    manager: EntityManager,
    articleId: string,
  ): Promise<boolean> {
    const rows: unknown[] = await manager.query(LOCK_PUBLISHED_SQL, [
      articleId,
    ]);
    return rows.length > 0;
  }

  /** Đặt hay đổi loại phiếu của `patientId` (từ token) cho bài `articleId`. */
  async upsert(
    manager: EntityManager,
    patientId: string,
    articleId: string,
    loai: LoaiDanhGiaBaiViet,
  ): Promise<void> {
    await manager.query(UPSERT_RATING_SQL, [patientId, articleId, loai]);
  }

  /** Xoá phiếu của `patientId` cho bài `articleId` (không có thì không làm gì). */
  async remove(
    manager: EntityManager,
    patientId: string,
    articleId: string,
  ): Promise<void> {
    await manager.query(DELETE_RATING_SQL, [patientId, articleId]);
  }

  /** Số Thích và Không thích hiện tại của bài, đọc bằng chính kết nối của giao dịch ghi (thấy phiếu vừa ghi). */
  counts(manager: EntityManager, articleId: string): Promise<RatingTotals> {
    return readRatingCounts(manager, articleId);
  }

  /** Phiếu của `patientId` cho bài đã xuất bản `articleId`: `null` nếu bài không công khai (không tồn tại, `BanNhap`, `LuuTruAn`); `{ loai: null }` nếu chưa đánh giá. */
  async readOwn(
    patientId: string,
    articleId: string,
  ): Promise<{ loai: LoaiDanhGiaBaiViet | null } | null> {
    const rows: { loai: LoaiDanhGiaBaiViet | null }[] = await this.db.query(
      OWN_RATING_SQL,
      [patientId, articleId],
    );
    const row = rows[0];
    return row ? { loai: row.loai } : null;
  }
}
