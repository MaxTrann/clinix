import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { TrangThaiTaiKhoan } from '../auth/entities/enums.js';

// Hồ sơ Lễ tân kèm trạng thái tài khoản; service mới là nơi quyết định có cấp phạm vi hay không.
export type ReceptionProfile = {
  chiNhanhId: string;
  trangThai: TrangThaiTaiKhoan;
};

@Injectable()
export class ReceptionScopeRepository {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  // MỘT câu, theo khoá chính của cả hai bảng. `le_tan` không có cột trạng thái: "đang hoạt động" là của
  // `tai_khoan.trang_thai`, nên JOIN để dịch vụ không phụ thuộc việc JwtAuthGuard đã chạy trước.
  // BIGINT ra chuỗi vì driver TypeORM mặc định `bigNumberStrings: true`.
  async findByAccountId(accountId: string): Promise<ReceptionProfile | null> {
    const rows = await this.db.query<
      { chi_nhanh_id: string; trang_thai: TrangThaiTaiKhoan }[]
    >(
      `SELECT lt.chi_nhanh_id, tk.trang_thai
         FROM le_tan lt
         JOIN tai_khoan tk ON tk.tai_khoan_id = lt.tai_khoan_id
        WHERE lt.tai_khoan_id = ?`,
      [accountId],
    );
    const row = rows[0];
    return row
      ? { chiNhanhId: row.chi_nhanh_id, trangThai: row.trang_thai }
      : null;
  }
}
