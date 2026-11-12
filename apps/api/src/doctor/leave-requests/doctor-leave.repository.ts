import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import type { CaLamViec } from '../../scheduling/branch-hours/branch-hours.types.js';

export interface DoctorForLeave {
  /** Chi nhánh HIỆN TẠI của bác sĩ: quyết định Admin Chi nhánh nào nhận thông báo. */
  chiNhanhId: string;
  hoTen: string;
}

export interface ShiftInRange {
  lichLamViecId: string;
  /** Chi nhánh GHI TRÊN CA (có thể khác chi nhánh hiện tại nếu bác sĩ đã chuyển): giờ ca tính theo chi nhánh này. */
  chiNhanhId: string;
  ngay: string;
  ca: CaLamViec;
}

export interface NewLeaveRequest {
  bacSiId: string;
  hinhThuc: 'CaNgay' | 'TheoCa';
  tuNgay: string;
  denNgay: string;
  ca: CaLamViec | null;
  lyDo: string;
  thoiDiemTao: Date;
}

/** Truy vấn của tạo yêu cầu nghỉ. Thứ tự khoá (PLAN 5.9): `bac_si` → `yeu_cau_nghi_phep` (INSERT) → `thong_bao` (INSERT). */
@Injectable()
export class DoctorLeaveRepository {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  /** `READ COMMITTED` tường minh như phân công và gỡ ca (Q40). */
  transaction<T>(work: (em: EntityManager) => Promise<T>): Promise<T> {
    return this.db.transaction('READ COMMITTED', work);
  }

  /**
   * Khoá hàng `bac_si` (tầng 4): serial hoá mọi yêu cầu của CHÍNH bác sĩ này (bấm đúp, hai thiết bị) và với duyệt nghỉ / đặt lịch.
   * Chỉ khoá `bac_si`, không khoá `tai_khoan`: tên đọc ở câu riêng, không `FOR UPDATE`.
   */
  async lockDoctor(
    em: EntityManager,
    bacSiId: string,
  ): Promise<DoctorForLeave | null> {
    const locked: { chiNhanhId: string }[] = await em.query(
      `SELECT CAST(chi_nhanh_id AS CHAR) AS chiNhanhId FROM bac_si WHERE tai_khoan_id = ? FOR UPDATE`,
      [bacSiId],
    );
    if (locked[0] === undefined) return null;
    const names: { hoTen: string }[] = await em.query(
      `SELECT ho_ten AS hoTen FROM tai_khoan WHERE tai_khoan_id = ?`,
      [bacSiId],
    );
    return { chiNhanhId: locked[0].chiNhanhId, hoTen: names[0]?.hoTen ?? '' };
  }

  async countPending(em: EntityManager, bacSiId: string): Promise<number> {
    const rows: { so: string | number }[] = await em.query(
      `SELECT COUNT(*) AS so FROM yeu_cau_nghi_phep WHERE bac_si_id = ? AND trang_thai = 'ChoDuyet'`,
      [bacSiId],
    );
    return Number(rows[0]?.so ?? 0);
  }

  /** Mọi ca của bác sĩ có ngày trong [tuNgay, denNgay]. DATE_FORMAT: không để driver đổi cột DATE thành `Date` (lệch ngày: H1). */
  async findShiftsInRange(
    em: EntityManager,
    bacSiId: string,
    tuNgay: string,
    denNgay: string,
  ): Promise<ShiftInRange[]> {
    return em.query(
      `SELECT CAST(lich_lam_viec_id AS CHAR) AS lichLamViecId, CAST(chi_nhanh_id AS CHAR) AS chiNhanhId, DATE_FORMAT(ngay, '%Y-%m-%d') AS ngay, ca
         FROM lich_lam_viec
        WHERE bac_si_id = ? AND ngay >= ? AND ngay <= ?
        ORDER BY ngay ASC, ca ASC`,
      [bacSiId, tuNgay, denNgay],
    );
  }

  async insert(em: EntityManager, input: NewLeaveRequest): Promise<string> {
    const result: { insertId: string | number } = await em.query(
      `INSERT INTO yeu_cau_nghi_phep
         (bac_si_id, hinh_thuc_nghi, ngay_bat_dau, ngay_ket_thuc, ca, ly_do, trang_thai, thoi_diem_tao)
       VALUES (?, ?, ?, ?, ?, ?, 'ChoDuyet', ?)`,
      [
        input.bacSiId,
        input.hinhThuc,
        input.tuNgay,
        input.denNgay,
        input.ca,
        input.lyDo,
        input.thoiDiemTao,
      ],
    );
    return String(result.insertId);
  }
}
