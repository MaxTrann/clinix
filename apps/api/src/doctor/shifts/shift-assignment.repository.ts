import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import type { TrangThaiTaiKhoan } from '../../auth/entities/enums.js';

/** Lô INSERT ca tối đa mỗi câu (Q7 (i)) `[đề xuất]`. */
const SHIFT_INSERT_BATCH = 500;

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

  /** Giao dịch ghi của phân công: `READ COMMITTED` tường minh (Q40, mặc định MySQL là REPEATABLE READ nên có khoá khoảng). */
  transaction<T>(work: (em: EntityManager) => Promise<T>): Promise<T> {
    return this.db.transaction('READ COMMITTED', work);
  }

  /**
   * Khoá hàng `bac_si` bằng MỘT câu `ORDER BY id ASC FOR UPDATE` (M1: một câu thì 0/200 deadlock, hai câu thứ tự chéo thì 20/20 deadlock).
   * `OF b` chỉ khoá `bac_si`, không khoá `tai_khoan` (tránh thêm cạnh chờ với luồng khoá tài khoản). Trả id dịch vụ chính (đã bỏ trùng, tăng dần).
   */
  async lockDoctors(
    em: EntityManager,
    ids: readonly string[],
  ): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows: { dichVuKhamId: string }[] = await em.query(
      `SELECT CAST(b.dich_vu_kham_id AS CHAR) AS dichVuKhamId
         FROM bac_si b
        WHERE b.tai_khoan_id IN (${ids.map(() => '?').join(', ')})
        ORDER BY b.tai_khoan_id ASC
          FOR UPDATE`,
      [...ids],
    );
    return [...new Set(rows.map((r) => r.dichVuKhamId))].sort(
      (a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0),
    );
  }

  /** `FOR SHARE` trên dịch vụ (H4): lệnh đổi `thoi_luong` (FOR UPDATE) phải chờ ta xong, và ta đọc `thoi_luong` MỚI nhất sau khi lấy khoá. */
  async lockServicesShared(
    em: EntityManager,
    serviceIds: readonly string[],
  ): Promise<void> {
    if (serviceIds.length === 0) return;
    await em.query(
      `SELECT dich_vu_kham_id FROM dich_vu_kham
        WHERE dich_vu_kham_id IN (${serviceIds.map(() => '?').join(', ')})
        ORDER BY dich_vu_kham_id ASC
          FOR SHARE`,
      [...serviceIds],
    );
  }

  /** INSERT ca theo lô; trùng (bac_si_id, ngay, ca) ⇒ lỗi 1062 để service đổi thành CA_DA_PHAN_CONG. */
  async insertShifts(
    em: EntityManager,
    rows: readonly {
      bacSiId: string;
      chiNhanhId: string;
      ngay: string;
      ca: string;
    }[],
  ): Promise<void> {
    for (let from = 0; from < rows.length; from += SHIFT_INSERT_BATCH) {
      const batch = rows.slice(from, from + SHIFT_INSERT_BATCH);
      await em.query(
        `INSERT INTO lich_lam_viec (bac_si_id, chi_nhanh_id, ngay, ca) VALUES ${batch.map(() => '(?, ?, ?, ?)').join(', ')}`,
        batch.flatMap((r) => [r.bacSiId, r.chiNhanhId, r.ngay, r.ca]),
      );
    }
  }

  /** Đọc lại id ca vừa ghi theo khoá tự nhiên (không dựa vào insertId liên tiếp: M7). Trả map `bacSiId|ngay|ca` ⇒ id. */
  async findShiftIds(
    em: EntityManager,
    ids: readonly string[],
    tuNgay: string,
    denNgay: string,
  ): Promise<Map<string, string>> {
    const rows: { id: string; bacSiId: string; ngay: string; ca: string }[] =
      await em.query(
        `SELECT CAST(lich_lam_viec_id AS CHAR) AS id, CAST(bac_si_id AS CHAR) AS bacSiId, DATE_FORMAT(ngay, '%Y-%m-%d') AS ngay, ca
           FROM lich_lam_viec
          WHERE bac_si_id IN (${ids.map(() => '?').join(', ')}) AND ngay BETWEEN ? AND ?`,
        [...ids, tuNgay, denNgay],
      );
    return new Map(rows.map((r) => [`${r.bacSiId}|${r.ngay}|${r.ca}`, r.id]));
  }
}
