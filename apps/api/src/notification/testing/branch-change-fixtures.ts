import type { DataSource } from 'typeorm';
import { AdminFixtures } from '../../admin/testing/admin-fixtures.js';

// Dữ liệu tối thiểu cho test của `notification` (admin C4): một chi nhánh, người đề xuất (Quản trị viên Chi nhánh), hai bệnh nhân và một yêu cầu `ChoDuyet`.
// Chỉ ghi DB test (`AdminFixtures` từ chối DB không kết thúc bằng `_test`).
export async function branchChangeWorld(db: DataSource) {
  const fx = new AdminFixtures(db);
  const branch = await fx.branch();
  const proposer = await fx.admin(branch);
  const patientA = await fx.patient();
  const patientB = await fx.patient();
  const result: { insertId: number | string } = await db.query(
    `INSERT INTO yeu_cau_thay_doi_chi_nhanh (chi_nhanh_id, nguoi_de_xuat_id, noi_dung_truoc, noi_dung_sau, trang_thai)
     VALUES (?, ?, JSON_OBJECT('ten', 'Cũ'), JSON_OBJECT('ten', 'Mới'), 'ChoDuyet')`,
    [branch.chiNhanhId, proposer.account.taiKhoanId],
  );
  return {
    yeuCauId: String(result.insertId),
    proposerId: proposer.account.taiKhoanId,
    patientAId: patientA.account.taiKhoanId,
    patientBId: patientB.account.taiKhoanId,
  };
}

export interface ThongBaoRow {
  thongBaoId: string;
  taiKhoanId: string;
  loai: string;
  noiDung: string;
  yeuCauId: string | null;
  trangThaiEmail: string | null;
}

/** Mọi thông báo kèm trạng thái thư (nếu có), theo thứ tự ghi. */
export function readAll(db: DataSource): Promise<ThongBaoRow[]> {
  return db.query(
    `SELECT CAST(t.thong_bao_id AS CHAR) AS thongBaoId, CAST(t.tai_khoan_id AS CHAR) AS taiKhoanId, t.loai_su_kien AS loai, t.noi_dung AS noiDung,
            CAST(t.yeu_cau_thay_doi_chi_nhanh_id AS CHAR) AS yeuCauId, e.trang_thai AS trangThaiEmail
       FROM thong_bao t LEFT JOIN email_thong_bao e ON e.thong_bao_id = t.thong_bao_id
      ORDER BY t.thong_bao_id`,
  );
}
