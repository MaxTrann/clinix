import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { escapeLikePattern } from '../../common/paging/like-pattern.js';

// SQL của thẻ (`hashtag`) và dòng nối bài-thẻ (`bai_viet_hashtag`) (article B1; PLAN article 5.6, T5, T6). Mọi giá trị đi qua tham số `?`.
// Thẻ tạo bằng `INSERT … ON DUPLICATE KEY UPDATE hashtag_id = LAST_INSERT_ID(hashtag_id)`: UNIQUE của `ten` chặn hai yêu cầu cùng tạo một thẻ (người đến sau chờ khoá rồi dùng lại dòng sẵn có).
// Nơi gọi PHẢI sắp thẻ theo một thứ tự cố định trước khi gọi (`sortHashtags`) để hai yêu cầu không khoá chéo nhau (ABT-06).

/** Một thẻ sau khi tìm hay tạo: `ten` là tên ĐANG LƯU (có thể khác `requested` nếu trùng theo collation nhưng khác dấu, T6). */
export interface ResolvedTag {
  hashtagId: string;
  requested: string;
  ten: string;
  active: boolean;
}

const UPSERT_SQL =
  'INSERT INTO hashtag (ten) VALUES (?) ON DUPLICATE KEY UPDATE hashtag_id = LAST_INSERT_ID(hashtag_id)';
const LAST_ID_SQL = 'SELECT CAST(LAST_INSERT_ID() AS CHAR) AS id';
const READ_BACK_SQL =
  'SELECT CAST(hashtag_id AS CHAR) AS hashtagId, ten, trang_thai_hoat_dong AS hoatDong FROM hashtag WHERE hashtag_id IN (?)';
const ATTACHED_SQL =
  'SELECT CAST(hashtag_id AS CHAR) AS hashtagId FROM bai_viet_hashtag WHERE bai_viet_id = ?';
const ATTACH_SQL =
  'INSERT INTO bai_viet_hashtag (bai_viet_id, hashtag_id) VALUES (?, ?)';
const DETACH_SQL =
  'DELETE FROM bai_viet_hashtag WHERE bai_viet_id = ? AND hashtag_id = ?';
// Gợi ý: tiền tố, không phân biệt hoa thường và dấu theo collation của cột, chỉ thẻ đang hoạt động
const SUGGEST_SQL =
  "SELECT ten FROM hashtag WHERE trang_thai_hoat_dong = 1 AND ten LIKE ? ESCAPE '!' ORDER BY ten, hashtag_id LIMIT ?";
const SUGGEST_ALL_SQL =
  'SELECT ten FROM hashtag WHERE trang_thai_hoat_dong = 1 ORDER BY ten, hashtag_id LIMIT ?';

@Injectable()
export class HashtagRepository {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  /**
   * Tìm hay tạo từng thẻ THEO ĐÚNG THỨ TỰ `names` (đã sắp), rồi đọc về tên và trạng thái đang lưu. Trả danh sách cùng thứ tự `names`.
   * Phải gọi trong giao dịch ghi: `LAST_INSERT_ID()` tính theo kết nối. Không tự bật lại thẻ tắt (T6): nơi gọi quyết định.
   */
  async resolve(
    manager: EntityManager,
    names: readonly string[],
  ): Promise<ResolvedTag[]> {
    const ids: string[] = [];
    for (const name of names) {
      await manager.query(UPSERT_SQL, [name]);
      const rows: { id: string }[] = await manager.query(LAST_ID_SQL);
      ids.push(rows[0]!.id);
    }
    if (ids.length === 0) return [];
    const stored: {
      hashtagId: string;
      ten: string;
      hoatDong: number | boolean;
    }[] = await manager.query(READ_BACK_SQL, [ids]);
    const byId = new Map(stored.map((row) => [row.hashtagId, row]));
    return names.map((requested, index) => {
      const hashtagId = ids[index]!;
      const row = byId.get(hashtagId);
      return {
        hashtagId,
        requested,
        ten: row?.ten ?? requested,
        active: Number(row?.hoatDong ?? 0) === 1,
      };
    });
  }

  /** Mã các thẻ đang gắn với bài. */
  async attachedIds(
    manager: EntityManager,
    articleId: string,
  ): Promise<string[]> {
    const rows: { hashtagId: string }[] = await manager.query(ATTACHED_SQL, [
      articleId,
    ]);
    return rows.map((row) => row.hashtagId);
  }

  /** Gắn thẻ vào bài theo thứ tự đưa vào. */
  async attach(
    manager: EntityManager,
    articleId: string,
    hashtagIds: readonly string[],
  ): Promise<void> {
    for (const hashtagId of hashtagIds)
      await manager.query(ATTACH_SQL, [articleId, hashtagId]);
  }

  /** Gỡ thẻ khỏi bài: chỉ xoá dòng nối, KHÔNG xoá thẻ (MH8). */
  async detach(
    manager: EntityManager,
    articleId: string,
    hashtagIds: readonly string[],
  ): Promise<void> {
    for (const hashtagId of hashtagIds)
      await manager.query(DETACH_SQL, [articleId, hashtagId]);
  }

  /** Gợi ý thẻ khi gõ (ngoài giao dịch, chỉ đọc). `prefix` rỗng = không lọc tiền tố. */
  async suggest(prefix: string, limit: number): Promise<string[]> {
    const rows: { ten: string }[] =
      prefix === ''
        ? await this.db.query(SUGGEST_ALL_SQL, [limit])
        : await this.db.query(SUGGEST_SQL, [
            `${escapeLikePattern(prefix)}%`,
            limit,
          ]);
    return rows.map((row) => row.ten);
  }
}
