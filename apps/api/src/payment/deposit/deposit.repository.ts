import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';

// SQL thô của thanh toán cọc bằng ví (payment B5; PLAN 5.5, E6). KHÔNG có `UPDATE lich_hen` hay `khung_gio` (QTT-08: `confirmPaid` của booking là nơi duy nhất đổi trạng thái lịch).
// Không ghi log: mã lịch, số dư và tiền là dữ liệu cá nhân.

/** Hàng `lich_hen` đọc THƯỜNG (không khoá) để biết khoá gì và chặn sớm các ca phổ biến; trạng thái thật chỉ có nghĩa DƯỚI khoá, do `confirmPaid` kiểm lại. */
export interface DepositAppointmentRow {
  lichHenId: string;
  benhNhanId: string;
  trangThai: TrangThaiLichHen;
  lyDoHuy: string | null;
  /** Cọc chụp lúc đặt (`tien_coc_snapshot`, chuỗi decimal): số tiền thanh toán chỉ lấy từ đây, KHÔNG từ `dich_vu_kham.muc_dat_coc` hiện hành (TLK-12) */
  tienCoc: string;
  hanThanhToan: Date | null;
}

@Injectable()
export class DepositRepository {
  /**
   * Lịch theo mã, KHÔNG lọc chủ sở hữu (service so `benhNhanId` với token rồi trả cùng một 404 cho "không có" và "của người khác"). Đọc thường, không khoá.
   * `CAST … AS CHAR` cho id: bigint, driver có thể trả số.
   */
  async findByCode(
    em: EntityManager,
    maLichHen: string,
  ): Promise<DepositAppointmentRow | null> {
    const rows = await em.query<DepositAppointmentRow[]>(
      `SELECT CAST(lich_hen_id AS CHAR) AS lichHenId, CAST(benh_nhan_id AS CHAR) AS benhNhanId, trang_thai AS trangThai, ly_do_huy AS lyDoHuy,
              tien_coc_snapshot AS tienCoc, han_thanh_toan AS hanThanhToan
       FROM lich_hen WHERE ma_lich_hen = ?`,
      [maLichHen],
    );
    return rows[0] ?? null;
  }

  /**
   * `INSERT giao_dich_thanh_toan` của khoản cọc trả bằng ví (`Vi`, `ThanhCong`, `lich_hen_id` = LỊCH GỐC). Phải gọi SAU khi đã khoá ví (`FOR UPDATE`): `INSERT` xin khoá chia sẻ trên hàng ví
   * (khoá ngoại), mà nếu rồi mới khoá X ví thì hai giao dịch cùng ví nâng khoá chéo nhau ⇒ 1213 (H1). Trả `giao_dich_thanh_toan_id`.
   */
  async insertWalletPayment(
    em: EntityManager,
    input: {
      viNoiBoId: string;
      rootLichHenId: string;
      soTien: string;
      now: Date;
    },
  ): Promise<string> {
    const result = await em.query<{ insertId: string | number }>(
      `INSERT INTO giao_dich_thanh_toan (vi_noi_bo_id, lich_hen_id, loai, phuong_thuc, so_tien, trang_thai, trang_thai_doi_soat, thoi_diem_tao)
       VALUES (?, ?, 'ThanhToanLichHen', 'Vi', ?, 'ThanhCong', 'KhongCan', ?)`,
      [input.viNoiBoId, input.rootLichHenId, input.soTien, input.now],
    );
    return String(result.insertId);
  }
}
