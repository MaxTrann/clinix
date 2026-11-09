import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import type { TrangThaiTaiKhoan } from '../../auth/entities/enums.js';

export interface AssignableDoctor {
  bacSiId: string;
  chiNhanhId: string;
  trangThai: TrangThaiTaiKhoan;
  thoiLuongPhut: number;
}

/** Truy vấn của phân công. Mọi hàm nhận `em` để B3 chạy lại đúng các câu này TRONG giao dịch ghi (PC-17). */
@Injectable()
export class ShiftAssignmentRepository {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  /** Đọc thường (không khoá, không giao dịch): dùng cho xem trước, có thể cũ. */
  get manager(): EntityManager {
    return this.db.manager;
  }

  /** Bác sĩ cùng chi nhánh hiện tại, trạng thái tài khoản và thời lượng khám của dịch vụ chính. Thiếu bác sĩ ⇒ không có trong kết quả. */
  async findDoctors(
    em: EntityManager,
    ids: readonly string[],
  ): Promise<AssignableDoctor[]> {
    if (ids.length === 0) return [];
    const rows: {
      bacSiId: string;
      chiNhanhId: string;
      trangThai: TrangThaiTaiKhoan;
      thoiLuong: number | string;
    }[] = await em.query(
      `SELECT CAST(b.tai_khoan_id AS CHAR) AS bacSiId, CAST(b.chi_nhanh_id AS CHAR) AS chiNhanhId,
              t.trang_thai AS trangThai, d.thoi_luong AS thoiLuong
         FROM bac_si b
         JOIN tai_khoan t ON t.tai_khoan_id = b.tai_khoan_id
         JOIN dich_vu_kham d ON d.dich_vu_kham_id = b.dich_vu_kham_id
        WHERE b.tai_khoan_id IN (${ids.map(() => '?').join(', ')})
        ORDER BY b.tai_khoan_id`,
      [...ids],
    );
    return rows.map((row) => ({
      bacSiId: row.bacSiId,
      chiNhanhId: row.chiNhanhId,
      trangThai: row.trangThai,
      thoiLuongPhut: Number(row.thoiLuong),
    }));
  }

  /** Khoá tự nhiên `bacSiId|ngay|ca` của các ca đã có trong khoảng ngày (ngày đọc bằng DATE_FORMAT, không qua Date). */
  async findExistingShiftKeys(
    em: EntityManager,
    ids: readonly string[],
    tuNgay: string,
    denNgay: string,
  ): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows: { bacSiId: string; ngay: string; ca: string }[] =
      await em.query(
        `SELECT CAST(bac_si_id AS CHAR) AS bacSiId, DATE_FORMAT(ngay, '%Y-%m-%d') AS ngay, ca
           FROM lich_lam_viec
          WHERE bac_si_id IN (${ids.map(() => '?').join(', ')}) AND ngay BETWEEN ? AND ?`,
        [...ids, tuNgay, denNgay],
      );
    return new Set(rows.map((r) => `${r.bacSiId}|${r.ngay}|${r.ca}`));
  }
}
