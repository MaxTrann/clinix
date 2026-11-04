import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  PUBLIC_DOCTOR_CONDITION,
  PUBLIC_DOCTOR_FROM,
} from '../common/public-doctor.sql.js';
import { runReadOnly } from '../common/read-only-tx.js';
import type { PublicSpecialtyItem } from './public-specialty.dto.js';

type SpecialtyRow = Omit<PublicSpecialtyItem, 'soBacSi'> & {
  soBacSi: string | number;
};

/**
 * Truy vấn trong: chỉ chuyên khoa đang hoạt động (Q1), kèm số bác sĩ công khai. Đếm bằng đúng `PUBLIC_DOCTOR_CONDITION`
 * (H5) nên khớp danh sách bác sĩ; có `chiNhanhId` thì chỉ đếm bác sĩ ở chi nhánh đó (Q5).
 * Ảnh: `COALESCE(secure_url, URL cũ)` như API admin. Bảng ngoài dùng alias `c`/`a`, bảng trong `b`/`t`/`ck` nên không đụng nhau.
 */
function innerSelect(extraWhere: string, branchFilter: boolean): string {
  return `SELECT c.chuyen_khoa_id AS chuyenKhoaId, c.ten AS ten, c.mo_ta AS moTa,
      COALESCE(a.secure_url, c.anh_dai_dien) AS anhDaiDien,
      (SELECT COUNT(*) FROM ${PUBLIC_DOCTOR_FROM}
        WHERE b.chuyen_khoa_id = c.chuyen_khoa_id
          ${branchFilter ? 'AND b.chi_nhanh_id = ?' : ''}
          AND ${PUBLIC_DOCTOR_CONDITION}) AS soBacSi
    FROM chuyen_khoa c
    LEFT JOIN anh_tai_len a ON a.anh_tai_len_id = c.anh_tai_len_id
    WHERE c.trang_thai_hoat_dong = 'DangHoatDong' ${extraWhere}`;
}

function toItem(row: SpecialtyRow): PublicSpecialtyItem {
  return {
    chuyenKhoaId: row.chuyenKhoaId,
    ten: row.ten,
    moTa: row.moTa ?? null,
    anhDaiDien: row.anhDaiDien ?? null,
    soBacSi: Number(row.soBacSi),
  };
}

@Injectable()
export class PublicSpecialtyRepository {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  /**
   * Danh sách + tổng + `soCoBacSi` trong MỘT giao dịch chỉ đọc (H6). Có `branchId` ⇒ chỉ giữ chuyên khoa có ≥ 1 bác sĩ
   * công khai tại chi nhánh đó; không có ⇒ mọi chuyên khoa đang hoạt động, kể cả 0 bác sĩ (Q5).
   */
  async findPage(
    likePattern: string | null,
    branchId: string | null,
    limit: number,
    offset: number,
  ): Promise<{
    items: PublicSpecialtyItem[];
    total: number;
    soCoBacSi: number;
  }> {
    const keyword = likePattern
      ? `AND (c.ten LIKE ? ESCAPE '!' OR c.mo_ta LIKE ? ESCAPE '!')`
      : '';
    // Thứ tự tham số khớp thứ tự dấu `?`: chi nhánh (trong SELECT) trước, từ khoá (trong WHERE) sau.
    const params = [
      ...(branchId ? [branchId] : []),
      ...(likePattern ? [likePattern, likePattern] : []),
    ];
    const inner = innerSelect(keyword, branchId !== null);
    const outerWhere = branchId ? 'WHERE s.soBacSi >= 1' : '';
    return runReadOnly(this.db, async (manager) => {
      const rows = await manager.query<SpecialtyRow[]>(
        `SELECT s.* FROM (${inner}) s ${outerWhere}
         ORDER BY s.ten ASC, s.chuyenKhoaId ASC LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      );
      const counted = await manager.query<
        { total: string; soCoBacSi: string | null }[]
      >(
        `SELECT COUNT(*) AS total, SUM(s.soBacSi >= 1) AS soCoBacSi
         FROM (${inner}) s ${outerWhere}`,
        params,
      );
      return {
        items: rows.map(toItem),
        total: Number(counted[0]?.total ?? 0),
        soCoBacSi: Number(counted[0]?.soCoBacSi ?? 0),
      };
    });
  }

  /** Chi tiết; `null` nếu không có hoặc chuyên khoa đã ngừng (404 ở service). */
  async findDetail(
    id: string,
    branchId: string | null,
  ): Promise<PublicSpecialtyItem | null> {
    const inner = innerSelect('AND c.chuyen_khoa_id = ?', branchId !== null);
    const params = [...(branchId ? [branchId] : []), id];
    return runReadOnly(this.db, async (manager) => {
      const rows = await manager.query<SpecialtyRow[]>(
        `SELECT s.* FROM (${inner}) s`,
        params,
      );
      return rows[0] ? toItem(rows[0]) : null;
    });
  }
}
