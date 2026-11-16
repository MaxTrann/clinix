import { ADMIN_RATING_PREVIEW_LENGTH } from '../examination.constants.js';
import type {
  AdminRatingDetail,
  AdminRatingItem,
} from './admin-ratings.dto.js';
import {
  previewComment,
  type AdminRatingCounts,
} from './admin-ratings.rules.js';

// Hàng thô của câu SQL ⇒ hình dạng trả về (doctor-exam B7; PLAN 5.8; KDD-03, KDD-18, KDD-20). Hàm THUẦN, không DB. Danh sách trắng: từng khoá được gán tường minh, không `...row`.

/**
 * Hàng thô của câu trang và câu chi tiết. BIGINT ra CHUỖI (`bigNumberStrings`); `tinyint` (`so_sao`, `bi_an`) ra số hay chuỗi tuỳ driver nên đọc bằng `Number(...)`;
 * cột `datetime` ra `Date` (driver `+07:00`) rồi `toISOString()`.
 */
export interface AdminRatingRow {
  danhGiaId: string;
  bacSiId: string;
  bacSiHoTen: string;
  chiNhanhId: string;
  chiNhanhTen: string;
  nguoiDanhGiaHoTen: string;
  soSao: number | string;
  nhanXet: string | null;
  thoiDiemTao: Date;
  biAn: number | string | boolean;
}

export interface AdminRatingDetailRow extends AdminRatingRow {
  maLichHen: string;
  thoiGianKham: Date;
  lyDoAn: string | null;
}

/** Một hàng của câu đếm: `biAn` 0 hay 1, `soLuong` là `COUNT(*)` (chuỗi hay số). */
export interface StatusCountRow {
  biAn: number | string | boolean;
  soLuong: number | string;
}

const isHidden = (value: number | string | boolean): boolean =>
  Number(value) === 1;

/** Tám khoá chung của danh sách và chi tiết; `nhanXet` do người gọi quyết (danh sách cắt, chi tiết đủ). */
function base(row: AdminRatingRow, nhanXet: string | null): AdminRatingItem {
  return {
    danhGiaId: String(row.danhGiaId),
    bacSi: { bacSiId: String(row.bacSiId), hoTen: row.bacSiHoTen },
    chiNhanh: { chiNhanhId: String(row.chiNhanhId), ten: row.chiNhanhTen },
    nguoiDanhGia: { hoTen: row.nguoiDanhGiaHoTen },
    soSao: Number(row.soSao),
    nhanXet,
    thoiDiemTao: row.thoiDiemTao.toISOString(),
    biAn: isHidden(row.biAn),
  };
}

export function toItem(row: AdminRatingRow): AdminRatingItem {
  return base(row, previewComment(row.nhanXet, ADMIN_RATING_PREVIEW_LENGTH));
}

/** `lyDoAn` theo `biAn`, KHÔNG theo `ly_do_an` có chữ hay không: chưa ẩn thì không bao giờ có khoá này. */
export function toDetail(row: AdminRatingDetailRow): AdminRatingDetail {
  return {
    ...base(row, row.nhanXet),
    maLichHen: row.maLichHen,
    thoiGianKham: row.thoiGianKham.toISOString(),
    ...(isHidden(row.biAn) && row.lyDoAn !== null
      ? { lyDoAn: row.lyDoAn }
      : {}),
  };
}

/** Thiếu hàng nào thì trạng thái đó là 0 (không đánh giá nào). */
export function toCounts(rows: StatusCountRow[]): AdminRatingCounts {
  const counts: AdminRatingCounts = { HienThi: 0, DaAn: 0 };
  for (const row of rows)
    counts[isHidden(row.biAn) ? 'DaAn' : 'HienThi'] = Number(row.soLuong);
  return counts;
}
