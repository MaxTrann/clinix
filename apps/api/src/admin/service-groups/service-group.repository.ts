import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { escapeLikePattern } from '../../common/paging/like-pattern.js';
import type { Paged } from '../../common/paging/paged.js';
import type {
  ServiceGroupListDto,
  UpdateServiceGroupDto,
} from './service-group.dto.js';

export interface ServiceGroup {
  nhomDichVuId: string;
  ten: string;
  thuTuHienThi: number;
}
/** Một dòng của DANH SÁCH: thêm số dịch vụ khám thuộc nhóm (POST/PATCH nhóm vẫn trả `ServiceGroup` ba khoá). */
export interface ServiceGroupListItem extends ServiceGroup {
  soDichVu: number;
}
const SELECT_GROUP =
  'SELECT CAST(nhom_dich_vu_id AS CHAR) AS nhomDichVuId,ten,thu_tu_hien_thi AS thuTuHienThi FROM nhom_dich_vu';
// Đếm trong CÙNG câu có LIMIT (không N+1; PR3 admin catalog). LEFT JOIN để nhóm rỗng vẫn có dòng; đếm `d.dich_vu_kham_id`
// chứ không `COUNT(*)` vì nhóm rỗng có một dòng `d` toàn NULL (COUNT(*) ra 1). Chỉ mục `dich_vu_kham_index_nhom_ten` phục vụ phép nối.
const SELECT_GROUP_WITH_COUNT =
  'SELECT CAST(g.nhom_dich_vu_id AS CHAR) AS nhomDichVuId, g.ten, g.thu_tu_hien_thi AS thuTuHienThi, COUNT(d.dich_vu_kham_id) AS soDichVu FROM nhom_dich_vu g LEFT JOIN dich_vu_kham d ON d.nhom_dich_vu_id = g.nhom_dich_vu_id';

@Injectable()
export class ServiceGroupRepository {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  transaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.db.transaction('READ COMMITTED', work);
  }

  list(input: ServiceGroupListDto): Promise<Paged<ServiceGroupListItem>> {
    // Câu items dùng bí danh `g` (có nối bảng), câu total không nối nên giữ tên cột trần.
    const itemsWhere = input.q ? " WHERE g.ten LIKE ? ESCAPE '!'" : '';
    const totalWhere = input.q ? " WHERE ten LIKE ? ESCAPE '!'" : '';
    const parameters = input.q ? [`%${escapeLikePattern(input.q)}%`] : [];
    // items và total cùng snapshot; danh mục chung không lọc chi nhánh.
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      const rows: (ServiceGroup & { soDichVu: string | number })[] =
        await manager.query(
          `${SELECT_GROUP_WITH_COUNT}${itemsWhere} GROUP BY g.nhom_dich_vu_id, g.ten, g.thu_tu_hien_thi ORDER BY g.thu_tu_hien_thi ASC, g.ten ASC, g.nhom_dich_vu_id ASC LIMIT ? OFFSET ?`,
          [...parameters, input.pageSize, input.offset],
        );
      // COUNT là BIGINT nên driver có thể trả chuỗi: ép về số như `total`
      const items = rows.map((row) => ({
        ...row,
        soDichVu: Number(row.soDichVu),
      }));
      const counts: { total: string | number }[] = await manager.query(
        `SELECT COUNT(*) AS total FROM nhom_dich_vu${totalWhere}`,
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

  async get(manager: EntityManager, id: string): Promise<ServiceGroup | null> {
    const rows: ServiceGroup[] = await manager.query(
      `${SELECT_GROUP} WHERE nhom_dich_vu_id=?`,
      [id],
    );
    return rows[0] ?? null;
  }

  async lock(manager: EntityManager, id: string): Promise<boolean> {
    const rows: { id: string }[] = await manager.query(
      'SELECT CAST(nhom_dich_vu_id AS CHAR) AS id FROM nhom_dich_vu WHERE nhom_dich_vu_id=? FOR UPDATE',
      [id],
    );
    return rows.length > 0;
  }

  async nameExists(
    manager: EntityManager,
    name: string,
    exceptId?: string,
  ): Promise<boolean> {
    const rows: { found: number }[] = await manager.query(
      `SELECT 1 AS found FROM nhom_dich_vu WHERE ten=?${exceptId ? ' AND nhom_dich_vu_id<>?' : ''} LIMIT 1`,
      exceptId ? [name, exceptId] : [name],
    );
    return rows.length > 0;
  }

  async hasServices(manager: EntityManager, id: string): Promise<boolean> {
    const rows: { found: number }[] = await manager.query(
      'SELECT 1 AS found FROM dich_vu_kham WHERE nhom_dich_vu_id=? LIMIT 1',
      [id],
    );
    return rows.length > 0;
  }

  async create(
    manager: EntityManager,
    name: string,
    order: number,
  ): Promise<ServiceGroup> {
    await manager.query(
      'INSERT INTO nhom_dich_vu (ten,thu_tu_hien_thi) VALUES (?,?)',
      [name, order],
    );
    // Không dùng insertId dạng number: bigint có thể vượt Number.MAX_SAFE_INTEGER.
    const ids: { id: string }[] = await manager.query(
      'SELECT CAST(LAST_INSERT_ID() AS CHAR) AS id',
    );
    return (await this.get(manager, ids[0]!.id))!;
  }

  async update(
    manager: EntityManager,
    id: string,
    input: UpdateServiceGroupDto,
  ): Promise<ServiceGroup> {
    const fields: string[] = [];
    const parameters: unknown[] = [];
    if (input.ten !== undefined) {
      fields.push('ten=?');
      parameters.push(input.ten);
    }
    if (input.thuTuHienThi !== undefined) {
      fields.push('thu_tu_hien_thi=?');
      parameters.push(input.thuTuHienThi);
    }
    await manager.query(
      `UPDATE nhom_dich_vu SET ${fields.join(',')} WHERE nhom_dich_vu_id=?`,
      [...parameters, id],
    );
    return (await this.get(manager, id))!;
  }

  async remove(manager: EntityManager, id: string): Promise<void> {
    await manager.query('DELETE FROM nhom_dich_vu WHERE nhom_dich_vu_id=?', [
      id,
    ]);
  }
}
