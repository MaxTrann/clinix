import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { TopupGateway } from '../../wallet/wallet.constants.js';

// SQL ĐỌC của "Nạp ví chưa cộng" (payment B15; PLAN 5.4 bước 6). Hàng đợi: nạp `ThanhCong` + `ChoDoiSoat` mà lần thử lớn nhất ĐÃ ≥ số lượt của job (job không còn chọn nó: B14
// `findCandidates` chỉ chọn lần thử lớn nhất < số lượt). Phần GHI dùng `ReconcileRepository` và `TopupRepository` (một chỗ, cùng job). Không ghi log: tên, số tiền là dữ liệu cá nhân.

export type AttemptResult = 'ThanhCong' | 'ThatBai' | 'KhongTheXuLy';

export interface UnpostedTopupRow {
  maGiaoDich: string;
  phuongThuc: TopupGateway;
  maGiaoDichCong: string | null;
  hoTen: string;
  soTien: string;
  thoiDiemXacMinh: Date;
  soLanThuTuDong: number;
  ketQuaCuoi: AttemptResult;
  lyDoCuoi: string | null;
}

export interface UnpostedAttemptRow {
  soLanThu: number;
  ketQua: AttemptResult;
  lyDo: string | null;
  nguoiXuLy: string | null;
  thoiDiem: Date;
}

/** Số dòng tối đa mỗi lần đọc hàng đợi `[đề xuất]`: hàng đợi chỉ có giao dịch đã hết lượt tự động nên nhỏ; nhiều hơn thì xử lý bớt rồi tải lại. */
export const UNPOSTED_TOPUP_LIST_LIMIT = 200;

// `ketQuaCuoi`, `lyDoCuoi` = lần thử MỚI NHẤT (số lần lớn nhất): chưa có Quản trị viên xử lý thì là `ThatBai` của job
const QUEUE_SELECT = `
  SELECT CAST(g.giao_dich_thanh_toan_id AS CHAR) AS maGiaoDich,
         g.phuong_thuc AS phuongThuc,
         g.ma_giao_dich_cong AS maGiaoDichCong,
         t.ho_ten AS hoTen,
         CAST(g.so_tien AS CHAR) AS soTien,
         COALESCE(MAX(CASE WHEN a.so_lan_thu = 0 THEN a.thoi_diem END), g.thoi_diem_tao) AS thoiDiemXacMinh,
         SUM(a.so_lan_thu BETWEEN 1 AND ?) AS soLanThuTuDong,
         (SELECT x.ket_qua FROM lan_doi_soat_nap_vi x WHERE x.giao_dich_thanh_toan_id = g.giao_dich_thanh_toan_id ORDER BY x.so_lan_thu DESC LIMIT 1) AS ketQuaCuoi,
         (SELECT x.ly_do FROM lan_doi_soat_nap_vi x WHERE x.giao_dich_thanh_toan_id = g.giao_dich_thanh_toan_id ORDER BY x.so_lan_thu DESC LIMIT 1) AS lyDoCuoi
    FROM giao_dich_thanh_toan g
    JOIN vi_noi_bo v ON v.vi_noi_bo_id = g.vi_noi_bo_id
    JOIN tai_khoan t ON t.tai_khoan_id = v.benh_nhan_id
    JOIN lan_doi_soat_nap_vi a ON a.giao_dich_thanh_toan_id = g.giao_dich_thanh_toan_id
   WHERE g.loai = 'NapVi' AND g.trang_thai = 'ThanhCong' AND g.trang_thai_doi_soat = 'ChoDoiSoat'`;

const QUEUE_GROUP = `
   GROUP BY g.giao_dich_thanh_toan_id, g.phuong_thuc, g.ma_giao_dich_cong, t.ho_ten, g.so_tien, g.thoi_diem_tao
  HAVING MAX(a.so_lan_thu) >= ?`;

type RawRow = Omit<UnpostedTopupRow, 'soLanThuTuDong'> & {
  soLanThuTuDong: number | string;
};

const toRow = (raw: RawRow): UnpostedTopupRow => ({
  ...raw,
  soLanThuTuDong: Number(raw.soLanThuTuDong),
});

@Injectable()
export class AdminUnpostedTopupRepository {
  /** Hàng đợi, cũ trước (theo id). `maxRetries` = số lượt của job. ĐỌC THƯỜNG. */
  async listQueue(
    em: EntityManager,
    maxRetries: number,
  ): Promise<UnpostedTopupRow[]> {
    const rows: RawRow[] = await em.query(
      `${QUEUE_SELECT}${QUEUE_GROUP} ORDER BY g.giao_dich_thanh_toan_id LIMIT ?`,
      [maxRetries, maxRetries, UNPOSTED_TOPUP_LIST_LIMIT],
    );
    return rows.map(toRow);
  }

  /** Một giao dịch nếu nó ĐANG ở hàng đợi, ngược lại `null`. ĐỌC THƯỜNG. */
  async findInQueue(
    em: EntityManager,
    giaoDichId: string,
    maxRetries: number,
  ): Promise<UnpostedTopupRow | null> {
    const rows: RawRow[] = await em.query(
      `${QUEUE_SELECT} AND g.giao_dich_thanh_toan_id = ?${QUEUE_GROUP}`,
      [maxRetries, giaoDichId, maxRetries],
    );
    return rows[0] === undefined ? null : toRow(rows[0]);
  }

  /** Mọi lần thử, theo số lần tăng dần, kèm họ tên Quản trị viên đã xử lý (job ⇒ `null`). */
  async attemptsOf(
    em: EntityManager,
    giaoDichId: string,
  ): Promise<UnpostedAttemptRow[]> {
    const rows: (Omit<UnpostedAttemptRow, 'soLanThu'> & {
      soLanThu: number | string;
    })[] = await em.query(
      `SELECT a.so_lan_thu AS soLanThu, a.ket_qua AS ketQua, a.ly_do AS lyDo, t.ho_ten AS nguoiXuLy, a.thoi_diem AS thoiDiem
         FROM lan_doi_soat_nap_vi a
         LEFT JOIN tai_khoan t ON t.tai_khoan_id = a.nguoi_xu_ly_id
        WHERE a.giao_dich_thanh_toan_id = ?
        ORDER BY a.so_lan_thu`,
      [giaoDichId],
    );
    return rows.map((row) => ({ ...row, soLanThu: Number(row.soLanThu) }));
  }
}
