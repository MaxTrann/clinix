import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import {
  ACCOUNT_FROM_SQL,
  type SqlCondition,
} from '../accounts/account-visibility.js';
import type { ResendTarget } from './account-resend.types.js';

// Hai câu SQL của "Gửi lại liên kết kích hoạt" (admin B20). Mọi hàm nhận `em` để chạy trong GIAO DỊCH do `ActivationLinkService.transaction` mở.

// Khoá DUY NHẤT hàng `tai_khoan` của đích theo khoá chính (không nối bảng, nên không khoá hàng `bac_si`, `le_tan`, `quan_tri_vien`, `chi_nhanh`).
// Cùng quy ước của cả cụm: `tai_khoan` TRƯỚC, `ma_xac_thuc` SAU (B14, B15, B16). Id không có hàng thì không khoá gì (READ COMMITTED: không khoá khoảng).
export const LOCK_ACCOUNT_SQL =
  'SELECT tai_khoan_id FROM tai_khoan WHERE tai_khoan_id = ? FOR UPDATE';

// Đọc THƯỜNG, chạy SAU khi đã khoá: câu này bắt đầu khi người giữ khoá trước (ví dụ B13 đổi chi nhánh Bác sĩ) đã commit, nên các bảng nối thấy
// chi nhánh mới nhất. `ACCOUNT_FROM_SQL` và điều kiện tầm nhìn là của B17, nên "không tồn tại" và "ngoài tầm nhìn" cùng trả null (MỘT đường mã, Q40).
// Chỉ cột cần dùng: KHÔNG `mat_khau_bam`, KHÔNG đụng `ma_xac_thuc`. Id luôn là tham số.
export const READ_TARGET_SQL = `SELECT CAST(t.tai_khoan_id AS CHAR) AS taiKhoanId, t.loai_tai_khoan AS loaiTaiKhoan, t.trang_thai AS trangThai,
  CAST(cn.chi_nhanh_id AS CHAR) AS chiNhanhId, t.ho_ten AS hoTen, t.email AS email
FROM ${ACCOUNT_FROM_SQL} WHERE t.tai_khoan_id = :id AND `;

// TypeORM đổi `:tên` thành `?`, vì điều kiện tầm nhìn của C1 và B17 dùng tham số có tên. Hàm `bind` của B17 không được xuất và B20 không sửa file B17.
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
export class AccountResendRepository {
  /** Khoá hàng `tai_khoan` của đích. Không trả gì: người gọi đọc lại dữ kiện bằng `findVisible` SAU khi đã giữ khoá. */
  async lockAccount(em: EntityManager, id: string): Promise<void> {
    await em.query(LOCK_ACCOUNT_SQL, [id]);
  }

  /** Đích nếu người gọi THẤY được nó; null nếu không tồn tại hoặc ngoài tầm nhìn. */
  async findVisible(
    em: EntityManager,
    visibility: SqlCondition,
    id: string,
  ): Promise<ResendTarget | null> {
    const [sql, values] = bind(em, `${READ_TARGET_SQL}${visibility.sql}`, {
      ...visibility.parameters,
      id,
    });
    const rows: ResendTarget[] = await em.query(sql, values);
    return rows[0] ?? null;
  }
}
