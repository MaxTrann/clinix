import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { CaLamViec } from '../../scheduling/branch-hours/branch-hours.types.js';
import type {
  HinhThucNghi,
  TrangThaiYeuCauNghiPhep,
} from '../entities/enums.js';

/** Hàng thô: DATETIME ra `Date` nhờ múi giờ của driver; cột DATE đọc bằng DATE_FORMAT để không lệch ngày (H1). */
export interface LeaveRequestRow {
  yeuCauNghiPhepId: string;
  trangThai: TrangThaiYeuCauNghiPhep;
  hinhThuc: HinhThucNghi;
  tuNgay: string;
  denNgay: string;
  ca: CaLamViec | null;
  lyDo: string;
  thoiDiemTao: Date;
  thoiDiemXuLy: Date | null;
}

// Không chọn `bac_si_id` hay `nguoi_xu_ly_id`: danh sách trắng ngay từ SQL (YN-16).
const COLUMNS = `CAST(yeu_cau_nghi_phep_id AS CHAR) AS yeuCauNghiPhepId, trang_thai AS trangThai, hinh_thuc_nghi AS hinhThuc,
  DATE_FORMAT(ngay_bat_dau, '%Y-%m-%d') AS tuNgay, DATE_FORMAT(ngay_ket_thuc, '%Y-%m-%d') AS denNgay,
  ca, ly_do AS lyDo, thoi_diem_tao AS thoiDiemTao, thoi_diem_xu_ly AS thoiDiemXuLy`;

/** SQL chỉ đọc của lịch sử và chi tiết yêu cầu nghỉ (Bác sĩ). Mọi giá trị đi qua `?`; mọi câu đều lọc `bac_si_id` của CHÍNH người gọi. */
@Injectable()
export class DoctorLeaveHistoryRepository {
  /** Mới nhất trước; `yeu_cau_nghi_phep_id DESC` phá hoà khi cùng giây nên thứ tự ổn định giữa các trang. */
  async findPage(
    em: EntityManager,
    bacSiId: string,
    trangThai: TrangThaiYeuCauNghiPhep | null,
    limit: number,
    offset: number,
  ): Promise<LeaveRequestRow[]> {
    return em.query(
      `SELECT ${COLUMNS}
         FROM yeu_cau_nghi_phep
        WHERE bac_si_id = ? AND (? IS NULL OR trang_thai = ?)
        ORDER BY thoi_diem_tao DESC, yeu_cau_nghi_phep_id DESC
        LIMIT ? OFFSET ?`,
      [bacSiId, trangThai, trangThai, limit, offset],
    );
  }

  async count(
    em: EntityManager,
    bacSiId: string,
    trangThai: TrangThaiYeuCauNghiPhep | null,
  ): Promise<number> {
    const rows: { so: string | number }[] = await em.query(
      `SELECT COUNT(*) AS so FROM yeu_cau_nghi_phep WHERE bac_si_id = ? AND (? IS NULL OR trang_thai = ?)`,
      [bacSiId, trangThai, trangThai],
    );
    return Number(rows[0]?.so ?? 0);
  }

  /** Mã các ca của bác sĩ trong [tuNgay, denNgay] (đã chặn dưới ở hôm nay) để đếm lịch hẹn (D14); `ca` lọc thêm khi nghỉ theo ca. */
  async findShiftIds(
    em: EntityManager,
    input: {
      bacSiId: string;
      tuNgay: string;
      denNgay: string;
      ca: CaLamViec | null;
    },
  ): Promise<string[]> {
    const rows: { id: string }[] = await em.query(
      `SELECT CAST(lich_lam_viec_id AS CHAR) AS id FROM lich_lam_viec
        WHERE bac_si_id = ? AND ngay >= ? AND ngay <= ? AND (? IS NULL OR ca = ?)`,
      [input.bacSiId, input.tuNgay, input.denNgay, input.ca, input.ca],
    );
    return rows.map((row) => row.id);
  }

  /** Lọc `bac_si_id` ngay trong câu: yêu cầu của người khác và yêu cầu không có cho cùng kết quả rỗng (404 cùng thân). */
  async findOne(
    em: EntityManager,
    bacSiId: string,
    id: string,
  ): Promise<LeaveRequestRow | null> {
    const rows: LeaveRequestRow[] = await em.query(
      `SELECT ${COLUMNS} FROM yeu_cau_nghi_phep WHERE yeu_cau_nghi_phep_id = ? AND bac_si_id = ?`,
      [id, bacSiId],
    );
    return rows[0] ?? null;
  }
}
