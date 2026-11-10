import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import type { CaLamViec } from '../../scheduling/branch-hours/branch-hours.types.js';
import type { SlotState } from './shift-removal.rules.js';

export interface ShiftToRemove {
  lichLamViecId: string;
  bacSiId: string;
  /** Chi nhánh GHI TRÊN CA (khác chi nhánh hiện tại của bác sĩ nếu bác sĩ đã chuyển). Phạm vi Admin tính theo giá trị này. */
  chiNhanhId: string;
  ngay: string;
  ca: CaLamViec;
}

/** Số mã lịch hẹn tối đa trả kèm lỗi `CA_DANG_CO_LICH_HEN` (Q8). */
export const MAX_APPOINTMENT_CODES = 50;

/** Truy vấn của gỡ ca. Thứ tự khoá cố định: `bac_si` → các `khung_gio` của ca (mục 5.3, khớp thứ tự khoá chung của booking 5.3). */
@Injectable()
export class ShiftRemovalRepository {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  /** Đọc thường (không khoá): xác định ca, phạm vi và bác sĩ cần khoá. */
  get manager(): EntityManager {
    return this.db.manager;
  }

  /** `READ COMMITTED` tường minh như phân công (Q40). */
  transaction<T>(work: (em: EntityManager) => Promise<T>): Promise<T> {
    return this.db.transaction('READ COMMITTED', work);
  }

  async findShift(
    em: EntityManager,
    lichLamViecId: string,
  ): Promise<ShiftToRemove | null> {
    const rows: ShiftToRemove[] = await em.query(
      // DATE_FORMAT: không để driver đổi cột DATE thành `Date` (lệch ngày: H1, M4).
      `SELECT CAST(lich_lam_viec_id AS CHAR) AS lichLamViecId, CAST(bac_si_id AS CHAR) AS bacSiId,
              CAST(chi_nhanh_id AS CHAR) AS chiNhanhId, DATE_FORMAT(ngay, '%Y-%m-%d') AS ngay, ca
         FROM lich_lam_viec WHERE lich_lam_viec_id = ?`,
      [lichLamViecId],
    );
    return rows[0] ?? null;
  }

  /** Khoá hàng `bac_si` (tầng 4 của thứ tự khoá) và trả chi nhánh HIỆN TẠI của bác sĩ, dùng làm chi nhánh của nhật ký. */
  async lockDoctor(em: EntityManager, bacSiId: string): Promise<string | null> {
    const rows: { chiNhanhId: string }[] = await em.query(
      `SELECT CAST(chi_nhanh_id AS CHAR) AS chiNhanhId FROM bac_si WHERE tai_khoan_id = ? FOR UPDATE`,
      [bacSiId],
    );
    return rows[0]?.chiNhanhId ?? null;
  }

  /** Khoá MỌI khung giờ của ca (tăng dần theo mã), kể cả ô đã đặt: để kiểm trạng thái và xoá cùng một ảnh chụp. */
  async lockSlots(
    em: EntityManager,
    lichLamViecId: string,
  ): Promise<{ khungGioId: string; trangThai: SlotState }[]> {
    return em.query(
      `SELECT CAST(khung_gio_id AS CHAR) AS khungGioId, trang_thai AS trangThai
         FROM khung_gio WHERE lich_lam_viec_id = ? ORDER BY khung_gio_id ASC FOR UPDATE`,
      [lichLamViecId],
    );
  }

  /**
   * Lịch hẹn (kể cả `DaHuy`) đang tham chiếu các khung giờ này. Đọc KHÔNG khoá (không `FOR UPDATE`/`FOR SHARE`): khoá chỉ mục phụ
   * `lich_hen.khung_gio_id` sẽ sinh deadlock với `cancel` của booking (M12). Trả tổng số và tối đa 50 mã đầu để báo người dùng.
   */
  async findReferencingAppointments(
    em: EntityManager,
    khungGioIds: readonly string[],
  ): Promise<{ tong: number; maLichHen: string[] }> {
    if (khungGioIds.length === 0) return { tong: 0, maLichHen: [] };
    const marks = khungGioIds.map(() => '?').join(', ');
    const codes: { ma: string }[] = await em.query(
      `SELECT ma_lich_hen AS ma FROM lich_hen WHERE khung_gio_id IN (${marks}) ORDER BY lich_hen_id ASC LIMIT ${MAX_APPOINTMENT_CODES}`,
      [...khungGioIds],
    );
    const total: { tong: string | number }[] = await em.query(
      `SELECT COUNT(*) AS tong FROM lich_hen WHERE khung_gio_id IN (${marks})`,
      [...khungGioIds],
    );
    return {
      tong: Number(total[0]?.tong ?? 0),
      maLichHen: codes.map((row) => row.ma),
    };
  }

  /** Xoá khung giờ rồi ca. Khoá ngoại (1451) là lưới an toàn cuối: nơi gọi đổi nó thành `CA_DANG_CO_LICH_HEN`. */
  async deleteShiftWithSlots(
    em: EntityManager,
    lichLamViecId: string,
  ): Promise<void> {
    await em.query(`DELETE FROM khung_gio WHERE lich_lam_viec_id = ?`, [
      lichLamViecId,
    ]);
    await em.query(`DELETE FROM lich_lam_viec WHERE lich_lam_viec_id = ?`, [
      lichLamViecId,
    ]);
  }
}
