import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';

// SQL của job đối soát nạp ví (payment B14; PLAN 5.4 bước 5, Q9). Bảng lần thử `lan_doi_soat_nap_vi` chỉ THÊM, không sửa: `so_lan_thu` 0 = lần cộng đầu lỗi lúc xác minh IPN (B4),
// 1 đến 3 = job, từ 4 = Quản trị viên (B15). Không `NOW()`: giờ do người gọi truyền (QTT-08). Không ghi log: id ví, số tiền là dữ liệu cá nhân.

@Injectable()
export class ReconcileRepository {
  /**
   * Ứng viên của một lô, tăng dần theo id (con trỏ `afterId`): nạp `ThanhCong` + `ChoDoiSoat`, lần thử lớn nhất còn NHỎ HƠN `maxRetries` (chưa đủ lượt job và chưa có Quản trị viên xử lý),
   * lần ghi gần nhất `<= before` (đúng bằng mốc 5 phút thì ĐƯỢC thử). Không có dòng lần thử nào (dữ liệu dựng tay) ⇒ tính từ `thoi_diem_tao`. ĐỌC THƯỜNG: trạng thái thật kiểm lại dưới khoá.
   * Lọc bằng chỉ mục `(trang_thai_doi_soat)` rồi chỉ mục UNIQUE `(giao_dich_thanh_toan_id, so_lan_thu)` của bảng lần thử.
   */
  async findCandidates(
    em: EntityManager,
    input: { before: Date; maxRetries: number; afterId: string; limit: number },
  ): Promise<string[]> {
    const rows: { id: string }[] = await em.query(
      `SELECT CAST(g.giao_dich_thanh_toan_id AS CHAR) AS id
         FROM giao_dich_thanh_toan g
         LEFT JOIN lan_doi_soat_nap_vi a ON a.giao_dich_thanh_toan_id = g.giao_dich_thanh_toan_id
        WHERE g.trang_thai_doi_soat = 'ChoDoiSoat' AND g.trang_thai = 'ThanhCong' AND g.loai = 'NapVi'
          AND g.giao_dich_thanh_toan_id > ?
        GROUP BY g.giao_dich_thanh_toan_id, g.thoi_diem_tao
       HAVING COALESCE(MAX(a.so_lan_thu), -1) < ? AND COALESCE(MAX(a.thoi_diem), g.thoi_diem_tao) <= ?
        ORDER BY g.giao_dich_thanh_toan_id
        LIMIT ?`,
      [input.afterId, input.maxRetries, input.before, input.limit],
    );
    return rows.map((row) => row.id);
  }

  /**
   * Lần thử lớn nhất đã ghi: số lần (−1 nếu chưa có) và thời điểm của nó (`null` nếu chưa có). Gọi DƯỚI khoá 7a của dòng nạp để số lần thử kế tiếp không trùng
   * và để biết bản job khác vừa ghi hay chưa.
   */
  async lastAttempt(
    em: EntityManager,
    giaoDichId: string,
  ): Promise<{ n: number; thoiDiem: Date | null }> {
    const rows: { n: number | string; thoiDiem: Date }[] = await em.query(
      `SELECT so_lan_thu AS n, thoi_diem AS thoiDiem FROM lan_doi_soat_nap_vi
        WHERE giao_dich_thanh_toan_id = ? ORDER BY so_lan_thu DESC LIMIT 1`,
      [giaoDichId],
    );
    const row = rows[0];
    return row === undefined
      ? { n: -1, thoiDiem: null }
      : { n: Number(row.n), thoiDiem: row.thoiDiem };
  }

  /**
   * Một lần thử: của job (`nguoiXuLyId` vắng ⇒ NULL) hay của Quản trị viên (B15: `ThanhCong` khi cộng ví, `KhongTheXuLy` kèm lý do). UNIQUE `(giao dịch, so_lan_thu)` là lưới thứ hai
   * chống hai bên ghi trùng số lần (M14); người gọi lấy số kế tiếp DƯỚI khoá 7a.
   */
  async insertAttempt(
    em: EntityManager,
    input: {
      giaoDichId: string;
      soLanThu: number;
      ketQua: 'ThanhCong' | 'ThatBai' | 'KhongTheXuLy';
      lyDo: string | null;
      now: Date;
      nguoiXuLyId?: string;
    },
  ): Promise<void> {
    await em.query(
      `INSERT INTO lan_doi_soat_nap_vi (giao_dich_thanh_toan_id, so_lan_thu, ket_qua, nguoi_xu_ly_id, ly_do, thoi_diem)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        input.giaoDichId,
        input.soLanThu,
        input.ketQua,
        input.nguoiXuLyId ?? null,
        input.lyDo,
        input.now,
      ],
    );
  }

  /** Đánh dấu đã đối soát xong (đã cộng, hay đã có dòng `Nap` từ trước: A8). */
  async markReconciled(em: EntityManager, giaoDichId: string): Promise<void> {
    await em.query(
      "UPDATE giao_dich_thanh_toan SET trang_thai_doi_soat = 'DaDoiSoat' WHERE giao_dich_thanh_toan_id = ?",
      [giaoDichId],
    );
  }

  /** Quản trị viên `ToanHeThong` đang hoạt động: người nhận `NapViCanXuLy` (PLAN 5.12). */
  async findSystemAdmins(em: EntityManager): Promise<string[]> {
    const rows: { id: string }[] = await em.query(
      `SELECT CAST(q.tai_khoan_id AS CHAR) AS id
         FROM quan_tri_vien q JOIN tai_khoan t ON t.tai_khoan_id = q.tai_khoan_id
        WHERE t.trang_thai = 'DangHoatDong' AND q.pham_vi_quan_tri = 'ToanHeThong'
        ORDER BY q.tai_khoan_id`,
    );
    return rows.map((row) => row.id);
  }
}
