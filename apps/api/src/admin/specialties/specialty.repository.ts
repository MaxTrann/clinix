import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { escapeLikePattern } from '../../common/paging/like-pattern.js';
import type { Paged } from '../../common/paging/paged.js';
import type { TrangThaiHoatDong } from '../entities/enums.js';
import type { SpecialtyListDto } from './specialty.dto.js';

export interface Specialty {
  chuyenKhoaId: string;
  ten: string;
  moTa: string | null;
  anhDaiDien: string | null;
  trangThaiHoatDong: TrangThaiHoatDong;
  soBacSi: number;
}

type SpecialtyRow = Omit<Specialty, 'soBacSi'> & { soBacSi: string | number };
const SELECT_SPECIALTY = `SELECT CAST(c.chuyen_khoa_id AS CHAR) AS chuyenKhoaId,
  c.ten, c.mo_ta AS moTa, COALESCE(a.secure_url,c.anh_dai_dien) AS anhDaiDien,
  c.trang_thai_hoat_dong AS trangThaiHoatDong,
  (SELECT COUNT(*) FROM bac_si b WHERE b.chuyen_khoa_id=c.chuyen_khoa_id) AS soBacSi
  FROM chuyen_khoa c LEFT JOIN anh_tai_len a ON a.anh_tai_len_id=c.anh_tai_len_id`;

@Injectable()
export class SpecialtyRepository {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  transaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    // Đọc tên thường không khóa gap; UNIQUE chịu trách nhiệm chặn tên trùng khi race.
    return this.db.transaction('READ COMMITTED', work);
  }

  async list(input: SpecialtyListDto): Promise<Paged<Specialty>> {
    const conditions: string[] = [];
    const parameters: unknown[] = [];
    if (input.trangThaiHoatDong !== undefined) {
      conditions.push('c.trang_thai_hoat_dong=?');
      parameters.push(input.trangThaiHoatDong);
    }
    if (input.q) {
      conditions.push("(c.ten LIKE ? ESCAPE '!' OR c.mo_ta LIKE ? ESCAPE '!')");
      const pattern = `%${escapeLikePattern(input.q)}%`;
      parameters.push(pattern, pattern);
    }
    const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
    // Cùng snapshot cho items và total, không nhân số dòng bởi JOIN bác sĩ.
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      const rows: SpecialtyRow[] = await manager.query(
        `${SELECT_SPECIALTY}${where} ORDER BY c.ten ASC,c.chuyen_khoa_id ASC LIMIT ? OFFSET ?`,
        [...parameters, input.pageSize, input.offset],
      );
      const counts: { total: string | number }[] = await manager.query(
        `SELECT COUNT(*) AS total FROM chuyen_khoa c${where}`,
        parameters,
      );
      return {
        items: rows.map((row) => ({ ...row, soBacSi: Number(row.soBacSi) })),
        total: Number(counts[0]!.total),
        page: input.page,
        pageSize: input.pageSize,
      };
    });
  }

  async get(id: string, manager = this.db.manager): Promise<Specialty | null> {
    const rows: SpecialtyRow[] = await manager.query(
      `${SELECT_SPECIALTY} WHERE c.chuyen_khoa_id=?`,
      [id],
    );
    const row = rows[0];
    return row ? { ...row, soBacSi: Number(row.soBacSi) } : null;
  }

  async lock(manager: EntityManager, id: string): Promise<boolean> {
    const rows: { id: string }[] = await manager.query(
      'SELECT CAST(chuyen_khoa_id AS CHAR) AS id FROM chuyen_khoa WHERE chuyen_khoa_id=? FOR UPDATE',
      [id],
    );
    return rows.length > 0;
  }

  async nameExists(manager: EntityManager, name: string, exceptId?: string) {
    const rows: { found: number }[] = await manager.query(
      `SELECT 1 AS found FROM chuyen_khoa WHERE ten=?${exceptId ? ' AND chuyen_khoa_id<>?' : ''} LIMIT 1`,
      exceptId ? [name, exceptId] : [name],
    );
    return rows.length > 0;
  }

  async create(
    manager: EntityManager,
    name: string,
    description: string | null,
  ) {
    await manager.query('INSERT INTO chuyen_khoa (ten,mo_ta) VALUES (?,?)', [
      name,
      description,
    ]);
    // LAST_INSERT_ID trên chính connection của transaction giữ nguyên độ chính xác bigint.
    const ids: { id: string }[] = await manager.query(
      'SELECT CAST(LAST_INSERT_ID() AS CHAR) AS id',
    );
    return ids[0]!.id;
  }

  async update(
    manager: EntityManager,
    id: string,
    input: { ten?: string; moTa?: string | null },
  ): Promise<void> {
    const assignments: string[] = [];
    const parameters: unknown[] = [];
    if (input.ten !== undefined) {
      assignments.push('ten=?');
      parameters.push(input.ten);
    }
    if (input.moTa !== undefined) {
      assignments.push('mo_ta=?');
      parameters.push(input.moTa || null);
    }
    if (assignments.length)
      await manager.query(
        `UPDATE chuyen_khoa SET ${assignments.join(',')} WHERE chuyen_khoa_id=?`,
        [...parameters, id],
      );
  }

  async setStatus(
    manager: EntityManager,
    id: string,
    status: TrangThaiHoatDong,
  ) {
    await manager.query(
      'UPDATE chuyen_khoa SET trang_thai_hoat_dong=? WHERE chuyen_khoa_id=?',
      [status, id],
    );
  }
}
