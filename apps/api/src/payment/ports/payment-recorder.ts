import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { PaymentPort } from '../../appointments/ports/payment.port.js';
import { nowVN, toSecond } from '../../common/time/time.js';

/**
 * Bản thật của `PaymentPort` (payment B2; PLAN payment E2, HDT-01): ghi giao dịch thanh toán 0đ cho lịch cọc 0đ, trong CÙNG giao dịch tạo lịch của booking (`em` của người gọi).
 *  - Chỉ `INSERT giao_dich_thanh_toan` (`ThanhToanLichHen`, `Vi`, `so_tien = 0.00`, `ThanhCong`); KHÔNG `giao_dich_vi`, KHÔNG đổi `vi_noi_bo` (Q19 booking), KHÔNG khoá ví, KHÔNG `UPDATE lich_hen`.
 *  - `vi_noi_bo_id` lấy bằng đọc thường theo `benh_nhan_id` (không `FOR UPDATE`): hàng ví chỉ bị `INSERT` xin khoá S qua khoá ngoại, không xin khoá X, nên không nâng khoá chéo với luồng
 *    thanh toán ví của lịch khác (X1 M1: 300 vòng, 0 lần 1213).
 *  - Lịch vừa tạo chưa từng đổi lịch nên chính nó là lịch gốc: ghi `lich_hen_id` = `lichHenId`, không cần `PaymentChain`.
 *  - Lỗi (không có ví, CHECK, khoá ngoại) ném ra để booking hoàn tác trọn lịch lẫn khung giờ (DL-27). Thân giao dịch của booking chạy lại được nên không ghi trùng.
 */
@Injectable()
export class PaymentRecorder implements PaymentPort {
  async recordZeroPayment(
    em: EntityManager,
    input: { lichHenId: string; benhNhanId: string },
  ): Promise<void> {
    const wallets = await em.query<{ id: string }[]>(
      'SELECT vi_noi_bo_id AS id FROM vi_noi_bo WHERE benh_nhan_id = ?',
      [input.benhNhanId],
    );
    const wallet = wallets[0];
    // Bệnh nhân đã xác minh luôn có ví (auth tạo cùng giao dịch): thiếu là dữ liệu hỏng, không phải lỗi người dùng
    if (wallet === undefined)
      throw new Error(
        `PaymentRecorder: Bệnh nhân ${input.benhNhanId} không có hàng ví`,
      );
    await em.query(
      `INSERT INTO giao_dich_thanh_toan (vi_noi_bo_id, lich_hen_id, loai, phuong_thuc, so_tien, trang_thai, trang_thai_doi_soat, thoi_diem_tao)
       VALUES (?, ?, 'ThanhToanLichHen', 'Vi', 0.00, 'ThanhCong', 'KhongCan', ?)`,
      [wallet.id, input.lichHenId, toSecond(nowVN())],
    );
  }
}
