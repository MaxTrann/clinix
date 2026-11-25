import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { TrangThaiYeuCauDoiLich } from '../../admin/entities/enums.js';
import { toSecond } from '../../common/time/time.js';
import { parseVnDateTime } from '../slots/slot-lock.js';
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
}
