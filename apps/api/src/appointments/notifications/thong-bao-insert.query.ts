import type { EntityManager } from 'typeorm';
import { duplicateKeyOf } from '../create/duplicate-key.js';

// NƠI DUY NHẤT booking ghi `thong_bao` và `email_thong_bao` lúc có sự kiện (task B15; PLAN booking 5.12; AR-06 `INSERT INTO thong_bao`, `INSERT INTO email_thong_bao`: chỉ `appointments/notifications/`).
// `UPDATE email_thong_bao` (kết quả gửi) là của `email-outbox.query.ts` ở giai đoạn sau, cũng trong thư mục này.

/** Tên chỉ mục UNIQUE `(lich_hen_id, tai_khoan_id, loai_su_kien)` của P7 (docs/database; migration `thong-bao-lich-hen`). */
export const THONG_BAO_LICH_HEN_KEY = 'thong_bao_index_lich_hen';
/** Tên chỉ mục UNIQUE `(yeu_cau_doi_lich_ngoai_chinh_sach_id, tai_khoan_id, loai_su_kien)` của reschedule P1 (Q5). */
export const THONG_BAO_YEU_CAU_DOI_LICH_KEY =
  'thong_bao_index_yeu_cau_doi_lich';

export const INSERT_THONG_BAO_SQL =
  'INSERT INTO thong_bao (tai_khoan_id, noi_dung, loai_su_kien, lich_hen_id, thoi_diem_tao) VALUES (?, ?, ?, ?, ?)';
// Thông báo của YÊU CẦU đổi lịch (reschedule B3): không có cột `lich_hen_id` trong câu nên luôn NULL (tránh trùng UNIQUE `thong_bao_index_lich_hen` khi một lịch có nhiều yêu cầu theo thời gian)
export const INSERT_THONG_BAO_YEU_CAU_SQL =
  'INSERT INTO thong_bao (tai_khoan_id, noi_dung, loai_su_kien, yeu_cau_doi_lich_ngoai_chinh_sach_id, thoi_diem_tao) VALUES (?, ?, ?, ?, ?)';
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

export interface YeuCauThongBaoInput {
  taiKhoanId: string;
  noiDung: string;
  loaiSuKien: string;
  /** `yeu_cau_doi_lich_ngoai_chinh_sach_id` của yêu cầu mà thông báo nói về */
  yeuCauId: string;
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
export function insertThongBao(
  em: EntityManager,
  input: ThongBaoInput,
): Promise<ThongBaoInsertResult> {
  return insertSwallowing(
    em,
    INSERT_THONG_BAO_SQL,
    [
      input.taiKhoanId,
      input.noiDung,
      input.loaiSuKien,
      input.lichHenId,
      input.thoiDiemTao,
    ],
    THONG_BAO_LICH_HEN_KEY,
  );
}

/**
 * `INSERT INTO thong_bao` cho một YÊU CẦU đổi lịch (reschedule B3; Q5): `lich_hen_id` NULL, `yeu_cau_doi_lich_ngoai_chinh_sach_id` = `yeuCauId`. Chỉ nuốt 1062 của ĐÚNG chỉ mục
 * `thong_bao_index_yeu_cau_doi_lich` ("đã có": chạy lại cùng (yêu cầu, tài khoản, loại)); mọi lỗi khác nổi lên như `insertThongBao`. Một lịch có hai yêu cầu theo thời gian vẫn đủ thông báo vì khoá là của yêu cầu.
 */
export function insertYeuCauThongBao(
  em: EntityManager,
  input: YeuCauThongBaoInput,
): Promise<ThongBaoInsertResult> {
  return insertSwallowing(
    em,
    INSERT_THONG_BAO_YEU_CAU_SQL,
    [
      input.taiKhoanId,
      input.noiDung,
      input.loaiSuKien,
      input.yeuCauId,
      input.thoiDiemTao,
    ],
    THONG_BAO_YEU_CAU_DOI_LICH_KEY,
  );
}

async function insertSwallowing(
  em: EntityManager,
  sql: string,
  params: unknown[],
  swallowedKey: string,
): Promise<ThongBaoInsertResult> {
  try {
    const result: { insertId: number | string } = await em.query(sql, params);
    return { kind: 'Inserted', thongBaoId: String(result.insertId) };
  } catch (error) {
    if (duplicateKeyOf(error) === swallowedKey)
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
