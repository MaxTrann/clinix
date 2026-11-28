import { QueryFailedError, type DataSource, type EntityManager } from 'typeorm';
import type { AppException } from '../../common/errors/app.exception.js';
import { ARTICLE_TABLES } from '../article.constants.js';
import type {
  LoaiDanhGiaBaiViet,
  TrangThaiBaiViet,
} from '../entities/enums.js';

// Dụng cụ cho test của article (int-spec và e2e): chèn dữ liệu bằng SQL thuần, đếm bốn bảng, đọc dòng thô, và bộ chờ khoá cho các ca cổng.
// Gom ở một nơi để các test không chép lại cùng một khối (CI có kiểm trùng lặp jscpd, ngưỡng 3 phần trăm).

export interface ArticleSeed {
  tacGiaId: string;
  tieuDe?: string;
  moTaNgan?: string | null;
  noiDung?: string;
  trangThai?: TrangThaiBaiViet;
  thoiDiemXuatBan?: Date | null;
  thoiDiemTao?: Date;
  capNhatLanCuoi?: Date;
}

export interface RawArticleRow {
  baiVietId: string;
  tacGiaId: string;
  tieuDe: string;
  moTaNgan: string | null;
  noiDung: string;
  trangThai: TrangThaiBaiViet;
  /** Chuỗi `YYYY-MM-DD HH:MM:SS` theo múi giờ phiên MySQL (+07:00), không đi qua múi giờ của tiến trình Node. */
  thoiDiemXuatBan: string | null;
  thoiDiemTao: string;
  capNhatLanCuoi: string;
}

const DEFAULT_AT = new Date('2026-11-02T01:00:00.000Z');
const FORMAT = (column: string): string =>
  `DATE_FORMAT(${column}, '%Y-%m-%d %H:%i:%s')`;

export class ArticleFixtures {
  constructor(private readonly db: DataSource | EntityManager) {}

  /** Chèn một bài; trả id (chuỗi). Thời điểm mặc định là 08:00 ngày 02/11/2026 giờ Việt Nam. */
  async article(seed: ArticleSeed): Promise<string> {
    const result: { insertId: number | string } = await this.db.query(
      `INSERT INTO bai_viet (tac_gia_id, tieu_de, mo_ta_ngan, noi_dung, trang_thai, thoi_diem_xuat_ban, thoi_diem_tao, cap_nhat_lan_cuoi)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        seed.tacGiaId,
        seed.tieuDe ?? 'Bài viết mẫu',
        seed.moTaNgan ?? null,
        seed.noiDung ?? 'Nội dung mẫu',
        seed.trangThai ?? 'BanNhap',
        seed.thoiDiemXuatBan ?? null,
        seed.thoiDiemTao ?? DEFAULT_AT,
        seed.capNhatLanCuoi ?? DEFAULT_AT,
      ],
    );
    return String(result.insertId);
  }

  async hashtag(ten: string, hoatDong = true): Promise<string> {
    const result: { insertId: number | string } = await this.db.query(
      'INSERT INTO hashtag (ten, trang_thai_hoat_dong) VALUES (?, ?)',
      [ten, hoatDong],
    );
    return String(result.insertId);
  }

  async attach(baiVietId: string, hashtagId: string): Promise<void> {
    await this.db.query(
      'INSERT INTO bai_viet_hashtag (bai_viet_id, hashtag_id) VALUES (?, ?)',
      [baiVietId, hashtagId],
    );
  }

  async rating(
    benhNhanId: string,
    baiVietId: string,
    loai: LoaiDanhGiaBaiViet = 'Thich',
  ): Promise<void> {
    await this.db.query(
      'INSERT INTO benh_nhan_danh_gia_bai_viet (benh_nhan_id, bai_viet_id, loai) VALUES (?, ?, ?)',
      [benhNhanId, baiVietId, loai],
    );
  }

  /** Số dòng của từng bảng trong bốn bảng của article. */
  async rowCounts(): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const table of ARTICLE_TABLES) {
      const rows: { n: string | number }[] = await this.db.query(
        `SELECT COUNT(*) AS n FROM \`${table}\``,
      );
      counts[table] = Number(rows[0]?.n ?? 0);
    }
    return counts;
  }

  /** Dòng thô của một bài (thời điểm đã định dạng ở phía MySQL); `undefined` nếu không có. */
  async articleRow(id: string): Promise<RawArticleRow | undefined> {
    const rows: RawArticleRow[] = await this.db.query(
      `SELECT CAST(bai_viet_id AS CHAR) AS baiVietId, CAST(tac_gia_id AS CHAR) AS tacGiaId, tieu_de AS tieuDe, mo_ta_ngan AS moTaNgan, noi_dung AS noiDung,
              trang_thai AS trangThai, ${FORMAT('thoi_diem_xuat_ban')} AS thoiDiemXuatBan, ${FORMAT('thoi_diem_tao')} AS thoiDiemTao,
              ${FORMAT('cap_nhat_lan_cuoi')} AS capNhatLanCuoi
         FROM bai_viet WHERE bai_viet_id = ?`,
      [id],
    );
    return rows[0];
  }

  /** Dòng thô của bài có tiêu đề đã cho (test chỉ dùng tiêu đề không trùng); báo lỗi nếu không có. */
  async articleRowByTitle(tieuDe: string): Promise<RawArticleRow> {
    const rows: { id: string }[] = await this.db.query(
      'SELECT CAST(bai_viet_id AS CHAR) AS id FROM bai_viet WHERE tieu_de = ?',
      [tieuDe],
    );
    const row = rows[0] ? await this.articleRow(rows[0].id) : undefined;
    if (!row) throw new Error(`Không có bài "${tieuDe}"`);
    return row;
  }

  /** Mã của thẻ có tên chính xác đã cho (đã có sẵn); báo lỗi nếu không có. */
  async hashtagId(ten: string): Promise<string> {
    const rows: { id: string }[] = await this.db.query(
      'SELECT CAST(hashtag_id AS CHAR) AS id FROM hashtag WHERE ten = ?',
      [ten],
    );
    if (!rows[0]) throw new Error(`Không có thẻ "${ten}"`);
    return rows[0].id;
  }

  /** Tên các thẻ đang gắn với bài, sắp theo tên. */
  async tagNamesOf(baiVietId: string): Promise<string[]> {
    const rows: { ten: string }[] = await this.db.query(
      `SELECT h.ten FROM bai_viet_hashtag bh JOIN hashtag h ON h.hashtag_id = bh.hashtag_id WHERE bh.bai_viet_id = ? ORDER BY h.ten`,
      [baiVietId],
    );
    return rows.map((row) => row.ten);
  }

  /** Mọi thẻ trong bảng `hashtag` (tên và cờ hoạt động), sắp theo tên. */
  async allHashtags(): Promise<{ ten: string; hoatDong: boolean }[]> {
    const rows: { ten: string; hoatDong: number }[] = await this.db.query(
      'SELECT ten, trang_thai_hoat_dong AS hoatDong FROM hashtag ORDER BY ten',
    );
    return rows.map((row) => ({
      ten: row.ten,
      hoatDong: Number(row.hoatDong) === 1,
    }));
  }
}

/** Mã lỗi (errno) của MySQL mà câu lệnh bị từ chối; chạy thành công thì làm test đỏ. 1062 trùng khoá, 1452 thiếu cha, 1451 còn con, 1406 quá dài, 1265 ENUM sai. */
export async function mysqlErrno(work: Promise<unknown>): Promise<number> {
  const error: unknown = await work.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(error, 'câu lệnh phải bị MySQL từ chối').toBeInstanceOf(
    QueryFailedError,
  );
  return (error as QueryFailedError & { driverError: { errno: number } })
    .driverError.errno;
}

/** Lỗi `AppException` mà `work` ném ra; không ném thì làm test đỏ. */
export async function rejection(work: Promise<unknown>): Promise<AppException> {
  const error: unknown = await work.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(error, 'phải bị từ chối').toBeDefined();
  return error as AppException;
}

/**
 * Đợi cho tới khi có MỘT câu lệnh khớp `infoLike` (mẫu LIKE trên nội dung câu) đã chạy ít nhất 1 giây trong `PROCESSLIST`: câu thường chỉ mất vài ms nên chạy quá 1 giây nghĩa là nó đang BỊ CHẶN bởi khoá.
 * Dùng cho ca cổng khi giao dịch chờ khoá KHÔNG hiện là `LOCK WAIT` ở `innodb_trx`: đo thật ở article B1 (28/11/2026), `INSERT … ON DUPLICATE KEY UPDATE` của B chờ hàng thẻ vừa chèn chưa commit của A
 * ở trạng thái `update` trong PROCESSLIST hơn 5 giây mà `innodb_trx` chỉ liệt kê giao dịch của A. Bài học: hạn chót trong dụng cụ test dùng `performance.now()` vì các test int giả `Date` (`Date.now()` đứng yên thì vòng chờ không bao giờ hết hạn).
 */
export async function waitForBlockedStatement(
  db: DataSource,
  infoLike: string,
  timeoutMs = 8000,
): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  for (;;) {
    const rows: { n: string | number }[] = await db.query(
      'SELECT COUNT(*) AS n FROM information_schema.PROCESSLIST WHERE COMMAND = ? AND TIME >= 1 AND INFO LIKE ?',
      ['Query', infoLike],
    );
    if (Number(rows[0]?.n ?? 0) > 0) return;
    if (performance.now() > deadline) {
      const processes = await db.query(
        'SELECT ID AS id, COMMAND AS command, TIME AS time, STATE AS state, LEFT(INFO, 120) AS info FROM information_schema.PROCESSLIST',
      );
      throw new Error(
        `Không thấy câu lệnh "${infoLike}" bị chặn (ca cổng hỏng); processlist: ${JSON.stringify(processes)}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/**
 * Đợi giao dịch giữ cổng (`work`) tới cổng, có hạn chót THẬT. Nếu `work` kết thúc (xong hay lỗi) trước khi tới cổng thì báo ngay thay vì chờ mãi;
 * `work` lỗi thì ném đúng lỗi đó (để thấy nguyên nhân thật).
 */
export async function waitUntilReached(
  gate: { reached: Promise<void> },
  work: Promise<unknown>,
  timeoutMs = 5000,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(`Giao dịch giữ cổng không tới cổng sau ${timeoutMs} ms`),
        ),
      timeoutMs,
    );
  });
  const finishedEarly = work.then(() => {
    throw new Error('Giao dịch giữ cổng đã xong mà chưa tới cổng');
  });
  try {
    await Promise.race([gate.reached, timeout, finishedEarly]);
  } finally {
    clearTimeout(timer);
  }
}

/** Cổng một lần: `opened` chờ cho tới khi `open()` được gọi; `reached` báo giao dịch giữ cổng đã tới chỗ chờ. */
export function createGate(): {
  opened: Promise<void>;
  open: () => void;
  reached: Promise<void>;
  markReached: () => void;
} {
  let open!: () => void;
  let markReached!: () => void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  const reached = new Promise<void>((resolve) => {
    markReached = resolve;
  });
  return { opened, open, reached, markReached };
}
