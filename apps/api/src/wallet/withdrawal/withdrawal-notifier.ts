import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { formatVnd } from '../../appointments/notifications/mail-format.js';
import { insertEmailRow } from '../../appointments/notifications/thong-bao-insert.query.js';
import {
  NOTIFICATION_MAX_LENGTH,
  WITHDRAWAL_NOTIFICATION_EVENTS,
} from '../wallet.constants.js';

// Thông báo trong ứng dụng của rút tiền (payment B11, B12; PLAN 5.12; 2.4 RTV b5, XRT b7; TDT-02 vế `RutTienDaGui`, TDT-05). `RutTienDuocDuyet`, `RutTienBiTuChoi` có thêm thư `682:2`, `683:2`
// (payment B17: dòng `email_thong_bao` qua `insertEmailRow` của booking, worker của booking gửi); `RutTienDaGui` chỉ là thông báo trong ứng dụng.
// Không gắn lịch hẹn nên ghi thẳng như `TopupNotifier` của payment B4. Ghi bằng `em` của NGƯỜI GỌI: thông báo và lần đổi ví cùng commit hay cùng rollback.

export function buildWithdrawalSubmittedText(soTien: string): string {
  return `Yêu cầu rút ${formatVnd(soTien)}đ đã được gửi và đang chờ duyệt. Số tiền này được giữ trong ví cho tới khi yêu cầu được xử lý.`;
}

/** Ghi chú (nếu có) nối vào cuối; cả câu không quá 500 ký tự (cột `varchar(500)`). Ghi chú đã bị giới hạn 200 ký tự ở DTO nên phần đầu không bao giờ bị cắt. */
function withNote(base: string, ghiChu: string | undefined): string {
  const text = ghiChu === undefined ? base : `${base} Ghi chú: ${ghiChu}`;
  return text.slice(0, NOTIFICATION_MAX_LENGTH);
}

export function buildWithdrawalApprovedText(
  soTien: string,
  ghiChu?: string,
): string {
  return withNote(
    `Yêu cầu rút ${formatVnd(soTien)}đ đã được duyệt. Số tiền đã được trừ khỏi ví của bạn.`,
    ghiChu,
  );
}

export function buildWithdrawalRejectedText(
  soTien: string,
  ghiChu?: string,
): string {
  return withNote(
    `Yêu cầu rút ${formatVnd(soTien)}đ đã bị từ chối. Số tiền được trả lại số dư khả dụng của ví.`,
    ghiChu,
  );
}

interface NoticeInput {
  benhNhanId: string;
  soTien: string;
  now: Date;
}

@Injectable()
export class WithdrawalNotifier {
  async notifySubmitted(em: EntityManager, input: NoticeInput): Promise<void> {
    await this.insert(
      em,
      input,
      buildWithdrawalSubmittedText(input.soTien),
      WITHDRAWAL_NOTIFICATION_EVENTS.SUBMITTED,
    );
  }

  async notifyApproved(
    em: EntityManager,
    input: NoticeInput & { ghiChu?: string },
  ): Promise<void> {
    await this.insert(
      em,
      input,
      buildWithdrawalApprovedText(input.soTien, input.ghiChu),
      WITHDRAWAL_NOTIFICATION_EVENTS.APPROVED,
      true,
    );
  }

  async notifyRejected(
    em: EntityManager,
    input: NoticeInput & { ghiChu?: string },
  ): Promise<void> {
    await this.insert(
      em,
      input,
      buildWithdrawalRejectedText(input.soTien, input.ghiChu),
      WITHDRAWAL_NOTIFICATION_EVENTS.REJECTED,
      true,
    );
  }

  private async insert(
    em: EntityManager,
    input: NoticeInput,
    noiDung: string,
    loaiSuKien: string,
    /** Xếp thêm thư (payment B17) cùng giao dịch */
    withMail = false,
  ): Promise<void> {
    const result: { insertId: number | string } = await em.query(
      'INSERT INTO thong_bao (tai_khoan_id, noi_dung, loai_su_kien, thoi_diem_tao) VALUES (?, ?, ?, ?)',
      [input.benhNhanId, noiDung, loaiSuKien, input.now],
    );
    if (withMail) await insertEmailRow(em, String(result.insertId));
  }
}
