import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import type { RefundTier } from './policy.rules.js';

// Truy cập DB của cấu hình chính sách cọc (payment B10). Mọi hàm ghi nhận `EntityManager` của giao dịch do service mở. Ghi `dich_vu_kham` bằng MỘT câu `UPDATE` hẹp (chỉ cột `muc_dat_coc`; không đi qua entity
// `DichVuKham` của admin, DV-18). Id BIGINT và tiền là CHUỖI (CAST AS CHAR): không đi qua `number`.

export interface LockedPolicyService {
  dichVuKhamId: string;
  /** `gia_mac_dinh` đọc DƯỚI khoá X của hàng: cọc phải ≤ số này (4.7 #1) */
  giaMacDinh: string;
  mucDatCoc: string;
}

export interface PolicyServiceItem {
  dichVuKhamId: string;
  ten: string;
  giaMacDinh: string;
  mucDatCoc: string;
  /** Đã cấu hình cọc hoặc mốc hoàn (khác "Mặc định" của Figma `553:2`) */
  coChinhSachRieng: boolean;
}

export interface PolicyServiceGroup {
  nhomDichVuId: string;
  ten: string;
  dichVu: PolicyServiceItem[];
}

interface ServiceRow {
  nhomDichVuId: string;
  tenNhom: string;
  dichVuKhamId: string;
  ten: string;
  giaMacDinh: string;
  mucDatCoc: string;
  coChinhSachRieng: number | string;
}

@Injectable()
export class PaymentPolicyRepository {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  /** READ COMMITTED như `ServiceRepository`: booking đọc `moc_hoan_tien` cùng mức nên chỉ thấy bản đã commit (M15). */
  transaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.db.transaction('READ COMMITTED', work);
  }

  /** Một ảnh chụp nhất quán cho hai lần đọc (dịch vụ rồi mốc) của route GET. */
  snapshot<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.db.transaction('REPEATABLE READ', work);
  }

  /** Khoá X hàng dịch vụ (cùng khoá với `ServiceRepository.lock` của admin) và đọc giá, cọc hiện hành. Không có hàng ⇒ `null`. */
  async lockService(
    manager: EntityManager,
    id: string,
  ): Promise<LockedPolicyService | null> {
    const rows: LockedPolicyService[] = await manager.query(
      'SELECT CAST(dich_vu_kham_id AS CHAR) AS dichVuKhamId, CAST(gia_mac_dinh AS CHAR) AS giaMacDinh, CAST(muc_dat_coc AS CHAR) AS mucDatCoc FROM dich_vu_kham WHERE dich_vu_kham_id=? FOR UPDATE',
      [id],
    );
    return rows[0] ?? null;
  }

  /** Đọc không khoá (route GET). */
  async findService(
    manager: EntityManager,
    id: string,
  ): Promise<LockedPolicyService | null> {
    const rows: LockedPolicyService[] = await manager.query(
      'SELECT CAST(dich_vu_kham_id AS CHAR) AS dichVuKhamId, CAST(gia_mac_dinh AS CHAR) AS giaMacDinh, CAST(muc_dat_coc AS CHAR) AS mucDatCoc FROM dich_vu_kham WHERE dich_vu_kham_id=?',
      [id],
    );
    return rows[0] ?? null;
  }

  /** Mốc của dịch vụ, GIỜ GIẢM DẦN (mốc xa giờ hẹn trước). */
  async listTiers(manager: EntityManager, id: string): Promise<RefundTier[]> {
    return manager.query(
      'SELECT so_gio_truoc_toi_thieu AS soGioTruocToiThieu, ty_le_hoan AS tyLeHoan FROM moc_hoan_tien WHERE dich_vu_kham_id=? ORDER BY so_gio_truoc_toi_thieu DESC',
      [id],
    );
  }

  /** Dịch vụ theo nhóm (nhóm theo `thu_tu_hien_thi`, dịch vụ theo tên), kèm cọc và cờ chính sách riêng. */
  async listGrouped(manager: EntityManager): Promise<PolicyServiceGroup[]> {
    const rows: ServiceRow[] = await manager.query(
      `SELECT CAST(g.nhom_dich_vu_id AS CHAR) AS nhomDichVuId, g.ten AS tenNhom, CAST(s.dich_vu_kham_id AS CHAR) AS dichVuKhamId, s.ten,
CAST(s.gia_mac_dinh AS CHAR) AS giaMacDinh, CAST(s.muc_dat_coc AS CHAR) AS mucDatCoc,
(s.muc_dat_coc > 0 OR EXISTS (SELECT 1 FROM moc_hoan_tien m WHERE m.dich_vu_kham_id = s.dich_vu_kham_id)) AS coChinhSachRieng
FROM dich_vu_kham s INNER JOIN nhom_dich_vu g ON g.nhom_dich_vu_id = s.nhom_dich_vu_id
ORDER BY g.thu_tu_hien_thi ASC, g.nhom_dich_vu_id ASC, s.ten ASC, s.dich_vu_kham_id ASC`,
    );
    const groups: PolicyServiceGroup[] = [];
    for (const row of rows) {
      let group = groups.at(-1);
      if (group?.nhomDichVuId !== row.nhomDichVuId) {
        group = {
          nhomDichVuId: row.nhomDichVuId,
          ten: row.tenNhom,
          dichVu: [],
        };
        groups.push(group);
      }
      group.dichVu.push({
        dichVuKhamId: row.dichVuKhamId,
        ten: row.ten,
        giaMacDinh: row.giaMacDinh,
        mucDatCoc: row.mucDatCoc,
        coChinhSachRieng: Number(row.coChinhSachRieng) === 1,
      });
    }
    return groups;
  }

  /** Câu `UPDATE` hẹp: chỉ `muc_dat_coc`, đúng một dịch vụ (CSD-17). Gọi SAU khi đã khoá hàng. */
  async updateDeposit(
    manager: EntityManager,
    id: string,
    mucDatCoc: string,
  ): Promise<void> {
    await manager.query(
      'UPDATE dich_vu_kham SET muc_dat_coc=? WHERE dich_vu_kham_id=?',
      [mucDatCoc, id],
    );
  }

  /** Thay TOÀN BỘ mốc của dịch vụ: xoá hết rồi chèn mới (cùng giao dịch với `updateDeposit`). Mảng rỗng chỉ xoá (cọc > 0 mà không hoàn). */
  async replaceTiers(
    manager: EntityManager,
    id: string,
    tiers: readonly RefundTier[],
  ): Promise<void> {
    await manager.query('DELETE FROM moc_hoan_tien WHERE dich_vu_kham_id=?', [
      id,
    ]);
    if (tiers.length === 0) return;
    await manager.query(
      `INSERT INTO moc_hoan_tien (dich_vu_kham_id, so_gio_truoc_toi_thieu, ty_le_hoan) VALUES ${tiers.map(() => '(?,?,?)').join(',')}`,
      tiers.flatMap((tier) => [id, tier.soGioTruocToiThieu, tier.tyLeHoan]),
    );
  }
}
