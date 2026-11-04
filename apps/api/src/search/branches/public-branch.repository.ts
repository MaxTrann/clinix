import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  PUBLIC_DOCTOR_CONDITION,
  PUBLIC_DOCTOR_FROM,
} from '../common/public-doctor.sql.js';
import { runReadOnly } from '../common/read-only-tx.js';
import type { ScheduleRow } from '../common/weekly-schedule.view.js';
import type {
  PublicBranchItem,
  PublicBranchService,
} from './public-branch.dto.js';

// Chỉ SELECT đúng các cột trong danh sách trắng (PLAN 5.5); mọi giá trị người dùng đi qua tham số `?`.
const BRANCH_COLUMNS = `cn.chi_nhanh_id AS chiNhanhId, cn.ten AS ten, cn.dia_chi AS diaChi,
  cn.toa_do_lat AS toaDoLat, cn.toa_do_lng AS toaDoLng`;

export interface PublicBranchDetailRows {
  branch: PublicBranchItem;
  schedule: ScheduleRow[];
  services: PublicBranchService[];
  doctorCount: number;
}

@Injectable()
export class PublicBranchRepository {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  /** Danh sách + tổng trong MỘT giao dịch chỉ đọc để `total` khớp `items` (H6). Mọi chi nhánh đều công khai (Q1). */
  async findPage(
    likePattern: string | null,
    limit: number,
    offset: number,
  ): Promise<{ items: PublicBranchItem[]; total: number }> {
    // Từ khoá khớp tên VÀ địa chỉ (Q3); collation của schema không phân biệt hoa/thường và dấu.
    const where = likePattern
      ? `WHERE (cn.ten LIKE ? ESCAPE '!' OR cn.dia_chi LIKE ? ESCAPE '!')`
      : '';
    const params = likePattern ? [likePattern, likePattern] : [];
    return runReadOnly(this.db, async (manager) => {
      const items = await manager.query<PublicBranchItem[]>(
        `SELECT ${BRANCH_COLUMNS} FROM chi_nhanh cn ${where}
         ORDER BY cn.ten ASC, cn.chi_nhanh_id ASC LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      );
      const counted = await manager.query<{ total: string }[]>(
        `SELECT COUNT(*) AS total FROM chi_nhanh cn ${where}`,
        params,
      );
      return { items, total: Number(counted[0]?.total ?? 0) };
    });
  }

  /** Chi tiết một chi nhánh; `null` nếu không có. Các truy vấn cùng một ảnh chụp dữ liệu. */
  async findDetail(id: string): Promise<PublicBranchDetailRows | null> {
    return runReadOnly(this.db, async (manager) => {
      const branches = await manager.query<PublicBranchItem[]>(
        `SELECT ${BRANCH_COLUMNS} FROM chi_nhanh cn WHERE cn.chi_nhanh_id = ?`,
        [id],
      );
      const branch = branches[0];
      if (!branch) return null;

      // Chỉ đọc lịch ĐANG ÁP DỤNG (chi_nhanh_lich_hoat_dong), không đụng yêu cầu thay đổi đang chờ (H2).
      const schedule = await manager.query<ScheduleRow[]>(
        `SELECT thu_trong_tuan AS thuTrongTuan, hoat_dong AS hoatDong,
                gio_bat_dau_sang AS gioBatDauSang, gio_ket_thuc_sang AS gioKetThucSang,
                gio_bat_dau_chieu AS gioBatDauChieu, gio_ket_thuc_chieu AS gioKetThucChieu
         FROM chi_nhanh_lich_hoat_dong WHERE chi_nhanh_id = ?`,
        [id],
      );
      const services = await manager.query<PublicBranchService[]>(
        `SELECT dv.dich_vu_kham_id AS dichVuKhamId, dv.ten AS ten
         FROM chi_nhanh_dich_vu_kham cndv
         JOIN dich_vu_kham dv ON dv.dich_vu_kham_id = cndv.dich_vu_kham_id
         WHERE cndv.chi_nhanh_id = ? ORDER BY dv.ten ASC, dv.dich_vu_kham_id ASC`,
        [id],
      );
      const counted = await manager.query<{ total: string }[]>(
        `SELECT COUNT(*) AS total FROM ${PUBLIC_DOCTOR_FROM}
         WHERE b.chi_nhanh_id = ? AND ${PUBLIC_DOCTOR_CONDITION}`,
        [id],
      );
      return {
        branch,
        // mysql2 trả TINYINT(1) là 0/1: đổi sang boolean cho view.
        schedule: schedule.map((row) => ({
          ...row,
          hoatDong: Boolean(row.hoatDong),
        })),
        services,
        doctorCount: Number(counted[0]?.total ?? 0),
      };
    });
  }
}
