import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { escapeLikePattern } from '../../common/paging/like-pattern.js';
import type { Paged } from '../../common/paging/paged.js';
import { doctorScopePredicate } from '../common/doctor-scope.sql.js';

export interface ScheduleDoctor {
  bacSiId: string;
  hoTen: string;
  /** Tài khoản ngừng hoạt động vẫn hiện để xem lịch cũ (Q14). */
  ngungHoatDong: boolean;
  chiNhanh: { chiNhanhId: string; ten: string };
  chuyenKhoa: { chuyenKhoaId: string; ten: string };
}

export interface DoctorFilter {
  /** Chi nhánh đã được ÉP theo phạm vi (Admin Chi nhánh) hoặc do Toàn hệ thống chọn; không có ⇒ mọi chi nhánh. */
  chiNhanhId?: string;
  chuyenKhoaId?: string;
  bacSiId?: string;
  q?: string;
}

interface DoctorRow {
  bacSiId: string;
  hoTen: string;
  trangThai: string;
  chiNhanhId: string;
  chiNhanhTen: string;
  chuyenKhoaId: string;
  chuyenKhoaTen: string;
}

const FROM = `
  FROM bac_si b
  JOIN tai_khoan t ON t.tai_khoan_id = b.tai_khoan_id
  JOIN chi_nhanh cn ON cn.chi_nhanh_id = b.chi_nhanh_id
  JOIN chuyen_khoa ck ON ck.chuyen_khoa_id = b.chuyen_khoa_id`;

/** Truy vấn danh sách bác sĩ trong phạm vi cho Admin (B9); vị từ phạm vi dùng chung với Lễ tân (B8). */
@Injectable()
export class AdminScheduleRepository {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  get manager(): EntityManager {
    return this.db.manager;
  }

  /** Bác sĩ có nằm trong phạm vi không (bỏ qua các bộ lọc khác): để `bacSiId` ngoài phạm vi và không tồn tại cùng ra 404. */
  async existsInScope(
    em: EntityManager,
    bacSiId: string,
    chiNhanhId: string | undefined,
  ): Promise<boolean> {
    const scope = doctorScopePredicate(chiNhanhId);
    const rows: unknown[] = await em.query(
      `SELECT 1 FROM bac_si b WHERE b.tai_khoan_id = ? AND ${scope.sql} LIMIT 1`,
      [bacSiId, ...scope.parameters],
    );
    return rows.length > 0;
  }

  /** SELECT và COUNT dùng CÙNG điều kiện, trước phân trang. Sắp theo tên rồi mã để trang ổn định. */
  async listDoctors(
    em: EntityManager,
    filter: DoctorFilter,
    paging: { pageSize: number; offset: number; page: number },
  ): Promise<Paged<ScheduleDoctor>> {
    const scope = doctorScopePredicate(filter.chiNhanhId);
    const conditions = [scope.sql];
    const parameters: unknown[] = [...scope.parameters];
    if (filter.chuyenKhoaId !== undefined) {
      conditions.push('b.chuyen_khoa_id = ?');
      parameters.push(filter.chuyenKhoaId);
    }
    if (filter.bacSiId !== undefined) {
      conditions.push('b.tai_khoan_id = ?');
      parameters.push(filter.bacSiId);
    }
    if (filter.q !== undefined) {
      const pattern = `%${escapeLikePattern(filter.q)}%`;
      conditions.push(
        "(t.ho_ten LIKE ? ESCAPE '!' OR ck.ten LIKE ? ESCAPE '!')",
      );
      parameters.push(pattern, pattern);
    }
    const where = conditions.join(' AND ');

    const rows: DoctorRow[] = await em.query(
      `SELECT CAST(b.tai_khoan_id AS CHAR) AS bacSiId, t.ho_ten AS hoTen, t.trang_thai AS trangThai,
              CAST(b.chi_nhanh_id AS CHAR) AS chiNhanhId, cn.ten AS chiNhanhTen,
              CAST(b.chuyen_khoa_id AS CHAR) AS chuyenKhoaId, ck.ten AS chuyenKhoaTen
         ${FROM} WHERE ${where}
        ORDER BY t.ho_ten ASC, b.tai_khoan_id ASC LIMIT ? OFFSET ?`,
      [...parameters, paging.pageSize, paging.offset],
    );
    const counts: { total: string | number }[] = await em.query(
      `SELECT COUNT(*) AS total ${FROM} WHERE ${where}`,
      parameters,
    );
    return {
      items: rows.map((row) => ({
        bacSiId: row.bacSiId,
        hoTen: row.hoTen,
        ngungHoatDong: row.trangThai === 'NgungHoatDong',
        chiNhanh: { chiNhanhId: row.chiNhanhId, ten: row.chiNhanhTen },
        chuyenKhoa: { chuyenKhoaId: row.chuyenKhoaId, ten: row.chuyenKhoaTen },
      })),
      total: Number(counts[0]?.total ?? 0),
      page: paging.page,
      pageSize: paging.pageSize,
    };
  }
}
