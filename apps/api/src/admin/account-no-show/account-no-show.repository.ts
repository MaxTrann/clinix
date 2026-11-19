import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import type { LoaiTaiKhoan } from '../../auth/entities/enums.js';
import {
  ACCOUNT_FROM_SQL,
  type SqlCondition,
} from '../accounts/account-visibility.js';

/** Số lần no-show và cờ khoá đặt lịch của MỘT Bệnh nhân, đọc DƯỚI KHOÁ. */
export interface NoShowCounter {
  /** `khoa_dat_lich_do_no_show` */
  khoa: boolean;
  /** `so_lan_no_show` */
  soLan: number;
}

interface RawCounter {
  khoa: number | boolean;
  soLan: number | string;
}

// Đọc THƯỜNG (không khoá): chỉ cần biết "có thấy được không" và "loại gì". `ACCOUNT_FROM_SQL` và điều kiện tầm nhìn là của B17,
// nên "không tồn tại" và "ngoài tầm nhìn" cùng trả null (MỘT đường mã, Q40). Id luôn là tham số.
const READ_TARGET_SQL = `SELECT t.loai_tai_khoan AS loaiTaiKhoan FROM ${ACCOUNT_FROM_SQL} WHERE t.tai_khoan_id = :id AND `;

// Khoá hàng `benh_nhan` (tầng 2 của PLAN booking 5.3), đọc giá trị mới nhất đã commit. KHÔNG khoá `tai_khoan` của Bệnh nhân.
export const LOCK_COUNTER_SQL = `SELECT khoa_dat_lich_do_no_show AS khoa, so_lan_no_show AS soLan
FROM benh_nhan WHERE tai_khoan_id = ? FOR UPDATE`;

// Đúng MỘT cột. `so_lan_no_show` và `trang_thai` không bao giờ nằm trong câu này (TK hậu điều kiện, Q31).
// `AND khoa_dat_lich_do_no_show = 1` là lưới an toàn: đúng 1 hàng bị ảnh hưởng nghĩa là cờ vừa chuyển từ bật sang tắt.
export const CLEAR_FLAG_SQL = `UPDATE benh_nhan SET khoa_dat_lich_do_no_show = 0
WHERE tai_khoan_id = ? AND khoa_dat_lich_do_no_show = 1`;

// TypeORM đổi `:tên` thành `?`, vì điều kiện tầm nhìn của C1 và B17 dùng tham số có tên.
function bind(
  manager: EntityManager,
  sql: string,
  parameters: Record<string, unknown>,
): [string, unknown[]] {
  return manager.connection.driver.escapeQueryWithParameters(
    sql,
    parameters,
  ) as [string, unknown[]];
}

@Injectable()
export class AccountNoShowRepository {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  // READ COMMITTED: `SELECT … FOR UPDATE` trên hàng `benh_nhan` CHƯA có (Bệnh nhân chưa xác minh OTP) không giữ khoá khoảng,
  // nên không chặn `INSERT benh_nhan` của bước xác minh OTP đang chạy song song; ở REPEATABLE READ thì có (TRACKING 9A.10 mục 2.4).
  transaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.db.transaction('READ COMMITTED', work);
  }

  /** Loại của tài khoản nếu người gọi THẤY được nó; null nếu không tồn tại hoặc ngoài tầm nhìn. */
  async findVisibleKind(
    manager: EntityManager,
    visibility: SqlCondition,
    id: string,
  ): Promise<LoaiTaiKhoan | null> {
    const [sql, values] = bind(manager, `${READ_TARGET_SQL}${visibility.sql}`, {
      ...visibility.parameters,
      id,
    });
    const rows: { loaiTaiKhoan: LoaiTaiKhoan }[] = await manager.query(
      sql,
      values,
    );
    return rows[0]?.loaiTaiKhoan ?? null;
  }

  /** `FOR UPDATE` theo khoá chính; null nếu tài khoản không có dòng `benh_nhan`. */
  async lockCounter(
    manager: EntityManager,
    id: string,
  ): Promise<NoShowCounter | null> {
    const rows: RawCounter[] = await manager.query(LOCK_COUNTER_SQL, [id]);
    const row = rows[0];
    return row === undefined
      ? null
      : { khoa: Number(row.khoa) === 1, soLan: Number(row.soLan) };
  }

  /** Tắt cờ. `true` khi đúng 1 hàng bị ảnh hưởng (cờ vừa chuyển từ bật sang tắt). */
  async clearFlag(manager: EntityManager, id: string): Promise<boolean> {
    const result: { affectedRows?: number } = await manager.query(
      CLEAR_FLAG_SQL,
      [id],
    );
    return result.affectedRows === 1;
  }
}
