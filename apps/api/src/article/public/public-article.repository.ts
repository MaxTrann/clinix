import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { escapeLikePattern } from '../../common/paging/like-pattern.js';
import { runReadOnly } from '../../common/transaction/read-only-tx.js';

// SQL của API công khai bài viết (article B2; PLAN article 5.7, 5.10, T19). CHỈ ĐỌC: mỗi lời gọi chạy trong MỘT `runReadOnly` (REPEATABLE READ, READ ONLY) nên `total` khớp `items`
// và mọi câu ghi lọt vào đây bị MySQL từ chối (ABP-09). Mọi giá trị đi qua tham số `?`; các mảnh SQL cố định là hằng UPPER_SNAKE_CASE.
// Danh sách KHÔNG đọc cột `noi_dung` (cột `text` lớn, ABP-10); chi tiết đọc nguyên một dòng. Chỉ bài `DaXuatBan` và chỉ thẻ đang hoạt động.
// Hiệu năng (suy từ DDL, CHƯA ĐO; PLAN 5.10): `bai_viet` chưa có chỉ mục theo `trang_thai` hay `thoi_diem_xuat_ban` nên danh sách quét toàn bảng rồi sắp; `LIKE '%…%'` cũng quét toàn bảng;
// `total` quét thêm một lần. Nếu X1 đo không đạt thì NÊU chỉ mục `bai_viet (trang_thai, thoi_diem_xuat_ban)` và hỏi Đại, không tự thêm.

/** Một bài ở danh sách (không có nội dung). `thoiDiemXuatBan` là `Date` do driver; null chỉ khi dữ liệu lệch (ABP-12). */
export interface PublicArticleRow {
  baiVietId: string;
  tieuDe: string;
  moTaNgan: string | null;
  anhDaiDien: string | null;
  thoiDiemXuatBan: Date | null;
}

export interface PublicArticleDetailRow extends PublicArticleRow {
  noiDung: string;
}

export interface PublicListFilter {
  /** Từ khoá khớp tiêu đề (đã trim và NFC; rỗng hay vắng = không lọc). */
  q?: string;
  /** Một thẻ đã chuẩn hoá. */
  the?: string;
  limit: number;
  offset: number;
}

export interface PublicListResult {
  rows: PublicArticleRow[];
  total: number;
  /** Thẻ đang hoạt động của các bài trong trang, sắp theo tên. */
  tags: Map<string, string[]>;
}

export interface PublicTagRow {
  ten: string;
  soBai: number;
}

// Điều kiện chỉ bài đã xuất bản (cố định, không chứa giá trị người dùng)
const PUBLISHED = "b.trang_thai = 'DaXuatBan'";
const COND_TITLE = "b.tieu_de LIKE ? ESCAPE '!'";
const COND_TAG =
  'EXISTS (SELECT 1 FROM bai_viet_hashtag bh JOIN hashtag h ON h.hashtag_id = bh.hashtag_id WHERE bh.bai_viet_id = b.bai_viet_id AND h.ten = ? AND h.trang_thai_hoat_dong = 1)';

const COLUMNS = `CAST(b.bai_viet_id AS CHAR) AS baiVietId, b.tieu_de AS tieuDe, b.mo_ta_ngan AS moTaNgan, b.anh_dai_dien AS anhDaiDien, b.thoi_diem_xuat_ban AS thoiDiemXuatBan`;
// Danh sách: KHÔNG có `b.noi_dung`. NULL của `thoi_diem_xuat_ban` đứng CUỐI với DESC (MySQL), hoà thì id giảm (ABP-12).
const LIST_SQL = `SELECT ${COLUMNS} FROM bai_viet b`;
const ORDER_PAGE =
  'ORDER BY b.thoi_diem_xuat_ban DESC, b.bai_viet_id DESC LIMIT ? OFFSET ?';
const COUNT_SQL = 'SELECT COUNT(*) AS total FROM bai_viet b';
const DETAIL_SQL = `SELECT ${COLUMNS}, b.noi_dung AS noiDung FROM bai_viet b WHERE b.bai_viet_id = ? AND ${PUBLISHED}`;
const TAGS_OF_ARTICLES_SQL =
  'SELECT CAST(bh.bai_viet_id AS CHAR) AS baiVietId, h.ten AS ten FROM bai_viet_hashtag bh JOIN hashtag h ON h.hashtag_id = bh.hashtag_id WHERE bh.bai_viet_id IN (?) AND h.trang_thai_hoat_dong = 1 ORDER BY h.ten, h.hashtag_id';
// Thẻ phổ biến: chỉ đếm bài đã xuất bản; thẻ tắt và thẻ hết bài không hiện. `soBai` giảm dần rồi tên (theo collation của cột).
const POPULAR_TAGS_SQL = `SELECT h.ten AS ten, COUNT(*) AS soBai FROM bai_viet_hashtag bh JOIN hashtag h ON h.hashtag_id = bh.hashtag_id AND h.trang_thai_hoat_dong = 1 JOIN bai_viet b ON b.bai_viet_id = bh.bai_viet_id AND ${PUBLISHED} GROUP BY h.hashtag_id, h.ten ORDER BY soBai DESC, h.ten ASC, h.hashtag_id ASC LIMIT ?`;

@Injectable()
export class PublicArticleRepository {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  /** Một trang danh sách, tổng và thẻ của trang trong MỘT giao dịch chỉ đọc (cùng một ảnh chụp: `total` khớp `items`). */
  async list(filter: PublicListFilter): Promise<PublicListResult> {
    const conditions: string[] = [PUBLISHED];
    const params: unknown[] = [];
    if (filter.q) {
      conditions.push(COND_TITLE);
      params.push(`%${escapeLikePattern(filter.q)}%`);
    }
    if (filter.the) {
      conditions.push(COND_TAG);
      params.push(filter.the);
    }
    const where = `WHERE ${conditions.join(' AND ')}`;
    return runReadOnly(this.db, async (manager) => {
      const rows: PublicArticleRow[] = await manager.query(
        `${LIST_SQL} ${where} ${ORDER_PAGE}`,
        [...params, filter.limit, filter.offset],
      );
      const totals: { total: string | number }[] = await manager.query(
        `${COUNT_SQL} ${where}`,
        params,
      );
      const tags = await this.tagsOf(
        manager,
        rows.map((row) => row.baiVietId),
      );
      return { rows, total: Number(totals[0]?.total ?? 0), tags };
    });
  }

  /** Chi tiết một bài ĐÃ XUẤT BẢN kèm nội dung và thẻ hoạt động; `null` nếu không có hay chưa/không còn xuất bản. */
  async detail(
    id: string,
  ): Promise<{ row: PublicArticleDetailRow; tags: string[] } | null> {
    return runReadOnly(this.db, async (manager) => {
      const rows: PublicArticleDetailRow[] = await manager.query(DETAIL_SQL, [
        id,
      ]);
      const row = rows[0];
      if (!row) return null;
      const tags = await this.tagsOf(manager, [row.baiVietId]);
      return { row, tags: tags.get(row.baiVietId) ?? [] };
    });
  }

  /** Tối đa `limit` thẻ có bài đã xuất bản, nhiều bài nhất trước. */
  async popularTags(limit: number): Promise<PublicTagRow[]> {
    return runReadOnly(this.db, async (manager) => {
      const rows: { ten: string; soBai: string | number }[] =
        await manager.query(POPULAR_TAGS_SQL, [limit]);
      return rows.map((row) => ({ ten: row.ten, soBai: Number(row.soBai) }));
    });
  }

  /** Thẻ hoạt động của các bài đã cho (một câu, không N+1), mỗi bài sắp theo tên thẻ. */
  private async tagsOf(
    manager: EntityManager,
    articleIds: readonly string[],
  ): Promise<Map<string, string[]>> {
    const tags = new Map<string, string[]>();
    if (articleIds.length === 0) return tags;
    const rows: { baiVietId: string; ten: string }[] = await manager.query(
      TAGS_OF_ARTICLES_SQL,
      [articleIds],
    );
    for (const row of rows) {
      const list = tags.get(row.baiVietId) ?? [];
      list.push(row.ten);
      tags.set(row.baiVietId, list);
    }
    return tags;
  }
}
