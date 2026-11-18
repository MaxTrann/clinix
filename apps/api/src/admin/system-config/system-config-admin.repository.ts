import { Inject, Injectable } from '@nestjs/common';
import {
  DataSource,
  type EntityManager,
  type QueryDeepPartialEntity,
} from 'typeorm';
import { CauHinhHeThong } from '../entities/cau-hinh-he-thong.entity.js';
import {
  CONFIG_KEYS,
  CONFIG_PARAMS,
  type ConfigPatch,
} from './system-config-params.js';

// Phần ghi của cấu hình hệ thống (admin B5). Phần ĐỌC dùng chung vẫn là `SystemConfigRepository` của C3 (không đổi).
// Thuộc tính entity trùng khoá của `ConfigPatch`; riêng trọng số là decimal(3,2) nên ghi bằng chuỗi hai chữ số thập phân.
function toEntityValues(
  values: ConfigPatch,
): QueryDeepPartialEntity<CauHinhHeThong> {
  const row: Record<string, unknown> = {};
  for (const key of CONFIG_KEYS) {
    const value = values[key];
    if (value === undefined) continue;
    row[key] =
      typeof value === 'number' && CONFIG_PARAMS[key].rule.kind === 'weight'
        ? value.toFixed(2)
        : value;
  }
  // Chỉ chép các khoá của bảng chuẩn nên khớp thuộc tính entity; ép kiểu ở biên ghi (như audit.repository).
  return row as QueryDeepPartialEntity<CauHinhHeThong>;
}

@Injectable()
export class SystemConfigAdminRepository {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  // READ COMMITTED (như service-group.repository): `SELECT … FOR UPDATE` trên hàng chưa có KHÔNG giữ khoá khoảng trống, nên hai người tạo lần đầu
  // cùng lúc không deadlock chéo nhau; người thua nhận 1062 ở INSERT và service chạy lại (admin B5 TRACKING 9A.1 mục 2.4).
  transaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.db.transaction('READ COMMITTED', work);
  }

  /** Khoá hàng `id = 1` để ghi; null nếu chưa có dòng. Người sửa sau chờ tới khi người trước commit, rồi đọc giá trị đã commit. */
  lockRow(manager: EntityManager): Promise<CauHinhHeThong | null> {
    return manager
      .createQueryBuilder(CauHinhHeThong, 'c')
      .setLock('pessimistic_write')
      .where('c.id = :id', { id: 1 })
      .getOne();
  }

  /** Tạo dòng `id = 1`; cột vắng trong `values` thì DB điền DEFAULT. */
  async insertRow(manager: EntityManager, values: ConfigPatch): Promise<void> {
    await manager.insert(CauHinhHeThong, { id: 1, ...toEntityValues(values) });
  }

  /** Sửa đúng các cột có trong `values`. */
  async updateRow(manager: EntityManager, values: ConfigPatch): Promise<void> {
    await manager.update(CauHinhHeThong, { id: 1 }, toEntityValues(values));
  }

  /** Đọc lại dòng trong cùng giao dịch (thấy chính thay đổi vừa ghi). */
  reload(manager: EntityManager): Promise<CauHinhHeThong> {
    return manager.findOneByOrFail(CauHinhHeThong, { id: 1 });
  }
}
