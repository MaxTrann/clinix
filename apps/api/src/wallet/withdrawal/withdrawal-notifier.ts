import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { formatVnd } from '../../appointments/notifications/mail-format.js';
import { WITHDRAWAL_NOTIFICATION_EVENTS } from '../wallet.constants.js';

// Thông báo trong ứng dụng của rút tiền (payment B11; PLAN 5.12; 2.4 RTV b5; TDT-02 vế `RutTienDaGui`). Chỉ ghi `thong_bao` (worker thư của booking chỉ xử lý bốn loại của nó).
// Không gắn lịch hẹn nên ghi thẳng như `TopupNotifier` của payment B4. Ghi bằng `em` của NGƯỜI GỌI: thông báo và lần giữ tiền cùng commit hay cùng rollback.

export function buildWithdrawalSubmittedText(soTien: string): string {
  return `Yêu cầu rút ${formatVnd(soTien)}đ đã được gửi và đang chờ duyệt. Số tiền này được giữ trong ví cho tới khi yêu cầu được xử lý.`;
}

@Injectable()
export class WithdrawalNotifier {
  async notifySubmitted(
    em: EntityManager,
    input: { benhNhanId: string; soTien: string; now: Date },
  ): Promise<void> {
    await em.query(
      'INSERT INTO thong_bao (tai_khoan_id, noi_dung, loai_su_kien, thoi_diem_tao) VALUES (?, ?, ?, ?)',
      [
        input.benhNhanId,
        buildWithdrawalSubmittedText(input.soTien),
        WITHDRAWAL_NOTIFICATION_EVENTS.SUBMITTED,
        input.now,
      ],
    );
  }
}
