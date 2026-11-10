import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  PUBLIC_DOCTOR_CONDITION,
  PUBLIC_DOCTOR_FROM,
} from '../common/public-doctor.sql.js';
import { publicServiceCondition } from '../common/public-service.sql.js';
import { runReadOnly } from '../../common/transaction/read-only-tx.js';
import type {
  PublicServiceGroupItem,
  PublicServiceItem,
} from './public-service.dto.js';

type GroupRow = {
  nhomDichVuId: string;
  ten: string;
  soDichVu: string | number;
  giaTu: string | null;
};

type ServiceRow = {
  dichVuKhamId: string;
  ten: string;
  nhomId: string;
  nhomTen: string;
  thoiLuong: number;
  giaMacDinh: string;
  mucDatCoc: string;
  soBacSi: string | number;
};

@Injectable()
export class PublicServiceRepository {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  /**
   * Mọi nhóm (kể cả nhóm chưa có dịch vụ — hiện "Sắp triển khai"), kèm số dịch vụ đang cung cấp và giá mặc định nhỏ nhất.
   * Điều kiện "đang cung cấp" nằm ở ON của LEFT JOIN để nhóm rỗng vẫn có dòng (COUNT = 0, MIN = NULL).
   * Sắp `thu_tu_hien_thi`, rồi tên, rồi id để thứ tự ổn định.
   */
  async findGroups(branchId: string | null): Promise<PublicServiceGroupItem[]> {
    return runReadOnly(this.db, async (manager) => {
      const rows = await manager.query<GroupRow[]>(
        `SELECT g.nhom_dich_vu_id AS nhomDichVuId, g.ten AS ten,
            COUNT(d.dich_vu_kham_id) AS soDichVu, MIN(d.gia_mac_dinh) AS giaTu
         FROM nhom_dich_vu g
         LEFT JOIN dich_vu_kham d
           ON d.nhom_dich_vu_id = g.nhom_dich_vu_id
          AND ${publicServiceCondition(branchId !== null)}
         GROUP BY g.nhom_dich_vu_id, g.ten, g.thu_tu_hien_thi
         ORDER BY g.thu_tu_hien_thi ASC, g.ten ASC, g.nhom_dich_vu_id ASC`,
        branchId ? [branchId] : [],
      );
      return rows.map((row) => {
        const soDichVu = Number(row.soDichVu);
        return {
          nhomDichVuId: row.nhomDichVuId,
          ten: row.ten,
          soDichVu,
          giaTu: row.giaTu ?? null,
          sapTrienKhai: soDichVu === 0,
        };
      });
    });
  }

  /**
   * Dịch vụ đang cung cấp (theo nhóm và/hoặc chi nhánh nếu có). `soBacSi` đếm bằng đúng `PUBLIC_DOCTOR_CONDITION` (H5),
   * theo chi nhánh nếu có lọc. Thứ tự tham số khớp thứ tự dấu `?`: chi nhánh (đếm bác sĩ), chi nhánh (đang cung cấp), nhóm.
   */
  async findServices(
    branchId: string | null,
    groupId: string | null,
  ): Promise<PublicServiceItem[]> {
    const params = [
      ...(branchId ? [branchId, branchId] : []),
      ...(groupId ? [groupId] : []),
    ];
    return runReadOnly(this.db, async (manager) => {
      const rows = await manager.query<ServiceRow[]>(
        `SELECT d.dich_vu_kham_id AS dichVuKhamId, d.ten AS ten,
            g.nhom_dich_vu_id AS nhomId, g.ten AS nhomTen,
            d.thoi_luong AS thoiLuong, d.gia_mac_dinh AS giaMacDinh, d.muc_dat_coc AS mucDatCoc,
            (SELECT COUNT(*) FROM ${PUBLIC_DOCTOR_FROM}
              WHERE b.dich_vu_kham_id = d.dich_vu_kham_id
                ${branchId ? 'AND b.chi_nhanh_id = ?' : ''}
                AND ${PUBLIC_DOCTOR_CONDITION}) AS soBacSi
         FROM dich_vu_kham d
         JOIN nhom_dich_vu g ON g.nhom_dich_vu_id = d.nhom_dich_vu_id
         WHERE ${publicServiceCondition(branchId !== null)}
           ${groupId ? 'AND d.nhom_dich_vu_id = ?' : ''}
         ORDER BY g.thu_tu_hien_thi ASC, g.ten ASC, d.ten ASC, d.dich_vu_kham_id ASC`,
        params,
      );
      return rows.map((row) => ({
        dichVuKhamId: row.dichVuKhamId,
        ten: row.ten,
        nhomDichVu: { id: row.nhomId, ten: row.nhomTen },
        thoiLuong: Number(row.thoiLuong),
        giaMacDinh: row.giaMacDinh,
        mucDatCoc: row.mucDatCoc,
        soBacSi: Number(row.soBacSi),
      }));
    });
  }
}
