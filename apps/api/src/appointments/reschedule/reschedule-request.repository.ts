import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { TrangThaiYeuCauDoiLich } from '../../admin/entities/enums.js';
import { toSecond } from '../../common/time/time.js';
import type { ListOrder } from '../lists/list-query.sql.js';
import { parseVnDateTime } from '../slots/slot-lock.js';
import {
  buildCountSql,
  buildDetailSql,
  buildPageSql,
} from './reschedule-request-list.sql.js';
import type {
  RequestHandlingMark,
  RescheduleRequestHandlingRow,
} from './reschedule-request-handle.types.js';
import type {
  RescheduleRequestDetailRow,
  RescheduleRequestFilter,
  RescheduleRequestItemRow,
} from './reschedule-request-list.types.js';
import type { LatestRescheduleRequest } from './reschedule-request.types.js';

// SQL của bảng `yeu_cau_doi_lich_ngoai_chinh_sach` cho việc TẠO yêu cầu và đọc yêu cầu mới nhất của một lịch (reschedule B5; PLAN reschedule 5.7). Nhận `em` của người gọi, KHÔNG mở giao dịch, không log
// (lý do và ghi chú là dữ liệu cá nhân). Mọi giá trị đi qua tham số `?`. Không `NOW()`: thời điểm tạo là mốc `now` của người gọi (AR-04).
//
// `INSERT` xin khoá S ngầm trên hàng cha `khung_gio` (khung giờ mong muốn) và `lich_hen` (X1, M2): người gọi PHẢI đã khoá hai hàng đó theo `lockRequestCreation` (khung giờ TRƯỚC `lich_hen`) rồi mới gọi.
// Đây là nơi DUY NHẤT trong mã sản xuất `INSERT` yêu cầu (ca XDL-29 quét mã nguồn): khoá "một `ChoDuyet` mỗi lịch" dựa vào khoá hàng `lich_hen` mà mọi đường tạo phải giữ, không có UNIQUE ở DB.
// B8 (danh sách, chi tiết cho nhân sự) và B9 (duyệt, từ chối) thêm phương thức của họ.

const INSERT_SQL = `INSERT INTO yeu_cau_doi_lich_ngoai_chinh_sach
  (lich_hen_id, khung_gio_mong_muon_id, ly_do_yeu_cau, trang_thai, thoi_diem_tao)
VALUES (?, ?, ?, 'ChoDuyet', ?)`;

// Yêu cầu MỚI NHẤT của một lịch: `thoi_diem_tao` lớn nhất, hoà thì id lớn nhất. Chỉ bốn cột của danh sách trắng (không `ly_do_yeu_cau`, `nguoi_xu_ly_id`). Chỉ mục khoá ngoại của `lich_hen_id`;
// một lịch chỉ có vài yêu cầu nên phần sắp xếp rất nhỏ. DATE_FORMAT: chuỗi giờ VN nguyên văn, không để driver đổi múi giờ (H13).
const FIND_LATEST_SQL = `SELECT yc.trang_thai AS trangThai, DATE_FORMAT(kg.ngay_gio, '%Y-%m-%d %H:%i:%s') AS thoiGianMongMuon,
  yc.ghi_chu_xu_ly AS ghiChuXuLy, DATE_FORMAT(yc.thoi_diem_tao, '%Y-%m-%d %H:%i:%s') AS thoiDiemTao
FROM yeu_cau_doi_lich_ngoai_chinh_sach yc
JOIN khung_gio kg ON kg.khung_gio_id = yc.khung_gio_mong_muon_id
WHERE yc.lich_hen_id = ?
ORDER BY yc.thoi_diem_tao DESC, yc.yeu_cau_doi_lich_ngoai_chinh_sach_id DESC
LIMIT 1`;

interface LatestRow {
  trangThai: TrangThaiYeuCauDoiLich;
  thoiGianMongMuon: string;
  ghiChuXuLy: string | null;
  thoiDiemTao: string;
}

// Đọc MỘT yêu cầu cho đường GHI (reschedule B9): theo khoá chính, ba bảng nối theo khoá ngoại NOT NULL (`yeu_cau` ⋈ `lich_hen` ⋈ `khung_gio`), đọc thường (không khoá). Phạm vi chi nhánh nằm TRONG SQL: yêu cầu
// ngoài phạm vi và yêu cầu không tồn tại cùng ra "không có hàng". Chỉ nội suy HẰNG `UPPER_SNAKE_CASE` (BDL-05).
const FIND_FOR_HANDLING_SQL = `SELECT CAST(yc.yeu_cau_doi_lich_ngoai_chinh_sach_id AS CHAR) AS yeuCauId, yc.trang_thai AS trangThai,
  CAST(lh.lich_hen_id AS CHAR) AS lichHenId, lh.ma_lich_hen AS maLichHen, CAST(lh.benh_nhan_id AS CHAR) AS benhNhanId,
  CAST(lh.chi_nhanh_id AS CHAR) AS chiNhanhId, CAST(yc.khung_gio_mong_muon_id AS CHAR) AS khungGioMongMuonId,
  DATE_FORMAT(kg.ngay_gio, '%Y-%m-%d %H:%i:%s') AS thoiGianMongMuon
FROM yeu_cau_doi_lich_ngoai_chinh_sach yc
JOIN lich_hen lh ON lh.lich_hen_id = yc.lich_hen_id
JOIN khung_gio kg ON kg.khung_gio_id = yc.khung_gio_mong_muon_id
WHERE yc.yeu_cau_doi_lich_ngoai_chinh_sach_id = ?`;
const FIND_FOR_HANDLING_IN_BRANCH_SQL = `${FIND_FOR_HANDLING_SQL}
  AND lh.chi_nhanh_id = ?`;

// Ghi kết quả xử lý: CHỈ từ `ChoDuyet` (điều kiện trong `WHERE`; người gọi đã giữ khoá 6c nên không bao giờ thua, nhưng câu vẫn tự bảo vệ). Hai CHECK của bảng đòi `DaDuyet` và `TuChoi` có đủ ghi chú, người và
// thời điểm xử lý. Nơi DUY NHẤT của mã sản xuất `UPDATE` bảng yêu cầu (HDL-36).
const MARK_HANDLED_SQL = `UPDATE yeu_cau_doi_lich_ngoai_chinh_sach
   SET trang_thai = ?, ghi_chu_xu_ly = ?, nguoi_xu_ly_id = ?, thoi_diem_xu_ly = ?
 WHERE yeu_cau_doi_lich_ngoai_chinh_sach_id = ? AND trang_thai = 'ChoDuyet'`;

interface HandlingRow {
  yeuCauId: string;
  trangThai: TrangThaiYeuCauDoiLich;
  lichHenId: string;
  maLichHen: string;
  benhNhanId: string;
  chiNhanhId: string;
  khungGioMongMuonId: string;
  thoiGianMongMuon: string;
}

@Injectable()
export class RescheduleRequestRepository {
  /** Chèn yêu cầu `ChoDuyet` và trả id (chuỗi: BIGINT có thể lớn hơn 2^53). `lyDoYeuCau` đã chuẩn hoá và kiểm; `thoiDiemTao` được cắt xuống giây. */
  async insert(
    em: EntityManager,
    input: {
      lichHenId: string;
      khungGioMongMuonId: string;
      lyDoYeuCau: string;
      thoiDiemTao: Date;
    },
  ): Promise<string> {
    const result: { insertId: number | string } = await em.query(INSERT_SQL, [
      input.lichHenId,
      input.khungGioMongMuonId,
      input.lyDoYeuCau,
      toSecond(input.thoiDiemTao),
    ]);
    return String(result.insertId);
  }

  /** Yêu cầu mới nhất của lịch, hoặc `null` nếu lịch chưa có yêu cầu nào. Không khoá. */
  async findLatest(
    em: EntityManager,
    lichHenId: string,
  ): Promise<LatestRescheduleRequest | null> {
    const rows = await em.query<LatestRow[]>(FIND_LATEST_SQL, [lichHenId]);
    const row = rows[0];
    if (row === undefined) return null;
    return {
      trangThai: row.trangThai,
      thoiGianMongMuon: parseVnDateTime(row.thoiGianMongMuon),
      ghiChuXuLy: row.ghiChuXuLy,
      thoiDiemTao: parseVnDateTime(row.thoiDiemTao),
    };
  }

  // ───────────────────────── Đọc cho nhân sự (reschedule B8; PLAN reschedule 5.7) ─────────────────────────
  // CHỈ ĐỌC (SELECT), không khoá, không log. Câu SQL do `reschedule-request-list.sql.ts` dựng (hàm thuần, kiểm riêng); người gọi truyền `em` của MỘT lần `runReadOnly` nên đếm, trang và chi tiết cùng
  // ảnh chụp. Bộ lọc phạm vi nằm TRONG SQL (H10). B9 (duyệt, từ chối) đọc yêu cầu bằng `findDetail` này, không viết câu thứ hai.

  /** Số yêu cầu khớp bộ lọc (tổng các nhánh theo trạng thái). `SUM` của MySQL là DECIMAL nên ra chuỗi. */
  async countByStates(
    em: EntityManager,
    filter: RescheduleRequestFilter,
  ): Promise<number> {
    const { sql, params } = buildCountSql(filter);
    const rows = await em.query<{ total: string | number }[]>(sql, params);
    return Number(rows[0]?.total ?? 0);
  }

  /** Một trang theo `thoi_diem_tao` (chiều do người gọi chọn). `limit` và `offset` đã kiểm (`PageQueryDto`) và `offset < total` (service). */
  async findPage(
    em: EntityManager,
    filter: RescheduleRequestFilter,
    order: ListOrder,
    limit: number,
    offset: number,
  ): Promise<RescheduleRequestItemRow[]> {
    const { sql, params } = buildPageSql(filter, order, limit, offset);
    return em.query<RescheduleRequestItemRow[]>(sql, params);
  }

  /**
   * Chi tiết MỘT yêu cầu theo khoá chính, hoặc `null`. `chiNhanhId` là kết quả của `BranchAccessPolicy.branchFilter` (`undefined` = không lọc chi nhánh): yêu cầu ngoài phạm vi và yêu cầu không
   * tồn tại cùng ra `null`, không có nhánh nào chạy sau khi thấy hàng của chi nhánh khác. `yeuCauId` đã qua `parseRescheduleRequestId`. Hàng có thêm `lichHenId`, `khungGioMongMuonId` cho B9 (không ra JSON).
   */
  async findDetail(
    em: EntityManager,
    chiNhanhId: string | undefined,
    yeuCauId: string,
  ): Promise<RescheduleRequestDetailRow | null> {
    const { sql, params } = buildDetailSql(chiNhanhId, yeuCauId);
    const rows = await em.query<RescheduleRequestDetailRow[]>(sql, params);
    return rows[0] ?? null;
  }

  // ───────────────────────── Đọc và ghi cho DUYỆT, TỪ CHỐI (reschedule B9; PLAN reschedule 5.7; TRACKING reschedule 1.13) ─────────────────────────
  // Đường GHI KHÔNG dùng `findDetail` ở trên (dù lời chú thích của khối trước nói vậy): hàng chi tiết CỐ Ý không có `benh_nhan_id` (B8: không bao giờ ra JSON) mà TỪ CHỐI cần để gửi thông báo cho đúng tài khoản
  // ĐẶT, và nó nối bảy bảng hiển thị mà đường ghi không cần. `findForHandling` là câu thứ hai, mỏng hơn, đã được duyệt ở kế hoạch B9 (câu 1). Ba phương thức của B8 giữ nguyên chữ ký và chữ SQL.

  /**
   * Một yêu cầu cho đường ghi, hoặc `null`. `chiNhanhId` là phạm vi của người xử lý (`undefined` = Quản trị viên Toàn hệ thống, không lọc): yêu cầu ngoài phạm vi và yêu cầu không tồn tại CÙNG ra `null`.
   * `yeuCauId` đã qua `parseRescheduleRequestId`. Đọc thường, không khoá: quyết định thật (còn `ChoDuyet` hay không) do người gọi đọc LẠI dưới khoá 6c.
   */
  async findForHandling(
    em: EntityManager,
    chiNhanhId: string | undefined,
    yeuCauId: string,
  ): Promise<RescheduleRequestHandlingRow | null> {
    const rows =
      chiNhanhId === undefined
        ? await em.query<HandlingRow[]>(FIND_FOR_HANDLING_SQL, [yeuCauId])
        : await em.query<HandlingRow[]>(FIND_FOR_HANDLING_IN_BRANCH_SQL, [
            yeuCauId,
            chiNhanhId,
          ]);
    const row = rows[0];
    if (row === undefined) return null;
    return { ...row, thoiGianMongMuon: parseVnDateTime(row.thoiGianMongMuon) };
  }

  /** `ChoDuyet` ⇒ `DaDuyet` kèm ghi chú, người và thời điểm xử lý. Người gọi PHẢI đã giữ khoá 6c; không còn đúng một hàng `ChoDuyet` ⇒ ném (hoàn tác giao dịch của người gọi). */
  markApproved(em: EntityManager, mark: RequestHandlingMark): Promise<void> {
    return this.markHandled(em, 'DaDuyet', mark);
  }

  /** `ChoDuyet` ⇒ `TuChoi`, cùng điều kiện với `markApproved`. */
  markRejected(em: EntityManager, mark: RequestHandlingMark): Promise<void> {
    return this.markHandled(em, 'TuChoi', mark);
  }

  private async markHandled(
    em: EntityManager,
    state: 'DaDuyet' | 'TuChoi',
    mark: RequestHandlingMark,
  ): Promise<void> {
    const result: { affectedRows?: number } = await em.query(MARK_HANDLED_SQL, [
      state,
      mark.ghiChu,
      mark.nguoiXuLyId,
      toSecond(mark.thoiDiemXuLy),
      mark.yeuCauId,
    ]);
    // Thông điệp KHÔNG mang dữ liệu (ghi chú, id): lỗi này chỉ có thể là lỗi lập trình hay khoá 6c bị bỏ qua
    if (result.affectedRows !== 1)
      throw new Error('yêu cầu không còn ChoDuyet khi ghi kết quả xử lý');
  }
}
