import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';

// Câu đọc của việc đẩy tin (chat B5; PLAN chat 5.7 "Máy chủ → client"). Người nhận tính TỪ DB lúc đẩy, không cache: Lễ tân đổi chi nhánh hay bị khoá thì
// tin sau không tới nữa (SOC-10). Chỉ đọc, chạy ngoài giao dịch (sau commit).

// Lễ tân ĐANG HOẠT ĐỘNG của chi nhánh (hộp thư chung). `le_tan.chi_nhanh_id` có chỉ mục của khoá ngoại; `tai_khoan` theo khoá chính.
const ACTIVE_RECEPTIONISTS_SQL = `SELECT lt.tai_khoan_id AS taiKhoanId
FROM le_tan lt
JOIN tai_khoan tk ON tk.tai_khoan_id = lt.tai_khoan_id
WHERE lt.chi_nhanh_id = ? AND tk.trang_thai = 'DangHoatDong'`;

const BRANCH_NAME_SQL = 'SELECT ten FROM chi_nhanh WHERE chi_nhanh_id = ?';

@Injectable()
export class ChatRecipientsRepository {
  async activeReceptionists(
    em: EntityManager,
    chiNhanhId: string,
  ): Promise<string[]> {
    const rows = await em.query<{ taiKhoanId: unknown }[]>(
      ACTIVE_RECEPTIONISTS_SQL,
      [chiNhanhId],
    );
    return rows.map((r) => String(r.taiKhoanId));
  }

  /** Tên chi nhánh: Bệnh nhân thấy tin của Lễ tân là "Lễ tân · {tên chi nhánh}" (Q18). */
  async branchName(
    em: EntityManager,
    chiNhanhId: string,
  ): Promise<string | null> {
    const rows = await em.query<{ ten: unknown }[]>(BRANCH_NAME_SQL, [
      chiNhanhId,
    ]);
    const ten = rows[0]?.ten;
    return typeof ten === 'string' ? ten : null;
  }
}
