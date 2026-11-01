import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { escapeLikePattern } from '../../common/paging/like-pattern.js';
import type { Paged } from '../../common/paging/paged.js';
import type {
  BranchListDto,
  BranchScheduleDto,
  CreateBranchDto,
} from './branch.dto.js';

export interface BranchPeriodView {
  batDau: string;
  ketThuc: string;
}

export interface BranchScheduleView {
  thuTrongTuan: number;
  /** null chỉ có thể xuất hiện với hàng chi nhánh cũ chưa khai báo ngày này. */
  hoatDong: boolean | null;
  sang: BranchPeriodView | null;
  chieu: BranchPeriodView | null;
}

export interface BranchServiceView {
  dichVuKhamId: string;
  ten: string;
}

export interface BranchView {
  chiNhanhId: string;
  ten: string;
  diaChi: string;
  toaDoLat: string | null;
  toaDoLng: string | null;
  lichHoatDong: BranchScheduleView[];
  dichVuKham: BranchServiceView[];
  coYeuCauDangMo: boolean;
}

interface BranchRow {
  chiNhanhId: string;
  ten: string;
  diaChi: string;
  toaDoLat: string | null;
  toaDoLng: string | null;
  coYeuCauDangMo: number | string | boolean;
}

interface ScheduleRow {
  chiNhanhId: string;
  thuTrongTuan: number | string;
  hoatDong: number | string | boolean;
  sangBatDau: string | null;
  sangKetThuc: string | null;
  chieuBatDau: string | null;
  chieuKetThuc: string | null;
}

interface ServiceRow {
  chiNhanhId: string;
  dichVuKhamId: string;
  ten: string;
}

const BRANCH_COLUMNS = `
  SELECT CAST(c.chi_nhanh_id AS CHAR) AS chiNhanhId,
         c.ten,
         c.dia_chi AS diaChi,
         CAST(c.toa_do_lat AS CHAR) AS toaDoLat,
         CAST(c.toa_do_lng AS CHAR) AS toaDoLng,
         EXISTS (
           SELECT 1 FROM yeu_cau_thay_doi_chi_nhanh y
           WHERE y.dang_mo_chi_nhanh = c.chi_nhanh_id
         ) AS coYeuCauDangMo
  FROM chi_nhanh c`;

function toPeriod(
  start: string | null,
  end: string | null,
): BranchPeriodView | null {
  if (start === null || end === null) return null;
  return { batDau: start, ketThuc: end };
}

function toBranchView(
  branch: BranchRow,
  schedules: readonly ScheduleRow[],
  services: readonly ServiceRow[],
): BranchView {
  const byDay = new Map(
    schedules.map((row) => [Number(row.thuTrongTuan), row]),
  );
  return {
    chiNhanhId: branch.chiNhanhId,
    ten: branch.ten,
    diaChi: branch.diaChi,
    toaDoLat: branch.toaDoLat,
    toaDoLng: branch.toaDoLng,
    lichHoatDong: Array.from({ length: 7 }, (_, index) => {
      const day = index + 1;
      const row = byDay.get(day);
      return row
        ? {
            thuTrongTuan: day,
            hoatDong: Number(row.hoatDong) === 1,
            sang: toPeriod(row.sangBatDau, row.sangKetThuc),
            chieu: toPeriod(row.chieuBatDau, row.chieuKetThuc),
          }
        : { thuTrongTuan: day, hoatDong: null, sang: null, chieu: null };
    }),
    dichVuKham: services.map(({ dichVuKhamId, ten }) => ({
      dichVuKhamId,
      ten,
    })),
    coYeuCauDangMo: Number(branch.coYeuCauDangMo) === 1,
  };
}

@Injectable()
export class BranchRepository {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  async list(
    input: BranchListDto,
    branchId?: string,
  ): Promise<Paged<BranchView>> {
    const conditions: string[] = [];
    const parameters: unknown[] = [];
    if (branchId !== undefined) {
      conditions.push('c.chi_nhanh_id = ?');
      parameters.push(branchId);
    }
    if (input.q) {
      const pattern = `%${escapeLikePattern(input.q)}%`;
      conditions.push(
        "(c.ten LIKE ? ESCAPE '!' OR c.dia_chi LIKE ? ESCAPE '!')",
      );
      parameters.push(pattern, pattern);
    }
    const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';

    return this.db.transaction('REPEATABLE READ', async (manager) => {
      const branches: BranchRow[] = await manager.query(
        `${BRANCH_COLUMNS}${where} ORDER BY c.ten ASC,c.chi_nhanh_id ASC LIMIT ? OFFSET ?`,
        [...parameters, input.pageSize, input.offset],
      );
      const counts: { total: string | number }[] = await manager.query(
        `SELECT COUNT(*) AS total FROM chi_nhanh c${where}`,
        parameters,
      );
      const ids = branches.map((row) => row.chiNhanhId);
      const [schedules, services] = await this.readRelations(manager, ids);
      const scheduleMap = groupBy(schedules, (row) => row.chiNhanhId);
      const serviceMap = groupBy(services, (row) => row.chiNhanhId);
      return {
        items: branches.map((branch) =>
          toBranchView(
            branch,
            scheduleMap.get(branch.chiNhanhId) ?? [],
            serviceMap.get(branch.chiNhanhId) ?? [],
          ),
        ),
        total: Number(counts[0]!.total),
        page: input.page,
        pageSize: input.pageSize,
      };
    });
  }

  async get(id: string, branchId?: string): Promise<BranchView | null> {
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      const branch = await this.getRow(manager, id, branchId);
      if (!branch) return null;
      const [schedules, services] = await this.readRelations(manager, [id]);
      return toBranchView(branch, schedules, services);
    });
  }

  async getInTransaction(
    manager: EntityManager,
    id: string,
  ): Promise<BranchView | null> {
    const branch = await this.getRow(manager, id);
    if (!branch) return null;
    const [schedules, services] = await this.readRelations(manager, [id]);
    return toBranchView(branch, schedules, services);
  }

  transaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.db.transaction('READ COMMITTED', work);
  }

  async serviceIdsExist(
    manager: EntityManager,
    ids: readonly string[],
  ): Promise<string[]> {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    const rows: { id: string }[] = await manager.query(
      `SELECT CAST(dich_vu_kham_id AS CHAR) AS id FROM dich_vu_kham WHERE dich_vu_kham_id IN (${placeholders})`,
      [...ids],
    );
    return rows.map((row) => row.id);
  }

  async create(
    manager: EntityManager,
    input: CreateBranchDto,
    serviceIds: readonly string[],
  ): Promise<BranchView> {
    await manager.query(
      'INSERT INTO chi_nhanh (ten,dia_chi,toa_do_lat,toa_do_lng) VALUES (?,?,?,?)',
      [input.ten, input.diaChi, input.toaDoLat ?? null, input.toaDoLng ?? null],
    );
    const inserted: { id: string }[] = await manager.query(
      'SELECT CAST(LAST_INSERT_ID() AS CHAR) AS id',
    );
    const id = inserted[0]!.id;

    for (const row of input.lichHoatDong) {
      await this.insertSchedule(manager, id, row);
    }
    for (const serviceId of serviceIds) {
      await manager.query(
        'INSERT INTO chi_nhanh_dich_vu_kham (chi_nhanh_id,dich_vu_kham_id) VALUES (?,?)',
        [id, serviceId],
      );
    }
    const result = await this.getInTransaction(manager, id);
    if (!result)
      throw new Error('Branch vừa tạo không tìm thấy trong transaction');
    return result;
  }

  async insertSchedule(
    manager: EntityManager,
    branchId: string,
    row: BranchScheduleDto,
  ): Promise<void> {
    const morning = row.sang ?? undefined;
    const afternoon = row.chieu ?? undefined;
    await manager.query(
      `INSERT INTO chi_nhanh_lich_hoat_dong
        (chi_nhanh_id,thu_trong_tuan,hoat_dong,gio_bat_dau_sang,gio_ket_thuc_sang,gio_bat_dau_chieu,gio_ket_thuc_chieu)
       VALUES (?,?,?,?,?,?,?)`,
      [
        branchId,
        row.thuTrongTuan,
        row.hoatDong,
        toSqlTime(morning?.batDau),
        toSqlTime(morning?.ketThuc),
        toSqlTime(afternoon?.batDau),
        toSqlTime(afternoon?.ketThuc),
      ],
    );
  }

  private async getRow(
    manager: EntityManager,
    id: string,
    branchId?: string,
  ): Promise<BranchRow | null> {
    const scope = branchId === undefined ? '' : ' AND c.chi_nhanh_id = ?';
    const parameters = branchId === undefined ? [id] : [id, branchId];
    const rows: BranchRow[] = await manager.query(
      `${BRANCH_COLUMNS} WHERE c.chi_nhanh_id = ?${scope}`,
      parameters,
    );
    return rows[0] ?? null;
  }

  private async readRelations(
    manager: EntityManager,
    branchIds: readonly string[],
  ): Promise<[ScheduleRow[], ServiceRow[]]> {
    if (branchIds.length === 0) return [[], []];
    const placeholders = branchIds.map(() => '?').join(',');
    const schedules: ScheduleRow[] = await manager.query(
      `SELECT CAST(chi_nhanh_id AS CHAR) AS chiNhanhId,
              thu_trong_tuan AS thuTrongTuan,
              hoat_dong AS hoatDong,
              TIME_FORMAT(gio_bat_dau_sang,'%H:%i:%s') AS sangBatDau,
              TIME_FORMAT(gio_ket_thuc_sang,'%H:%i:%s') AS sangKetThuc,
              TIME_FORMAT(gio_bat_dau_chieu,'%H:%i:%s') AS chieuBatDau,
              TIME_FORMAT(gio_ket_thuc_chieu,'%H:%i:%s') AS chieuKetThuc
       FROM chi_nhanh_lich_hoat_dong WHERE chi_nhanh_id IN (${placeholders})
       ORDER BY chi_nhanh_id ASC,thu_trong_tuan ASC`,
      [...branchIds],
    );
    const services: ServiceRow[] = await manager.query(
      `SELECT CAST(cd.chi_nhanh_id AS CHAR) AS chiNhanhId,
              CAST(d.dich_vu_kham_id AS CHAR) AS dichVuKhamId,
              d.ten
       FROM chi_nhanh_dich_vu_kham cd
       JOIN dich_vu_kham d ON d.dich_vu_kham_id = cd.dich_vu_kham_id
       WHERE cd.chi_nhanh_id IN (${placeholders})
       ORDER BY d.ten ASC,d.dich_vu_kham_id ASC`,
      [...branchIds],
    );
    return [schedules, services];
  }
}

function groupBy<T>(
  items: readonly T[],
  key: (item: T) => string,
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const groupKey = key(item);
    const group = groups.get(groupKey) ?? [];
    group.push(item);
    groups.set(groupKey, group);
  }
  return groups;
}

function toSqlTime(value: string | undefined): string | null {
  return value === undefined ? null : `${value}:00`;
}
