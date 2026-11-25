import type { ListOrder } from '../lists/list-query.sql.js';
import type { RescheduleRequestFilter } from './reschedule-request-list.types.js';

// Dựng SQL của danh sách và chi tiết yêu cầu đổi lịch cho nhân sự (reschedule B8; PLAN reschedule 5.7; kết luận M3 của X1, TRACKING reschedule mục 6 và 7). Hàm THUẦN: không DB, không Nest, không đồng hồ,
// và CHỈ nhập kiểu (để script đo EXPLAIN ngoài repo nạp được đúng file này bằng `transpileModule`). Mọi giá trị người dùng đi qua tham số `?`; câu SQL là các hằng chuỗi ghép bằng `join` và chỉ nội suy
// HẰNG `UPPER_SNAKE_CASE` (bộ quét BDL-05 của `reschedule/` cấm nội suy biến và nối `+`). Chiều sắp xếp chỉ lấy từ hằng `ORDER`, không từ đầu vào.
//
// Hình dạng (M3, S1 đến S7): MỖI trạng thái là MỘT nhánh `=` (không `IN`: hai khoảng của chỉ mục `(trang_thai, thoi_diem_tao)` làm mất thứ tự và phải sắp 80.000 hàng), mỗi nhánh lấy `offset + pageSize`
// hàng theo chỉ mục rồi gộp `UNION ALL`, sắp lại và cắt trang. Nhánh lõi CHỈ có `yeu_cau… ⋈ lich_hen` (không `chi_nhanh`, bác sĩ, người khám): bảng `chi_nhanh` ba hàng từng bị nối trước `lich_hen` ở S5 và S6
// nên mất thứ tự chỉ mục. Các bảng hiển thị chỉ nối cho tối đa `pageSize` hàng của trang, toàn theo khoá chính.
// Điều kiện phạm vi (chi nhánh) là điều kiện ĐẦU của MỌI nhánh, của câu đếm và của câu chi tiết (H10).

export interface BuiltSql {
  sql: string;
  params: unknown[];
}

const DATE_TIME_FORMAT = "'%Y-%m-%d %H:%i:%s'";
const REQUEST_ID = 'yc.yeu_cau_doi_lich_ngoai_chinh_sach_id';

// Nhánh lõi: bảng yêu cầu nối `lich_hen` theo khoá ngoại (NOT NULL nên không đổi số hàng). Mở ngoặc của nhánh ở `CORE_SELECT`, đóng ngoặc sau `LIMIT ?`.
const CORE_SELECT = `(SELECT ${REQUEST_ID} AS id, yc.thoi_diem_tao AS tao`;
const CORE_FROM = `FROM yeu_cau_doi_lich_ngoai_chinh_sach yc
JOIN lich_hen lh ON lh.lich_hen_id = yc.lich_hen_id`;

const ORDER = {
  ASC: {
    core: `ORDER BY yc.thoi_diem_tao ASC, ${REQUEST_ID} ASC`,
    page: 'ORDER BY tao ASC, id ASC',
    display: 'ORDER BY page.tao ASC, page.id ASC',
  },
  DESC: {
    core: `ORDER BY yc.thoi_diem_tao DESC, ${REQUEST_ID} DESC`,
    page: 'ORDER BY tao DESC, id DESC',
    display: 'ORDER BY page.tao DESC, page.id DESC',
  },
} as const;

// Mười hai cột của MỘT dòng danh sách (danh sách trắng cột, không `SELECT *`). Không `lich_hen_id`, SĐT, email, `ly_do_kham`, giá.
const ITEM_COLUMNS = `SELECT CAST(${REQUEST_ID} AS CHAR) AS yeuCauId, yc.trang_thai AS trangThai,
  DATE_FORMAT(yc.thoi_diem_tao, ${DATE_TIME_FORMAT}) AS thoiDiemTao, lh.ma_lich_hen AS maLichHen,
  COALESCE(hs.ho_ten, tbn.ho_ten) AS nguoiKhamHoTen, (lh.ho_so_nguoi_than_id IS NOT NULL) AS laNguoiThan,
  tbs.ho_ten AS bacSiHoTen, CAST(cn.chi_nhanh_id AS CHAR) AS chiNhanhId, cn.ten AS chiNhanhTen,
  DATE_FORMAT(lh.thoi_gian, ${DATE_TIME_FORMAT}) AS thoiGianCu, DATE_FORMAT(kg.ngay_gio, ${DATE_TIME_FORMAT}) AS thoiGianMongMuon,
  lh.so_lan_tu_doi_lich AS soLanDaTuDoi`;

// Cột chỉ của chi tiết: ba id để dịch vụ và B9 dùng (không ra JSON), trạng thái khung giờ mong muốn, lý do (chữ tự do của Bệnh nhân, chỉ nhân sự thấy), trạng thái lịch gốc và ba cột xử lý
const DETAIL_COLUMNS = `${ITEM_COLUMNS},
  CAST(lh.lich_hen_id AS CHAR) AS lichHenId, CAST(kg.khung_gio_id AS CHAR) AS khungGioMongMuonId,
  kg.trang_thai AS khungGioTrangThai, DATE_FORMAT(kg.giu_cho_den, ${DATE_TIME_FORMAT}) AS khungGioGiuChoDen,
  yc.ly_do_yeu_cau AS lyDoYeuCau, lh.trang_thai AS trangThaiLichGoc, yc.ghi_chu_xu_ly AS ghiChuXuLy,
  DATE_FORMAT(yc.thoi_diem_xu_ly, ${DATE_TIME_FORMAT}) AS thoiDiemXuLy, tnx.ho_ten AS nguoiXuLyHoTen`;

// Bảng hiển thị, toàn theo khoá chính từ hàng yêu cầu đã chọn. `tnx` (người xử lý) là LEFT JOIN: yêu cầu `ChoDuyet` chưa có người xử lý.
const DISPLAY_JOINS = `JOIN lich_hen lh ON lh.lich_hen_id = yc.lich_hen_id
JOIN khung_gio kg ON kg.khung_gio_id = yc.khung_gio_mong_muon_id
JOIN tai_khoan tbs ON tbs.tai_khoan_id = lh.bac_si_id
JOIN chi_nhanh cn ON cn.chi_nhanh_id = lh.chi_nhanh_id
JOIN tai_khoan tbn ON tbn.tai_khoan_id = lh.benh_nhan_id
LEFT JOIN ho_so_nguoi_than hs ON hs.ho_so_nguoi_than_id = lh.ho_so_nguoi_than_id`;

/**
 * `WHERE` của MỘT nhánh và tham số, theo thứ tự cố định: chi nhánh (phạm vi, ĐẦU TIÊN), trạng thái của nhánh, bác sĩ, mã lịch hẹn. `lh.ma_lich_hen = ?` dùng chỉ mục UNIQUE; collation
 * `utf8mb4_unicode_ci` không phân biệt hoa thường nên mã đã được chuẩn hoá chữ hoa ở DTO.
 */
function branchWhere(filter: RescheduleRequestFilter, state: string): BuiltSql {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filter.chiNhanhId !== undefined) {
    conditions.push('lh.chi_nhanh_id = ?');
    params.push(filter.chiNhanhId);
  }
  conditions.push('yc.trang_thai = ?');
  params.push(state);
  if (filter.bacSiId !== null) {
    conditions.push('lh.bac_si_id = ?');
    params.push(filter.bacSiId);
  }
  if (filter.maLichHen !== null) {
    conditions.push('lh.ma_lich_hen = ?');
    params.push(filter.maLichHen);
  }
  return { sql: `WHERE ${conditions.join('\n  AND ')}`, params };
}

function assertStates(filter: RescheduleRequestFilter): void {
  if (filter.states.length === 0)
    throw new RangeError('Bộ lọc yêu cầu đổi lịch không có trạng thái nào');
}

/**
 * Số yêu cầu khớp: tổng của các nhánh `COUNT(*)` (cùng điều kiện với câu trang, dựng bằng cùng `branchWhere` nên `total` luôn đúng tập mà trang cắt ra).
 * `SUM` của MySQL là DECIMAL nên ra chuỗi: người gọi đổi bằng `Number`.
 */
export function buildCountSql(filter: RescheduleRequestFilter): BuiltSql {
  assertStates(filter);
  const branches = filter.states.map((state) => {
    const where = branchWhere(filter, state);
    return {
      sql: ['SELECT COUNT(*) AS c', CORE_FROM, where.sql].join('\n'),
      params: where.params,
    };
  });
  return {
    sql: [
      'SELECT COALESCE(SUM(c), 0) AS total FROM (',
      branches.map((branch) => branch.sql).join('\nUNION ALL\n'),
      ') counts',
    ].join('\n'),
    params: branches.flatMap((branch) => branch.params),
  };
}

/**
 * Một trang. Mỗi nhánh lõi lấy `offset + limit` hàng đầu theo chỉ mục `(trang_thai, thoi_diem_tao)` (đọc ngược khi giảm dần: hoà thì theo id cùng chiều, đúng thứ tự của chỉ mục thứ cấp InnoDB),
 * ngoài `UNION ALL` sắp lại theo `(tao, id)` rồi `LIMIT … OFFSET …`; bảng hiển thị nối SAU, chỉ cho hàng của trang. `limit` và `offset` đã kiểm ở `PageQueryDto` và `offset < total` ở service.
 */
export function buildPageSql(
  filter: RescheduleRequestFilter,
  order: ListOrder,
  limit: number,
  offset: number,
): BuiltSql {
  assertStates(filter);
  const reach = offset + limit;
  if (!Number.isSafeInteger(reach) || limit < 1 || offset < 0)
    throw new RangeError('Trang yêu cầu đổi lịch ngoài biên');
  const sort = ORDER[order];
  const branches = filter.states.map((state) => {
    const where = branchWhere(filter, state);
    return {
      sql: [CORE_SELECT, CORE_FROM, where.sql, sort.core, 'LIMIT ?)'].join(
        '\n',
      ),
      params: [...where.params, reach],
    };
  });
  return {
    sql: [
      ITEM_COLUMNS,
      'FROM (',
      branches.map((branch) => branch.sql).join('\nUNION ALL\n'),
      `${sort.page} LIMIT ? OFFSET ?`,
      ') page',
      `JOIN yeu_cau_doi_lich_ngoai_chinh_sach yc ON ${REQUEST_ID} = page.id`,
      DISPLAY_JOINS,
      sort.display,
    ].join('\n'),
    params: [...branches.flatMap((branch) => branch.params), limit, offset],
  };
}

/**
 * Chi tiết MỘT yêu cầu theo khoá chính, kèm điều kiện chi nhánh NGAY TRONG SQL khi có (yêu cầu ngoài phạm vi và yêu cầu không tồn tại cùng ra "không có hàng", H10). `yeuCauId` đã qua
 * `parseRescheduleRequestId`. Không lọc trạng thái (nhân sự xem cả `DaDuyet` và `TuChoi`).
 */
export function buildDetailSql(
  chiNhanhId: string | undefined,
  yeuCauId: string,
): BuiltSql {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (chiNhanhId !== undefined) {
    conditions.push('lh.chi_nhanh_id = ?');
    params.push(chiNhanhId);
  }
  conditions.push(`${REQUEST_ID} = ?`);
  params.push(yeuCauId);
  return {
    sql: [
      DETAIL_COLUMNS,
      'FROM yeu_cau_doi_lich_ngoai_chinh_sach yc',
      DISPLAY_JOINS,
      'LEFT JOIN tai_khoan tnx ON tnx.tai_khoan_id = yc.nguoi_xu_ly_id',
      `WHERE ${conditions.join('\n  AND ')}`,
    ].join('\n'),
    params,
  };
}
