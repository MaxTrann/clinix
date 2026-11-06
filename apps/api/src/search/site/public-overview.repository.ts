import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  PUBLIC_DOCTOR_CONDITION,
  PUBLIC_DOCTOR_FROM,
} from '../common/public-doctor.sql.js';
import { publicServiceCondition } from '../common/public-service.sql.js';
import { runReadOnly } from '../common/read-only-tx.js';
import type { PublicOverview } from './public-overview.dto.js';

type CountRow = { total: string | number };

/**
 * Ba phép đếm trong MỘT giao dịch chỉ đọc (cùng ảnh chụp, H6). Mỗi phép đếm nhúng đúng hằng điều kiện công khai
 * của danh sách tương ứng nên không thể lệch (H5): chuyên khoa đang hoạt động (Q1), bác sĩ công khai (Q13), dịch vụ đang cung cấp (Q10).
 */
@Injectable()
export class PublicOverviewRepository {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  count(): Promise<PublicOverview> {
    return runReadOnly(this.db, async (manager) => {
      const one = async (sql: string): Promise<number> => {
        const rows = await manager.query<CountRow[]>(sql);
        return Number(rows[0]?.total ?? 0);
      };
      return {
        soChuyenKhoa: await one(
          `SELECT COUNT(*) AS total FROM chuyen_khoa WHERE trang_thai_hoat_dong = 'DangHoatDong'`,
        ),
        soBacSi: await one(
          `SELECT COUNT(*) AS total FROM ${PUBLIC_DOCTOR_FROM} WHERE ${PUBLIC_DOCTOR_CONDITION}`,
        ),
        soDichVu: await one(
          `SELECT COUNT(*) AS total FROM dich_vu_kham d WHERE ${publicServiceCondition(false)}`,
        ),
      };
    });
  }
}
