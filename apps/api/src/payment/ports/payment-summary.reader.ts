import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type {
  PaymentMethod,
  PaymentSummaryPort,
  PaymentView,
} from '../../appointments/ports/payment.port.js';
import {
  addMoney,
  compareMoney,
  fromCents,
  subtractMoney,
  toCents,
} from '../../pricing/money.js';
import { PaymentChain } from './payment-chain.js';

interface PaymentRow {
  phuongThuc: PaymentMethod;
  soTien: string;
  thoiDiemTao: Date;
}

const ZERO = '0.00';
/** Chuẩn hoá chuỗi tiền của driver (có thể thiếu số lẻ) về đúng hai chữ số. */
const money = (value: string): string => fromCents(toCents(value));

/**
 * Bản thật của `PaymentSummaryPort` (payment B2; PLAN payment E3, Q15, Q21; HDT-02, HDT-03, HDT-15). Chỉ ĐỌC trên `em` của người gọi (cùng ảnh chụp với hàng `lich_hen` mà booking đang khoá),
 * KHÔNG khoá hàng nào nên không thể xin khoá ngược thứ tự (booking gọi dưới khoá `lich_hen`, tầng 6).
 *  - Giao dịch và hoàn tiền luôn trỏ LỊCH GỐC của chuỗi đổi lịch: mọi hàm hỏi `PaymentChain.rootOf` (một chỗ, không truy vấn đệ quy thứ hai). Chuỗi hỏng ⇒ `PaymentChainError` thành 500, không nuốt.
 *  - Chỉ tính giao dịch `ThanhCong` của loại `ThanhToanLichHen` (nạp ví không phải tiền cọc của lịch nào).
 *  - `findPayment` không lộ mã cổng, id ví, người thu (chỉ ba khoá của `PaymentView`); dòng 0đ không hiện ở `giaoDich`.
 */
@Injectable()
export class PaymentSummaryReader implements PaymentSummaryPort {
  constructor(@Inject(PaymentChain) private readonly chain: PaymentChain) {}

  /** Mọi dòng thu `ThanhCong` của lịch gốc, cũ trước (cùng giây thì theo id). Gồm cả dòng 0đ: người gọi lọc nếu cần. */
  private async paymentsOf(
    em: EntityManager,
    rootId: string,
  ): Promise<PaymentRow[]> {
    return em.query<PaymentRow[]>(
      `SELECT phuong_thuc AS phuongThuc, so_tien AS soTien, thoi_diem_tao AS thoiDiemTao
FROM giao_dich_thanh_toan
WHERE lich_hen_id = ? AND loai = 'ThanhToanLichHen' AND trang_thai = 'ThanhCong'
ORDER BY thoi_diem_tao ASC, giao_dich_thanh_toan_id ASC`,
      [rootId],
    );
  }

  private sum(rows: readonly PaymentRow[]): string {
    return rows.reduce((total, row) => addMoney(total, row.soTien), ZERO);
  }

  /** `gia_snapshot` của lịch hiện tại, hoặc `null` khi không có lịch. */
  private async priceOf(
    em: EntityManager,
    lichHenId: string,
  ): Promise<string | null> {
    const rows = await em.query<{ gia: string }[]>(
      'SELECT gia_snapshot AS gia FROM lich_hen WHERE lich_hen_id = ?',
      [lichHenId],
    );
    return rows[0] === undefined ? null : money(rows[0].gia);
  }

  private static remaining(price: string, paid: string): string {
    // Không âm: đã đủ hay thừa ⇒ "0.00"
    return compareMoney(price, paid) <= 0 ? ZERO : subtractMoney(price, paid);
  }

  async amountPaid(em: EntityManager, lichHenId: string): Promise<string> {
    const rootId = await this.chain.rootOf(em, lichHenId);
    if (rootId === null) return ZERO;
    return this.sum(await this.paymentsOf(em, rootId));
  }

  async remainingToCollect(
    em: EntityManager,
    lichHenId: string,
  ): Promise<string> {
    const price = await this.priceOf(em, lichHenId);
    // Như bản Noop: người gọi phải khoá lịch trước, nên không có lịch là lỗi lập trình
    if (price === null)
      throw new Error(
        'PaymentSummaryReader: lịch hẹn không tồn tại (người gọi phải khoá lịch hẹn trước khi hỏi số còn phải thu)',
      );
    return PaymentSummaryReader.remaining(
      price,
      await this.amountPaid(em, lichHenId),
    );
  }

  /** `null` CHỈ khi không có lịch (Q21): chưa có giao dịch nào ⇒ đối tượng `{ daThu: "0.00", conPhaiThu: gia, giaoDich: [] }`. */
  async findPayment(
    em: EntityManager,
    lichHenId: string,
  ): Promise<PaymentView | null> {
    const price = await this.priceOf(em, lichHenId);
    if (price === null) return null;
    const rootId = await this.chain.rootOf(em, lichHenId);
    const rows = rootId === null ? [] : await this.paymentsOf(em, rootId);
    const paid = this.sum(rows);
    return {
      daThu: paid,
      conPhaiThu: PaymentSummaryReader.remaining(price, paid),
      giaoDich: rows
        .filter((row) => compareMoney(row.soTien, ZERO) > 0)
        .map((row) => ({
          phuongThuc: row.phuongThuc,
          soTien: money(row.soTien),
          thoiDiem: row.thoiDiemTao.toISOString(),
        })),
    };
  }

  /**
   * Số còn hoàn được (Q15): tổng cọc `ThanhCong` đã trả qua ví của lịch gốc trừ tổng `lich_su_hoan_tien` `ThanhCong` của các khoản đó (cả hoàn tự động lẫn đặc biệt); không âm.
   * Chỉ phần trả bằng ví mới hoàn về ví (tiền mặt tại quầy không hoàn qua đây). `cancel` (B9, Đại) sẽ tính số hoàn trên con số này; B2 chỉ cung cấp hàm.
   */
  async amountRefundable(
    em: EntityManager,
    lichHenId: string,
  ): Promise<string> {
    const rootId = await this.chain.rootOf(em, lichHenId);
    if (rootId === null) return ZERO;
    const paid = this.sum(
      (await this.paymentsOf(em, rootId)).filter(
        (row) => row.phuongThuc === 'Vi',
      ),
    );
    const refunded = await em.query<{ tong: string }[]>(
      `SELECT COALESCE(SUM(h.so_tien), 0) AS tong
FROM lich_su_hoan_tien h
INNER JOIN giao_dich_thanh_toan t ON t.giao_dich_thanh_toan_id = h.giao_dich_thanh_toan_id
WHERE t.lich_hen_id = ? AND t.loai = 'ThanhToanLichHen' AND h.trang_thai = 'ThanhCong'`,
      [rootId],
    );
    const done = money(String(refunded[0]?.tong ?? ZERO));
    return compareMoney(paid, done) <= 0 ? ZERO : subtractMoney(paid, done);
  }
}
