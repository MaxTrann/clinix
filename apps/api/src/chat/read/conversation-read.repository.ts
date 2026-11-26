import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { ChucDanhBacSi } from '../../admin/entities/enums.js';
import type { LookupPatterns } from '../../patient/validation/keyword-policy.js';
import type { ChatActor } from '../core/chat-access.policy.js';
import type { LoaiHoiThoai } from '../entities/enums.js';
import { HAS_VISITED_EXISTS } from './relationship.query.js';

// Câu ĐỌC của chat (chat B2; PLAN chat 5.6, 5.9; số đo X1 M1 đến M3 ở TRACKING mục 6). Mọi giá trị đi qua `?` (HCH-02): câu được GHÉP từ các đoạn HẰNG
// bằng `join`, không nội suy biến. Luồng ghi duy nhất ở đây là đánh dấu đã đọc (upsert mốc), chạy trong giao dịch của service.
//
// Danh sách làm HAI bước (đúng cách X1 M1 đã đo): (1) chọn trang: id tin cuối của từng hội thoại thấy được bằng truy vấn con `MAX` (đọc qua `tin_nhan_index_28`,
// không quét toàn bảng), sắp giảm dần, con trỏ `HAVING tinCuoiId < ?`; (2) đọc chi tiết đúng các hội thoại của trang (đầu hội thoại và tin cuối).
// Không có cột `hoi_thoai.tin_nhan_cuoi_id` (P2(a) không làm vì M1, M2 đạt).

/** Số tin chưa đọc và số hội thoại chưa đọc đều có trần 100 (web hiện "99+"; PLAN 5.9). */
export const UNREAD_CAP = 100;

// Id tin cuối của hội thoại `h`. IVC-03: mọi hội thoại có ít nhất một tin, nên chỉ `NULL` khi dữ liệu hỏng (bị loại ở HAVING).
const LAST_MESSAGE_ID =
  '(SELECT MAX(t.tin_nhan_id) FROM tin_nhan t WHERE t.hoi_thoai_id = h.hoi_thoai_id)';

// Phạm vi thấy được (PLAN 5.3, cùng luật với `canSee`). Bệnh nhân, Bác sĩ đi từ dòng thành viên của CHÍNH mình (`m`, có mốc đã đọc); Lễ tân đi từ hộp thư chung của
// chi nhánh HIỆN TẠI (`hoi_thoai_index_26`) và nối trái dòng thành viên của chính mình (chưa có dòng ⇒ mốc trống ⇒ mọi tin của người khác là chưa đọc, NBN-09).
const MEMBER_SCOPE = `FROM tai_khoan_hoi_thoai m
JOIN hoi_thoai h ON h.hoi_thoai_id = m.hoi_thoai_id
WHERE m.tai_khoan_id = ?`;
const INBOX_SCOPE = `FROM hoi_thoai h
LEFT JOIN tai_khoan_hoi_thoai m ON m.hoi_thoai_id = h.hoi_thoai_id AND m.tai_khoan_id = ?
WHERE h.loai = 'BenhNhan_LeTan' AND h.chi_nhanh_id = ?`;
const ONLY_DOCTOR = "AND h.loai = 'BenhNhan_BacSi'";
const ONLY_INBOX = "AND h.loai = 'BenhNhan_LeTan'";

// Chưa đọc (công thức của bảng `tai_khoan_hoi_thoai`): tin SAU mốc của chính mình VÀ người gửi khác mình (NBN-10: tin của mình không bao giờ là chưa đọc).
const UNREAD_EXISTS = `AND EXISTS (SELECT 1 FROM tin_nhan u
  WHERE u.hoi_thoai_id = h.hoi_thoai_id AND u.tin_nhan_id > COALESCE(m.tin_nhan_cuoi_da_doc_id, 0) AND u.nguoi_gui_id <> ?)`;

// Tìm theo Bệnh nhân chủ hội thoại (luật từ khoá của tra cứu hồ sơ, patient B6). Họ tên gấp `đ`/`Đ` (REPLACE phân biệt hoa thường nên hai lớp), như patient-lookup.
// Bác sĩ chỉ tìm theo họ tên (Q25, NBN-12); Lễ tân theo họ tên, email, SĐT (2.4.29 b6). Ràng buộc chi nhánh và loại nằm ngay trong câu (PLAN 5.6), không lọc sau.
const SEARCH_NAME = `AND EXISTS (SELECT 1 FROM tai_khoan p WHERE p.tai_khoan_id = h.nguoi_tao_id
  AND REPLACE(REPLACE(p.ho_ten, 'đ', 'd'), 'Đ', 'D') LIKE ? ESCAPE '!')`;
const SEARCH_NAME_EMAIL = `AND EXISTS (SELECT 1 FROM tai_khoan p WHERE p.tai_khoan_id = h.nguoi_tao_id
  AND (REPLACE(REPLACE(p.ho_ten, 'đ', 'd'), 'Đ', 'D') LIKE ? ESCAPE '!' OR p.email LIKE ? ESCAPE '!'))`;
const SEARCH_NAME_EMAIL_PHONE = `AND EXISTS (SELECT 1 FROM tai_khoan p WHERE p.tai_khoan_id = h.nguoi_tao_id
  AND (REPLACE(REPLACE(p.ho_ten, 'đ', 'd'), 'Đ', 'D') LIKE ? ESCAPE '!' OR p.email LIKE ? ESCAPE '!' OR p.so_dien_thoai LIKE ? ESCAPE '!'))`;

const PAGE_HEAD = `SELECT h.hoi_thoai_id AS hoiThoaiId, ${LAST_MESSAGE_ID} AS tinCuoiId`;
const PAGE_HAVING = 'HAVING tinCuoiId IS NOT NULL';
const PAGE_BEFORE = 'AND tinCuoiId < ?';
const PAGE_ORDER = 'ORDER BY tinCuoiId DESC LIMIT ?';

// Số hội thoại có tin chưa đọc, dừng ở 100 (X1 M2: p95 ≤ 13,6 ms ở hộp thư 5.000)
const COUNT_HEAD = 'SELECT COUNT(*) AS n FROM (SELECT h.hoi_thoai_id';
const COUNT_TAIL = 'LIMIT 100) x';

// Đầu hội thoại cho danh sách và chi tiết. Thứ tự `?`: người xem (đếm chưa đọc), người xem (dòng thành viên `m`), danh sách id.
//  - `dm`: thành viên bác sĩ (hội thoại bác sĩ có đúng hai thành viên, IVC-02); hộp thư chung không có.
//  - `laThanhVien`: người xem có dòng thành viên, đưa vào `canSee` (Bệnh nhân, Bác sĩ cần; Lễ tân không cần).
//  - Số tin chưa đọc trần 100 bằng bảng dẫn xuất có `LIMIT` (tham chiếu cột ngoài trong bảng dẫn xuất: MySQL 8.0.14 trở lên).
const HEADER_SQL = `SELECT h.hoi_thoai_id AS hoiThoaiId, h.loai AS loai, h.chi_nhanh_id AS chiNhanhId, cn.ten AS tenChiNhanh,
  h.nguoi_tao_id AS benhNhanId, p.ho_ten AS benhNhanHoTen, p.so_dien_thoai AS benhNhanSoDienThoai, p.trang_thai AS benhNhanTrangThai,
  dm.tai_khoan_id AS bacSiId, d.ho_ten AS bacSiHoTen, d.trang_thai AS bacSiTrangThai, bs.chuc_danh AS bacSiChucDanh,
  m.tai_khoan_id IS NOT NULL AS laThanhVien,
  ${HAS_VISITED_EXISTS} AS daTungKham,
  (SELECT COUNT(*) FROM (SELECT 1 FROM tin_nhan u
     WHERE u.hoi_thoai_id = h.hoi_thoai_id AND u.tin_nhan_id > COALESCE(m.tin_nhan_cuoi_da_doc_id, 0) AND u.nguoi_gui_id <> ?
     LIMIT 100) z) AS soTinChuaDoc
FROM hoi_thoai h
JOIN tai_khoan p ON p.tai_khoan_id = h.nguoi_tao_id
LEFT JOIN chi_nhanh cn ON cn.chi_nhanh_id = h.chi_nhanh_id
LEFT JOIN tai_khoan_hoi_thoai dm ON h.loai = 'BenhNhan_BacSi' AND dm.hoi_thoai_id = h.hoi_thoai_id AND dm.tai_khoan_id <> h.nguoi_tao_id
LEFT JOIN tai_khoan d ON d.tai_khoan_id = dm.tai_khoan_id
LEFT JOIN bac_si bs ON bs.tai_khoan_id = dm.tai_khoan_id
LEFT JOIN tai_khoan_hoi_thoai m ON m.hoi_thoai_id = h.hoi_thoai_id AND m.tai_khoan_id = ?
WHERE h.hoi_thoai_id IN (?)`;

// Cột của một tin kèm người gửi (danh sách trắng ở mapper). Không email, SĐT, ngày sinh của người gửi.
const MESSAGE_COLUMNS = `SELECT t.tin_nhan_id AS tinNhanId, t.hoi_thoai_id AS hoiThoaiId, t.nguoi_gui_id AS nguoiGuiId, t.ma_gui AS maGui,
  t.noi_dung AS noiDung, t.tep_ten_goc AS tepTenGoc, t.tep_loai AS tepLoai, t.tep_dung_luong AS tepDungLuong, t.thoi_diem_gui AS thoiDiemGui,
  s.ho_ten AS hoTen, s.loai_tai_khoan AS loaiTaiKhoan, sb.chuc_danh AS chucDanh`;
const MESSAGE_SENDER = `JOIN tai_khoan s ON s.tai_khoan_id = t.nguoi_gui_id
LEFT JOIN bac_si sb ON sb.tai_khoan_id = t.nguoi_gui_id`;
const LAST_MESSAGES_SQL = `${MESSAGE_COLUMNS}
FROM tin_nhan t
${MESSAGE_SENDER}
WHERE t.tin_nhan_id IN (?)`;

// Tin theo con trỏ (X1 M3). Ở hội thoại rất lớn optimizer tự chọn `range` trên PRIMARY cho `truoc`/`sau`; `FORCE INDEX` giữ đúng chỉ mục
// `(hoi_thoai_id, tin_nhan_id)` (đã đo: p95 1,9 ms, không filesort). Lựa chọn `[đề xuất]` của B2 (TRACKING mục 7), EXPLAIN kiểm ở M3.
const MESSAGE_FROM = `FROM tin_nhan t FORCE INDEX (tin_nhan_index_28)
${MESSAGE_SENDER}
WHERE t.hoi_thoai_id = ?`;
const NEWEST_SQL = `${MESSAGE_COLUMNS}
${MESSAGE_FROM}
ORDER BY t.tin_nhan_id DESC LIMIT ?`;
const BEFORE_SQL = `${MESSAGE_COLUMNS}
${MESSAGE_FROM} AND t.tin_nhan_id < ?
ORDER BY t.tin_nhan_id DESC LIMIT ?`;
const AFTER_SQL = `${MESSAGE_COLUMNS}
${MESSAGE_FROM} AND t.tin_nhan_id > ?
ORDER BY t.tin_nhan_id ASC LIMIT ?`;

// Đánh dấu đã đọc (PLAN 5.4 quy tắc 5): khoá hội thoại FOR SHARE TRƯỚC khi ghi dòng thành viên (cùng thứ tự tầng với gửi: C1 rồi C3).
const SHARE_CONVERSATION_SQL = `SELECT hoi_thoai_id AS hoiThoaiId, loai, chi_nhanh_id AS chiNhanhId, nguoi_tao_id AS nguoiTaoId
  FROM hoi_thoai WHERE hoi_thoai_id = ? FOR SHARE`;
// Quy tắc nghiệp vụ 14 (mục 2): mốc phải là tin CÙNG hội thoại; kiểm ở đây vì khoá ngoại chỉ bắt tin tồn tại (QCH-10)
const MESSAGE_IN_CONVERSATION_SQL =
  'SELECT tin_nhan_id FROM tin_nhan WHERE tin_nhan_id = ? AND hoi_thoai_id = ?';
// Upsert chỉ tiến tới (X1 M7): cột trong COALESCE PHẢI có tiền tố bảng, không thì MySQL 8.4 báo 1052. Chưa có dòng (Lễ tân mở lần đầu) ⇒ chèn mới.
const UPSERT_MARK_SQL = `INSERT INTO tai_khoan_hoi_thoai (tai_khoan_id, hoi_thoai_id, tin_nhan_cuoi_da_doc_id) VALUES (?, ?, ?) AS moi
  ON DUPLICATE KEY UPDATE tin_nhan_cuoi_da_doc_id = GREATEST(COALESCE(tai_khoan_hoi_thoai.tin_nhan_cuoi_da_doc_id, 0), moi.tin_nhan_cuoi_da_doc_id)`;
const READ_MARK_SQL =
  'SELECT tin_nhan_cuoi_da_doc_id AS mocDaDoc FROM tai_khoan_hoi_thoai WHERE tai_khoan_id = ? AND hoi_thoai_id = ?';

/** Bộ lọc danh sách đã kiểm ở service. `loai` chỉ Bệnh nhân dùng; `patterns` có khi có từ khoá. */
export interface ListFilter {
  unreadOnly: boolean;
  loai: LoaiHoiThoai | null;
  patterns: LookupPatterns | null;
  /** Id tin cuối của dòng cuối trang trước. */
  truoc: string | null;
  limit: number;
}

export interface PageRow {
  hoiThoaiId: string;
  tinCuoiId: string;
}

/** Đầu một hội thoại, đã đổi kiểu (BIGINT là chuỗi, cờ là boolean). */
export interface HeaderRow {
  hoiThoaiId: string;
  loai: LoaiHoiThoai;
  chiNhanhId: string | null;
  tenChiNhanh: string | null;
  benhNhanId: string;
  benhNhanHoTen: string;
  benhNhanSoDienThoai: string;
  benhNhanTrangThai: string;
  bacSiId: string | null;
  bacSiHoTen: string | null;
  bacSiTrangThai: string | null;
  bacSiChucDanh: ChucDanhBacSi | null;
  laThanhVien: boolean;
  daTungKham: boolean;
  soTinChuaDoc: number;
}

export interface MessageRow {
  tinNhanId: string;
  hoiThoaiId: string;
  nguoiGuiId: string;
  maGui: string | null;
  noiDung: string;
  tepTenGoc: string | null;
  tepLoai: string | null;
  tepDungLuong: number | null;
  thoiDiemGui: Date;
  hoTen: string;
  loaiTaiKhoan: string;
  chucDanh: ChucDanhBacSi | null;
}

export type MessageCursor =
  | { kind: 'newest' }
  | { kind: 'before'; tinNhanId: string }
  | { kind: 'after'; tinNhanId: string };

export interface SharedConversation {
  hoiThoaiId: string;
  loai: LoaiHoiThoai;
  chiNhanhId: string | null;
  nguoiTaoId: string;
}

/** Ghép câu từ các đoạn HẰNG; tham số đi theo đúng thứ tự đoạn. */
class SqlBuilder {
  private readonly parts: string[] = [];
  readonly params: unknown[] = [];
  add(fragment: string, ...params: unknown[]): this {
    this.parts.push(fragment);
    this.params.push(...params);
    return this;
  }
  get text(): string {
    return this.parts.join('\n');
  }
}

// Giá trị cột từ driver: BIGINT ra chuỗi (bigNumberStrings), INT ra số, chữ ra chuỗi
type Scalar = string | number | bigint;
const str = (value: unknown): string => String(value as Scalar);
const strOrNull = (value: unknown): string | null =>
  value === null || value === undefined ? null : str(value);

@Injectable()
export class ConversationReadRepository {
  /** Bước 1 của danh sách: id hội thoại và id tin cuối của một trang, mới nhất trước. Lấy `limit + 1` dòng để biết còn trang sau. */
  async page(
    em: EntityManager,
    actor: ChatActor,
    filter: ListFilter,
  ): Promise<PageRow[]> {
    const sql = new SqlBuilder().add(PAGE_HEAD);
    this.scope(sql, actor, filter);
    sql.add(PAGE_HAVING);
    if (filter.truoc !== null) sql.add(PAGE_BEFORE, filter.truoc);
    sql.add(PAGE_ORDER, filter.limit + 1);
    const rows = await em.query<{ hoiThoaiId: unknown; tinCuoiId: unknown }[]>(
      sql.text,
      sql.params,
    );
    return rows.map((r) => ({
      hoiThoaiId: str(r.hoiThoaiId),
      tinCuoiId: str(r.tinCuoiId),
    }));
  }

  /** Số hội thoại thấy được có ít nhất một tin chưa đọc, trần 100. */
  async unreadConversations(
    em: EntityManager,
    actor: ChatActor,
  ): Promise<number> {
    const sql = new SqlBuilder().add(COUNT_HEAD);
    this.scope(sql, actor, {
      unreadOnly: true,
      loai: null,
      patterns: null,
      truoc: null,
      limit: UNREAD_CAP,
    });
    sql.add(COUNT_TAIL);
    const rows = await em.query<{ n: unknown }[]>(sql.text, sql.params);
    return Number(rows[0]?.n ?? 0);
  }

  /** Phần FROM và WHERE: phạm vi thấy được của vai trò, rồi loại, chưa đọc, từ khoá. */
  private scope(sql: SqlBuilder, actor: ChatActor, filter: ListFilter): void {
    const viewer = actor.taiKhoanId;
    if (actor.vaiTro === 'LeTan')
      sql.add(INBOX_SCOPE, viewer, actor.chiNhanhId);
    else sql.add(MEMBER_SCOPE, viewer);
    if (actor.vaiTro === 'BacSi') sql.add(ONLY_DOCTOR);
    if (filter.loai === 'BenhNhan_BacSi') sql.add(ONLY_DOCTOR);
    if (filter.loai === 'BenhNhan_LeTan') sql.add(ONLY_INBOX);
    if (filter.unreadOnly) sql.add(UNREAD_EXISTS, viewer);
    const p = filter.patterns;
    if (p === null) return;
    if (actor.vaiTro === 'BacSi') sql.add(SEARCH_NAME, p.name);
    else if (p.phone === null) sql.add(SEARCH_NAME_EMAIL, p.name, p.email);
    else sql.add(SEARCH_NAME_EMAIL_PHONE, p.name, p.email, p.phone);
  }

  /** Bước 2 (và chi tiết một hội thoại): đầu của các hội thoại theo id, nhìn từ người xem. Không theo thứ tự nào; nơi gọi tự sắp. */
  async headers(
    em: EntityManager,
    viewerId: string,
    hoiThoaiIds: string[],
  ): Promise<HeaderRow[]> {
    if (hoiThoaiIds.length === 0) return [];
    const rows = await em.query<Record<string, unknown>[]>(HEADER_SQL, [
      viewerId,
      viewerId,
      hoiThoaiIds,
    ]);
    return rows.map((r) => ({
      hoiThoaiId: str(r.hoiThoaiId),
      loai: r.loai as LoaiHoiThoai,
      chiNhanhId: strOrNull(r.chiNhanhId),
      tenChiNhanh: strOrNull(r.tenChiNhanh),
      benhNhanId: str(r.benhNhanId),
      benhNhanHoTen: str(r.benhNhanHoTen),
      benhNhanSoDienThoai: str(r.benhNhanSoDienThoai),
      benhNhanTrangThai: str(r.benhNhanTrangThai),
      bacSiId: strOrNull(r.bacSiId),
      bacSiHoTen: strOrNull(r.bacSiHoTen),
      bacSiTrangThai: strOrNull(r.bacSiTrangThai),
      bacSiChucDanh: strOrNull(r.bacSiChucDanh) as ChucDanhBacSi | null,
      laThanhVien: Number(r.laThanhVien) === 1,
      daTungKham: Number(r.daTungKham) === 1,
      soTinChuaDoc: Number(r.soTinChuaDoc),
    }));
  }

  async messagesByIds(
    em: EntityManager,
    tinNhanIds: string[],
  ): Promise<MessageRow[]> {
    if (tinNhanIds.length === 0) return [];
    const rows = await em.query<Record<string, unknown>[]>(LAST_MESSAGES_SQL, [
      tinNhanIds,
    ]);
    return rows.map(toMessageRow);
  }

  /** Một trang tin, trả theo id TĂNG dần. Lấy `limit + 1` để biết còn tin theo hướng đang đọc. */
  async messages(
    em: EntityManager,
    hoiThoaiId: string,
    cursor: MessageCursor,
    limit: number,
  ): Promise<MessageRow[]> {
    const take = limit + 1;
    const rows =
      cursor.kind === 'newest'
        ? await em.query<Record<string, unknown>[]>(NEWEST_SQL, [
            hoiThoaiId,
            take,
          ])
        : await em.query<Record<string, unknown>[]>(
            cursor.kind === 'before' ? BEFORE_SQL : AFTER_SQL,
            [hoiThoaiId, cursor.tinNhanId, take],
          );
    return rows.map(toMessageRow);
  }

  async shareConversation(
    em: EntityManager,
    hoiThoaiId: string,
  ): Promise<SharedConversation | null> {
    const rows = await em.query<Record<string, unknown>[]>(
      SHARE_CONVERSATION_SQL,
      [hoiThoaiId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      hoiThoaiId: str(row.hoiThoaiId),
      loai: row.loai as LoaiHoiThoai,
      chiNhanhId: strOrNull(row.chiNhanhId),
      nguoiTaoId: str(row.nguoiTaoId),
    };
  }

  async messageInConversation(
    em: EntityManager,
    tinNhanId: string,
    hoiThoaiId: string,
  ): Promise<boolean> {
    const rows = await em.query<unknown[]>(MESSAGE_IN_CONVERSATION_SQL, [
      tinNhanId,
      hoiThoaiId,
    ]);
    return rows.length > 0;
  }

  /** Đẩy mốc tiến tới (không bao giờ lùi) rồi đọc lại mốc thật sau khi ghi (`affectedRows` không cho biết có đổi hay không, X1 M7). */
  async advanceMark(
    em: EntityManager,
    taiKhoanId: string,
    hoiThoaiId: string,
    tinNhanId: string,
  ): Promise<string> {
    await em.query(UPSERT_MARK_SQL, [taiKhoanId, hoiThoaiId, tinNhanId]);
    const rows = await em.query<{ mocDaDoc: unknown }[]>(READ_MARK_SQL, [
      taiKhoanId,
      hoiThoaiId,
    ]);
    return str(rows[0]?.mocDaDoc);
  }
}

function toMessageRow(r: Record<string, unknown>): MessageRow {
  return {
    tinNhanId: str(r.tinNhanId),
    hoiThoaiId: str(r.hoiThoaiId),
    nguoiGuiId: str(r.nguoiGuiId),
    maGui: strOrNull(r.maGui),
    noiDung: str(r.noiDung),
    tepTenGoc: strOrNull(r.tepTenGoc),
    tepLoai: strOrNull(r.tepLoai),
    tepDungLuong: r.tepDungLuong === null ? null : Number(r.tepDungLuong),
    thoiDiemGui: r.thoiDiemGui as Date,
    hoTen: str(r.hoTen),
    loaiTaiKhoan: str(r.loaiTaiKhoan),
    chucDanh: strOrNull(r.chucDanh) as ChucDanhBacSi | null,
  };
}
