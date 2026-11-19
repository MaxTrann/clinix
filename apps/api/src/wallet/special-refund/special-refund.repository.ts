import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';

// SQL thô của hoàn tiền đặc biệt (payment B13; PLAN 5.6.2). Phần dùng chung với hoàn cọc (khoá dòng hoàn, chèn dòng hoàn, lịch cuối của chuỗi) nằm ở `RefundRepository` của B8 và được TÁI DÙNG.
// Không `NOW()`, không `UPDATE lich_hen` (QTT-08). Id BIGINT và tiền ra CHUỖI (`CAST … AS CHAR`).

/** Khoản thanh toán QUA VÍ hoàn được (đã khoá 7a): `ThanhToanLichHen`, `Vi`, `ThanhCong`, `so_tien > 0`. */
export interface WalletPayment {
  giaoDichThanhToanId: string;
  viNoiBoId: string;
  /** Lịch GỐC của chuỗi (`giao_dich_thanh_toan.lich_hen_id`) */
  lichHenId: string;
  soTien: string;
}

export interface PaymentRow extends WalletPayment {
  thoiDiem: Date;
}

const WALLET_PAYMENT_COLUMNS = `CAST(g.giao_dich_thanh_toan_id AS CHAR) AS giaoDichThanhToanId, CAST(g.vi_noi_bo_id AS CHAR) AS viNoiBoId,
  CAST(g.lich_hen_id AS CHAR) AS lichHenId, CAST(g.so_tien AS CHAR) AS soTien`;
// Điều kiện "khoản qua ví hoàn được": tiền mặt, nạp ví, 0đ, chưa thành công đều KHÔNG phải (HDB-01, HDB-11)
const WALLET_PAYMENT_WHERE = `g.loai = 'ThanhToanLichHen' AND g.phuong_thuc = 'Vi' AND g.trang_thai = 'ThanhCong' AND g.so_tien > 0`;

@Injectable()
export class SpecialRefundRepository {
  /**
   * KHOÁ X khoản thanh toán theo khoá chính (hạng 7a, cùng hàng mà hoàn cọc tự động khoá): hoàn đặc biệt và hoàn tự động trên cùng khoản xếp hàng ở đây (HDB-08).
   * Khoá cả khi KHÔNG phải khoản qua ví (điều kiện lọc sau khoá) để kết quả không phụ thuộc thời điểm; không phải ⇒ `null` (404).
   */
  async lockWalletPayment(
    em: EntityManager,
    giaoDichThanhToanId: string,
  ): Promise<WalletPayment | null> {
    const rows = await em.query<WalletPayment[]>(
      `SELECT ${WALLET_PAYMENT_COLUMNS} FROM giao_dich_thanh_toan g
        WHERE g.giao_dich_thanh_toan_id = ? AND ${WALLET_PAYMENT_WHERE} FOR UPDATE`,
      [giaoDichThanhToanId],
    );
    return rows[0] ?? null;
  }

  /** Lịch có mã này (mọi trạng thái), để quy về lịch gốc. Không có ⇒ `null`. */
  async findAppointmentIdByCode(
    em: EntityManager,
    maLichHen: string,
  ): Promise<string | null> {
    const rows = await em.query<{ id: string }[]>(
      'SELECT CAST(lich_hen_id AS CHAR) AS id FROM lich_hen WHERE ma_lich_hen = ?',
      [maLichHen],
    );
    return rows[0]?.id ?? null;
  }

  /** Các khoản qua ví theo lịch GỐC hoặc theo chủ ví, mới nhất trước. Lọc "còn hoàn được" ở service (cần các dòng hoàn). Chỉ ĐỌC. */
  async listWalletPayments(
    em: EntityManager,
    filter: { rootLichHenId: string } | { benhNhanId: string },
  ): Promise<PaymentRow[]> {
    const byRoot = 'rootLichHenId' in filter;
    return em.query<PaymentRow[]>(
      `SELECT ${WALLET_PAYMENT_COLUMNS}, g.thoi_diem_tao AS thoiDiem
         FROM giao_dich_thanh_toan g
         ${byRoot ? '' : 'INNER JOIN vi_noi_bo v ON v.vi_noi_bo_id = g.vi_noi_bo_id'}
        WHERE ${WALLET_PAYMENT_WHERE} AND ${byRoot ? 'g.lich_hen_id = ?' : 'v.benh_nhan_id = ?'}
        ORDER BY g.thoi_diem_tao DESC, g.giao_dich_thanh_toan_id DESC`,
      [byRoot ? filter.rootLichHenId : filter.benhNhanId],
    );
  }

  /** Mã của một lịch (để hiển thị). */
  async codeOf(em: EntityManager, lichHenId: string): Promise<string | null> {
    const rows = await em.query<{ ma: string }[]>(
      'SELECT ma_lich_hen AS ma FROM lich_hen WHERE lich_hen_id = ?',
      [lichHenId],
    );
    return rows[0]?.ma ?? null;
  }

  /** Chi nhánh của lịch GỐC: ghi vào nhật ký để Quản trị viên chi nhánh lọc được (PLAN 5.6.2, HDB-12). ĐỌC THƯỜNG, không khoá `lich_hen`. */
  async branchOf(em: EntityManager, lichHenId: string): Promise<string> {
    const rows = await em.query<{ id: string }[]>(
      'SELECT CAST(chi_nhanh_id AS CHAR) AS id FROM lich_hen WHERE lich_hen_id = ?',
      [lichHenId],
    );
    const id = rows[0]?.id;
    // Khoá ngoại bảo đảm lịch gốc tồn tại và có chi nhánh: thiếu là dữ liệu hỏng (500)
    if (id === undefined)
      throw new Error('Lịch gốc của khoản thanh toán không có chi nhánh');
    return id;
  }
}
