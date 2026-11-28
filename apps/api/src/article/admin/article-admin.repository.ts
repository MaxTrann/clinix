import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { escapeLikePattern } from '../../common/paging/like-pattern.js';
import { runReadOnly } from '../../common/transaction/read-only-tx.js';
import type { TrangThaiBaiViet } from '../entities/enums.js';

// SQL của bài viết cho API quản trị (article B1; PLAN article 5.2, 5.7, T5, T19, T20). Mọi giá trị đi qua tham số `?`; các mảnh SQL cố định là hằng UPPER_SNAKE_CASE.
// Danh sách KHÔNG đọc cột `noi_dung` (cột `text` lớn); chi tiết đọc nguyên một dòng. `bai_viet` chưa có chỉ mục theo trạng thái hay thời điểm (PLAN 5.10): đo ở X1 rồi mới hỏi Đại.

/** Một dòng bài (không có nội dung). Thời điểm là `Date` do driver; service đổi sang chuỗi ISO UTC. */
export interface ArticleRow {
  baiVietId: string;
  tieuDe: string;
  moTaNgan: string | null;
  trangThai: TrangThaiBaiViet;
  thoiDiemXuatBan: Date | null;
  thoiDiemTao: Date;
  capNhatLanCuoi: Date;
  anhDaiDien: string | null;
  tacGiaId: string;
  tacGiaHoTen: string;
}

export interface ArticleDetailRow extends ArticleRow {
  noiDung: string;
}

/** Các cột service cần so khi sửa (đọc kèm khoá `FOR UPDATE`). */
export interface ArticleLockRow {
  trangThai: TrangThaiBaiViet;
  tieuDe: string;
  moTaNgan: string | null;
  noiDung: string;
  thoiDiemXuatBan: Date | null;
}

export interface ArticleListFilter {
  /** Từ khoá khớp tiêu đề (đã trim; rỗng = không lọc). */
  q?: string;
  trangThai?: TrangThaiBaiViet;
  /** Một thẻ đã chuẩn hoá. */
  the?: string;
  limit: number;
  offset: number;
}

export interface ArticleListResult {
  rows: ArticleRow[];
  total: number;
  /** Số bài theo trạng thái, tính trên mọi bộ lọc TRỪ `trangThai` (T20); thiếu khoá nghĩa là 0. */
  counts: Partial<Record<TrangThaiBaiViet, number>>;
  /** Thẻ của các bài trong trang, sắp theo tên. */
  tags: Map<string, string[]>;
}

export interface ArticleInsert {
  tacGiaId: string;
  tieuDe: string;
  moTaNgan: string | null;
  noiDung: string;
  trangThai: TrangThaiBaiViet;
  thoiDiemXuatBan: Date | null;
  /** Đồng hồ ứng dụng (giờ Việt Nam, cắt giây) cho `thoi_diem_tao` và `cap_nhat_lan_cuoi`. */
  stamp: Date;
}

/** Cột đổi của một lần sửa: khoá vắng = không đổi. */
export interface ArticlePatch {
  tieuDe?: string;
  moTaNgan?: string | null;
  noiDung?: string;
  trangThai?: TrangThaiBaiViet;
  thoiDiemXuatBan?: Date | null;
}

const BASE_COLUMNS = `CAST(b.bai_viet_id AS CHAR) AS baiVietId, b.tieu_de AS tieuDe, b.mo_ta_ngan AS moTaNgan, b.trang_thai AS trangThai,
  b.thoi_diem_xuat_ban AS thoiDiemXuatBan, b.thoi_diem_tao AS thoiDiemTao, b.cap_nhat_lan_cuoi AS capNhatLanCuoi, b.anh_dai_dien AS anhDaiDien,
  CAST(b.tac_gia_id AS CHAR) AS tacGiaId, t.ho_ten AS tacGiaHoTen`;
const FROM_ARTICLE =
  'FROM bai_viet b JOIN tai_khoan t ON t.tai_khoan_id = b.tac_gia_id';
// Danh sách: KHÔNG có `b.noi_dung`
const LIST_SQL = `SELECT ${BASE_COLUMNS} ${FROM_ARTICLE}`;
const DETAIL_SQL = `SELECT ${BASE_COLUMNS}, b.noi_dung AS noiDung ${FROM_ARTICLE} WHERE b.bai_viet_id = ?`;
const ORDER_PAGE =
  'ORDER BY b.cap_nhat_lan_cuoi DESC, b.bai_viet_id DESC LIMIT ? OFFSET ?';
const COUNT_SQL = 'SELECT COUNT(*) AS total FROM bai_viet b';
const COUNT_BY_STATUS_SQL =
  'SELECT b.trang_thai AS trangThai, COUNT(*) AS total FROM bai_viet b';
const GROUP_BY_STATUS = 'GROUP BY b.trang_thai';
const TAGS_OF_ARTICLES_SQL =
  'SELECT CAST(bh.bai_viet_id AS CHAR) AS baiVietId, h.ten AS ten FROM bai_viet_hashtag bh JOIN hashtag h ON h.hashtag_id = bh.hashtag_id WHERE bh.bai_viet_id IN (?) ORDER BY h.ten, h.hashtag_id';
const LOCK_SQL =
  'SELECT trang_thai AS trangThai, tieu_de AS tieuDe, mo_ta_ngan AS moTaNgan, noi_dung AS noiDung, thoi_diem_xuat_ban AS thoiDiemXuatBan FROM bai_viet WHERE bai_viet_id = ? FOR UPDATE';
const INSERT_SQL =
  'INSERT INTO bai_viet (tac_gia_id, tieu_de, mo_ta_ngan, noi_dung, trang_thai, thoi_diem_xuat_ban, thoi_diem_tao, cap_nhat_lan_cuoi) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
const LAST_ID_SQL = 'SELECT CAST(LAST_INSERT_ID() AS CHAR) AS id';
// `cap_nhat_lan_cuoi` luôn do đồng hồ ứng dụng đặt (đồng hồ giả được); các mảnh cột đổi nối vào sau, mỗi mảnh là hằng cố định
const UPDATE_HEAD = 'UPDATE bai_viet SET cap_nhat_lan_cuoi = ?';
const UPDATE_TAIL = 'WHERE bai_viet_id = ?';
const SET_FRAGMENTS = {
  tieuDe: ', tieu_de = ?',
  moTaNgan: ', mo_ta_ngan = ?',
  noiDung: ', noi_dung = ?',
  trangThai: ', trang_thai = ?',
  thoiDiemXuatBan: ', thoi_diem_xuat_ban = ?',
} as const;
// Mệnh đề lọc của danh sách (cố định; giá trị đi qua tham số)
const COND_TITLE = "b.tieu_de LIKE ? ESCAPE '!'";
const COND_TAG =
  'EXISTS (SELECT 1 FROM bai_viet_hashtag bh JOIN hashtag h ON h.hashtag_id = bh.hashtag_id WHERE bh.bai_viet_id = b.bai_viet_id AND h.ten = ?)';
const COND_STATUS = 'b.trang_thai = ?';

const whereOf = (conditions: readonly string[]): string =>
  conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

@Injectable()
export class ArticleAdminRepository {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  /**
   * Giao dịch ghi bài và thẻ, READ COMMITTED (nếp `SpecialtyRepository`): ít khoá khoảng hơn, UNIQUE của `hashtag.ten` mới là thứ chặn thẻ trùng khi chạy đua;
   * hàng bài được khoá bằng `FOR UPDATE` (T5).
   */
  transaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.db.transaction('READ COMMITTED', work);
  }

  /** Một trang danh sách, tổng và số bài theo trạng thái trong MỘT giao dịch chỉ đọc (cùng một ảnh chụp: `total` khớp `items`). */
  async list(filter: ArticleListFilter): Promise<ArticleListResult> {
    const base: string[] = [];
    const baseParams: unknown[] = [];
    if (filter.q) {
      base.push(COND_TITLE);
      baseParams.push(`%${escapeLikePattern(filter.q)}%`);
    }
    if (filter.the) {
      base.push(COND_TAG);
      baseParams.push(filter.the);
    }
    const all = [...base];
    const allParams = [...baseParams];
    if (filter.trangThai) {
      all.push(COND_STATUS);
      allParams.push(filter.trangThai);
    }
    const whereAll = whereOf(all);
    const whereBase = whereOf(base);
    return runReadOnly(this.db, async (manager) => {
      const rows: ArticleRow[] = await manager.query(
        `${LIST_SQL} ${whereAll} ${ORDER_PAGE}`,
        [...allParams, filter.limit, filter.offset],
      );
      const totals: { total: string | number }[] = await manager.query(
        `${COUNT_SQL} ${whereAll}`,
        allParams,
      );
      const byStatus: {
        trangThai: TrangThaiBaiViet;
        total: string | number;
      }[] = await manager.query(
        `${COUNT_BY_STATUS_SQL} ${whereBase} ${GROUP_BY_STATUS}`,
        baseParams,
      );
      const tags = await this.tagsOf(
        manager,
        rows.map((row) => row.baiVietId),
      );
      const counts: ArticleListResult['counts'] = {};
      for (const item of byStatus) counts[item.trangThai] = Number(item.total);
      return {
        rows,
        total: Number(totals[0]?.total ?? 0),
        counts,
        tags,
      };
    });
  }

  /** Thẻ của các bài đã cho (một câu, không N+1), mỗi bài sắp theo tên thẻ. */
  async tagsOf(
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

  /** Chi tiết một bài kèm nội dung và thẻ; `null` nếu không có. Dùng được cả trong giao dịch ghi (truyền `manager`). */
  async get(
    id: string,
    manager: EntityManager = this.db.manager,
  ): Promise<{ row: ArticleDetailRow; tags: string[] } | null> {
    const rows: ArticleDetailRow[] = await manager.query(DETAIL_SQL, [id]);
    const row = rows[0];
    if (!row) return null;
    const tags = await this.tagsOf(manager, [row.baiVietId]);
    return { row, tags: tags.get(row.baiVietId) ?? [] };
  }

  /** Khoá hàng bài (`FOR UPDATE`) và đọc các cột cần so; `null` nếu không có bài. Phải gọi trong giao dịch ghi. */
  async lock(
    manager: EntityManager,
    id: string,
  ): Promise<ArticleLockRow | null> {
    const rows: ArticleLockRow[] = await manager.query(LOCK_SQL, [id]);
    return rows[0] ?? null;
  }

  /** Chèn bài mới; trả id (chuỗi). `LAST_INSERT_ID()` tính theo KẾT NỐI nên phải gọi trong giao dịch. */
  async insert(manager: EntityManager, input: ArticleInsert): Promise<string> {
    await manager.query(INSERT_SQL, [
      input.tacGiaId,
      input.tieuDe,
      input.moTaNgan,
      input.noiDung,
      input.trangThai,
      input.thoiDiemXuatBan,
      input.stamp,
      input.stamp,
    ]);
    const ids: { id: string }[] = await manager.query(LAST_ID_SQL);
    return ids[0]!.id;
  }

  /** Cập nhật các cột đổi và `cap_nhat_lan_cuoi` (đồng hồ ứng dụng). Không có cột nào đổi thì chỉ chạm `cap_nhat_lan_cuoi` (dùng khi chỉ đổi thẻ). */
  async update(
    manager: EntityManager,
    id: string,
    patch: ArticlePatch,
    stamp: Date,
  ): Promise<void> {
    const fragments: string[] = [];
    const params: unknown[] = [stamp];
    for (const key of Object.keys(SET_FRAGMENTS) as (keyof ArticlePatch)[]) {
      if (patch[key] === undefined) continue;
      fragments.push(SET_FRAGMENTS[key]);
      params.push(patch[key]);
    }
    await manager.query(`${UPDATE_HEAD}${fragments.join('')} ${UPDATE_TAIL}`, [
      ...params,
      id,
    ]);
  }
}
