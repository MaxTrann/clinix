import { Injectable } from '@nestjs/common';
import type { EntityManager, QueryDeepPartialEntity } from 'typeorm';
import { NhatKyHanhDong } from '../admin/entities/nhat-ky-hanh-dong.entity.js';
import type { AuditEntry } from './audit-entry.js';

@Injectable()
export class AuditRepository {
  async insert(
    manager: EntityManager,
    entry: AuditEntry,
    at: Date,
  ): Promise<void> {
    await manager.insert(NhatKyHanhDong, {
      taiKhoanId: entry.actorId,
      chiNhanhId: entry.branchId,
      hanhDong: entry.action,
      loaiDoiTuong: entry.targetType,
      maDoiTuong: entry.targetId,
      ketQua: entry.result,
      // QueryDeepPartialEntity<Record<string, unknown>> không mô tả được nested null JSON.
      // Entry đã qua whitelist/copy JSON ở service; cast chỉ tại biên ghi cột JSON.
      chiTietThayDoi:
        entry.changes as unknown as QueryDeepPartialEntity<NhatKyHanhDong>['chiTietThayDoi'],
      thoiDiem: at,
    });
  }
}
