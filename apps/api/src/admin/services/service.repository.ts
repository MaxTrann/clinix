import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { escapeLikePattern } from '../../common/paging/like-pattern.js';
import type { Paged } from '../../common/paging/paged.js';
import type {
  CreateServiceDto,
  ServiceListDto,
  UpdateServiceDto,
} from './service.dto.js';

export interface ServiceItem {
  dichVuKhamId: string;
  nhomDichVuId: string;
  tenNhom: string;
  ten: string;
  thoiLuong: number;
  giaMacDinh: string;
}

export interface LockedService {
  dichVuKhamId: string;
  nhomDichVuId: string;
  ten: string;
  thoiLuong: number;
  giaMacDinh: string;
}

const SELECT_SERVICE =
  'SELECT CAST(s.dich_vu_kham_id AS CHAR) AS dichVuKhamId, CAST(s.nhom_dich_vu_id AS CHAR) AS nhomDichVuId, g.ten AS tenNhom, s.ten, s.thoi_luong AS thoiLuong, CAST(s.gia_mac_dinh AS CHAR) AS giaMacDinh FROM dich_vu_kham s INNER JOIN nhom_dich_vu g ON g.nhom_dich_vu_id=s.nhom_dich_vu_id';

@Injectable()
export class ServiceRepository {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  transaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.db.transaction('READ COMMITTED', work);
  }

  list(input: ServiceListDto): Promise<Paged<ServiceItem>> {
    const where = input.q ? " WHERE s.ten LIKE ? ESCAPE '!'" : '';
    const parameters = input.q ? [`%${escapeLikePattern(input.q)}%`] : [];
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      const items: ServiceItem[] = await manager.query(
        `${SELECT_SERVICE}${where} ORDER BY g.thu_tu_hien_thi ASC,s.ten ASC,s.dich_vu_kham_id ASC LIMIT ? OFFSET ?`,
        [...parameters, input.pageSize, input.offset],
      );
      const counts: { total: string | number }[] = await manager.query(
        `SELECT COUNT(*) AS total FROM dich_vu_kham s${where}`,
        parameters,
      );
      return {
        items,
        total: Number(counts[0]!.total),
        page: input.page,
        pageSize: input.pageSize,
      };
    });
  }

  async get(manager: EntityManager, id: string): Promise<ServiceItem | null> {
    const rows: ServiceItem[] = await manager.query(
      `${SELECT_SERVICE} WHERE s.dich_vu_kham_id=?`,
      [id],
    );
    return rows[0] ?? null;
  }

  getById(id: string): Promise<ServiceItem | null> {
    return this.get(this.db.manager, id);
  }

  async lock(
    manager: EntityManager,
    id: string,
  ): Promise<LockedService | null> {
    const rows: LockedService[] = await manager.query(
      'SELECT CAST(dich_vu_kham_id AS CHAR) AS dichVuKhamId, CAST(nhom_dich_vu_id AS CHAR) AS nhomDichVuId, ten, thoi_luong AS thoiLuong, CAST(gia_mac_dinh AS CHAR) AS giaMacDinh FROM dich_vu_kham WHERE dich_vu_kham_id=? FOR UPDATE',
      [id],
    );
    return rows[0] ?? null;
  }

  async lockGroup(manager: EntityManager, id: string): Promise<boolean> {
    const rows: { id: string }[] = await manager.query(
      'SELECT CAST(nhom_dich_vu_id AS CHAR) AS id FROM nhom_dich_vu WHERE nhom_dich_vu_id=? FOR UPDATE',
      [id],
    );
    return rows.length > 0;
  }

  async nameExists(
    manager: EntityManager,
    groupId: string,
    name: string,
    exceptId?: string,
  ): Promise<boolean> {
    const rows: { found: number }[] = await manager.query(
      `SELECT 1 AS found FROM dich_vu_kham WHERE nhom_dich_vu_id=? AND ten=?${exceptId ? ' AND dich_vu_kham_id<>?' : ''} LIMIT 1`,
      exceptId ? [groupId, name, exceptId] : [groupId, name],
    );
    return rows.length > 0;
  }

  async hasActiveAppointments(
    manager: EntityManager,
    serviceId: string,
  ): Promise<boolean> {
    const rows: { found: number }[] = await manager.query(
      "SELECT 1 AS found FROM lich_hen h INNER JOIN bac_si b ON b.tai_khoan_id=h.bac_si_id WHERE b.dich_vu_kham_id=? AND h.trang_thai IN ('ChoThanhToan','DaXacNhan','DaTiepDon') LIMIT 1",
      [serviceId],
    );
    return rows.length > 0;
  }

  async hasFutureSlots(
    manager: EntityManager,
    serviceId: string,
    now: Date,
  ): Promise<boolean> {
    const rows: { found: number }[] = await manager.query(
      'SELECT 1 AS found FROM bac_si b INNER JOIN lich_lam_viec l ON l.bac_si_id=b.tai_khoan_id INNER JOIN khung_gio k ON k.lich_lam_viec_id=l.lich_lam_viec_id WHERE b.dich_vu_kham_id=? AND k.ngay_gio>? LIMIT 1',
      [serviceId, now],
    );
    return rows.length > 0;
  }

  async create(
    manager: EntityManager,
    input: CreateServiceDto,
    name: string,
  ): Promise<ServiceItem> {
    await manager.query(
      'INSERT INTO dich_vu_kham (nhom_dich_vu_id,ten,thoi_luong,gia_mac_dinh) VALUES (?,?,?,?)',
      [input.nhomDichVuId, name, input.thoiLuong, input.giaMacDinh],
    );
    const ids: { id: string }[] = await manager.query(
      'SELECT CAST(LAST_INSERT_ID() AS CHAR) AS id',
    );
    return (await this.get(manager, ids[0]!.id))!;
  }

  async update(
    manager: EntityManager,
    id: string,
    groupId: string,
    input: UpdateServiceDto,
    name: string,
  ): Promise<ServiceItem> {
    const fields = ['nhom_dich_vu_id=?'];
    const parameters: unknown[] = [groupId];
    if (input.ten !== undefined) {
      fields.push('ten=?');
      parameters.push(name);
    }
    if (input.thoiLuong !== undefined) {
      fields.push('thoi_luong=?');
      parameters.push(input.thoiLuong);
    }
    if (input.giaMacDinh !== undefined) {
      fields.push('gia_mac_dinh=?');
      parameters.push(input.giaMacDinh);
    }
    await manager.query(
      `UPDATE dich_vu_kham SET ${fields.join(',')} WHERE dich_vu_kham_id=?`,
      [...parameters, id],
    );
    return (await this.get(manager, id))!;
  }
}
