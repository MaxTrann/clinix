import type { EntityManager } from 'typeorm';
import { duplicateKeyOf } from '../create/duplicate-key.js';

// NƠI DUY NHẤT booking ghi `thong_bao` và `email_thong_bao` lúc có sự kiện (task B15; PLAN booking 5.12; AR-06 `INSERT INTO thong_bao`, `INSERT INTO email_thong_bao`: chỉ `appointments/notifications/`).
// `UPDATE email_thong_bao` (kết quả gửi) là của `email-outbox.query.ts` ở giai đoạn sau, cũng trong thư mục này.

/** Tên chỉ mục UNIQUE `(lich_hen_id, tai_khoan_id, loai_su_kien)` của P7 (docs/database; migration `thong-bao-lich-hen`). */
export const THONG_BAO_LICH_HEN_KEY = 'thong_bao_index_lich_hen';

export const INSERT_THONG_BAO_SQL =
  'INSERT INTO thong_bao (tai_khoan_id, noi_dung, loai_su_kien, lich_hen_id, thoi_diem_tao) VALUES (?, ?, ?, ?, ?)';
// `trang_thai` mặc định `ChoGui`, `so_lan_thu` 0: dòng hộp thư đi chờ worker (hàng của MỖI thông báo là đúng một: `thong_bao_id` UNIQUE)
export const INSERT_EMAIL_THONG_BAO_SQL =
  'INSERT INTO email_thong_bao (thong_bao_id) VALUES (?)';

export interface ThongBaoInput {
  taiKhoanId: string;
  noiDung: string;
  loaiSuKien: string;
  lichHenId: string;
  thoiDiemTao: Date;
}

export type ThongBaoInsertResult =
  | { kind: 'Inserted'; thongBaoId: string }
  /** Đã có dòng cùng `(lich_hen_id, tai_khoan_id, loai_su_kien)`: "đã có", KHÔNG phải lỗi (PLAN 5.12) */
  | { kind: 'AlreadyExists' };

/**
 * `INSERT INTO thong_bao` bằng `em` của người gọi. CHỈ nuốt lỗi 1062 của ĐÚNG chỉ mục `thong_bao_index_lich_hen` (một sự kiện ghi lần hai cho cùng lịch, cùng tài khoản: override `VangMat → DaXacNhan →
 * VangMat`, B12-G); mọi lỗi khác (khoá ngoại 1452, 1062 của chỉ mục khác, mất kết nối…) NỔI LÊN để người gọi hoàn tác lần đổi trạng thái. MySQL chỉ hoàn tác CÂU bị 1062, không cả giao dịch (X1 M2),
 * nên giao dịch của lõi vẫn dùng tiếp được.
 */
export async function insertThongBao(
  em: EntityManager,
  input: ThongBaoInput,
): Promise<ThongBaoInsertResult> {
  try {
    const result: { insertId: number | string } = await em.query(
      INSERT_THONG_BAO_SQL,
      [
        input.taiKhoanId,
        input.noiDung,
        input.loaiSuKien,
        input.lichHenId,
        input.thoiDiemTao,
      ],
    );
    return { kind: 'Inserted', thongBaoId: String(result.insertId) };
  } catch (error) {
    if (duplicateKeyOf(error) === THONG_BAO_LICH_HEN_KEY)
      return { kind: 'AlreadyExists' };
    throw error;
  }
}

/** Dòng hộp thư đi `ChoGui` của MỘT thông báo vừa ghi, cùng giao dịch (không mất thư khi tiến trình chết sau commit). */
export async function insertEmailRow(
  em: EntityManager,
  thongBaoId: string,
): Promise<void> {
  await em.query(INSERT_EMAIL_THONG_BAO_SQL, [thongBaoId]);
}
