import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { formatVnd } from '../../appointments/notifications/mail-format.js';
import { TOPUP_NOTIFICATION_EVENTS } from '../payment.constants.js';

// Thông báo trong ứng dụng của nạp ví (payment B4; PLAN 5.12; TDT-01, TDT-02). Chỉ ghi `thong_bao`, KHÔNG `email_thong_bao` (worker thư của booking chỉ xử lý bốn loại của nó; mẫu thư `679:2` của
// `NapViThatBai` chờ mở rộng worker, `[ĐỤNG booking]`, Q18).
// Không gắn `lich_hen_id` (nạp ví không thuộc lịch nào) nên không dùng `insertThongBao` của booking (hàm đó bắt buộc có lịch); ghi thẳng như `doctor/notifications/leave-notifier.ts`.
// Ghi bằng `em` của NGƯỜI GỌI: thông báo và lần đổi tiền cùng commit hay cùng rollback (TDT-01). Nội dung KHÔNG chứa mã giao dịch cổng (PLAN 5.12).

const INSERT_SQL =
  'INSERT INTO thong_bao (tai_khoan_id, noi_dung, loai_su_kien, thoi_diem_tao) VALUES (?, ?, ?, ?)';

export function buildTopupSucceededText(soTien: string): string {
  return `Nạp ${formatVnd(soTien)}đ vào ví thành công. Số tiền đã được cộng vào số dư khả dụng.`;
}

export function buildTopupFailedText(soTien: string): string {
  return `Giao dịch nạp ${formatVnd(soTien)}đ vào ví không thành công. Ví của bạn không thay đổi.`;
}

@Injectable()
export class TopupNotifier {
  async notifySucceeded(
    em: EntityManager,
    input: { benhNhanId: string; soTien: string; now: Date },
  ): Promise<void> {
    await em.query(INSERT_SQL, [
      input.benhNhanId,
      buildTopupSucceededText(input.soTien),
      TOPUP_NOTIFICATION_EVENTS.SUCCEEDED,
      input.now,
    ]);
  }

  async notifyFailed(
    em: EntityManager,
    input: { benhNhanId: string; soTien: string; now: Date },
  ): Promise<void> {
    await em.query(INSERT_SQL, [
      input.benhNhanId,
      buildTopupFailedText(input.soTien),
      TOPUP_NOTIFICATION_EVENTS.FAILED,
      input.now,
    ]);
  }
}
