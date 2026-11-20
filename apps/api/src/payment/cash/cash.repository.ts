import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';

// SQL thô của thu tiền mặt tại quầy (payment B6; PLAN 5.7, E7). KHÔNG `UPDATE lich_hen` hay `khung_gio` (QTT-08: `checkIn` của booking là nơi duy nhất đổi trạng thái lịch). Không ghi log.

/**
 * Lịch theo mã, ĐỌC THƯỜNG (không khoá) để kiểm chi nhánh TRƯỚC `checkIn` (`chi_nhanh_id` là snapshot bất biến của lịch nên đọc một lần là đủ).
 * `giaSnapshot` và `trangThai` chỉ dùng cho bản xem trước của hộp thu tiền (payment F4); đường ghi kiểm lại trạng thái và số tiền dưới khoá.
 */
export interface CashAppointmentRow {
  lichHenId: string;
  chiNhanhId: string;
  giaSnapshot: string;
  trangThai: string;
}

@Injectable()
export class CashRepository {
  async findByCode(
    em: EntityManager,
    maLichHen: string,
  ): Promise<CashAppointmentRow | null> {
    const rows = await em.query<CashAppointmentRow[]>(
      `SELECT CAST(lich_hen_id AS CHAR) AS lichHenId, CAST(chi_nhanh_id AS CHAR) AS chiNhanhId,
              CAST(gia_snapshot AS CHAR) AS giaSnapshot, trang_thai AS trangThai
       FROM lich_hen WHERE ma_lich_hen = ?`,
      [maLichHen],
    );
    return rows[0] ?? null;
  }

  /**
   * `INSERT giao_dich_thanh_toan` tiền mặt tại quầy: `TienMatTaiQuay`, `ThanhCong`, `KhongCan`, KHÔNG ví, KHÔNG mã cổng, `nguoi_thu_id` = Lễ tân từ token, `lich_hen_id` = LỊCH GỐC của chuỗi đổi lịch.
   * Gọi SAU `checkIn` (HDT-13): `checkIn` đã khoá X hàng `lich_hen` nên khoá chia sẻ của khoá ngoại không gây nâng khoá. CHECK `chk_gd_tien_mat_nguoi_thu` là lưới thứ hai (TTQ-11). Trả id.
   */
  async insertCashPayment(
    em: EntityManager,
    input: {
      rootLichHenId: string;
      soTien: string;
      nguoiThuId: string;
      now: Date;
    },
  ): Promise<string> {
    const result = await em.query<{ insertId: string | number }>(
      `INSERT INTO giao_dich_thanh_toan (vi_noi_bo_id, lich_hen_id, loai, phuong_thuc, so_tien, trang_thai, trang_thai_doi_soat, nguoi_thu_id, thoi_diem_tao)
       VALUES (NULL, ?, 'ThanhToanLichHen', 'TienMatTaiQuay', ?, 'ThanhCong', 'KhongCan', ?, ?)`,
      [input.rootLichHenId, input.soTien, input.nguoiThuId, input.now],
    );
    return String(result.insertId);
  }

  /** Họ tên của tài khoản Lễ tân (in trên phiếu thu). */
  async receptionistName(
    em: EntityManager,
    taiKhoanId: string,
  ): Promise<string> {
    const rows = await em.query<{ hoTen: string }[]>(
      'SELECT ho_ten AS hoTen FROM tai_khoan WHERE tai_khoan_id = ?',
      [taiKhoanId],
    );
    return rows[0]?.hoTen ?? '';
  }
}
