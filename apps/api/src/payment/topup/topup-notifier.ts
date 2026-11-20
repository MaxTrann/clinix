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

// B14 (`[đề xuất]`): câu cho Bệnh nhân khi job cộng lại thành công, và cho Quản trị viên khi hết lượt thử. Câu của Quản trị viên chỉ có MÃ giao dịch nội bộ (để tìm ở
// màn "Nạp ví chưa cộng", B15): không tên, không số tiền của Bệnh nhân (PLAN 5.12: không dữ liệu cá nhân ngoài chủ sở hữu).
export function buildTopupReconciledText(soTien: string): string {
  return `Giao dịch nạp ${formatVnd(soTien)}đ đã được đối soát và cộng vào số dư khả dụng của ví.`;
}

export function buildTopupNeedsAttentionText(giaoDichId: string): string {
  return `Giao dịch nạp ví #${giaoDichId} đã được cổng thanh toán xác nhận nhưng chưa cộng được vào ví sau 3 lần thử tự động. Vui lòng xử lý ở mục Nạp ví chưa cộng.`;
}

// B15 (`[đề xuất]`): câu cho Bệnh nhân khi Quản trị viên ghi nhận chưa thể xử lý. KHÔNG chép lý do nội bộ của Quản trị viên (có thể nhắc tới cổng hay đối soát nội bộ).
export function buildTopupUnprocessableText(soTien: string): string {
  return `Giao dịch nạp ${formatVnd(soTien)}đ vào ví đang được kiểm tra thêm và chưa thể cộng vào ví. Phòng khám sẽ liên hệ với bạn nếu cần.`;
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

  async notifyReconciled(
    em: EntityManager,
    input: { benhNhanId: string; soTien: string; now: Date },
  ): Promise<void> {
    await em.query(INSERT_SQL, [
      input.benhNhanId,
      buildTopupReconciledText(input.soTien),
      TOPUP_NOTIFICATION_EVENTS.RECONCILED,
      input.now,
    ]);
  }

  async notifyUnprocessable(
    em: EntityManager,
    input: { benhNhanId: string; soTien: string; now: Date },
  ): Promise<void> {
    await em.query(INSERT_SQL, [
      input.benhNhanId,
      buildTopupUnprocessableText(input.soTien),
      TOPUP_NOTIFICATION_EVENTS.UNPROCESSABLE,
      input.now,
    ]);
  }

  /** Mỗi Quản trị viên `ToanHeThong` đang hoạt động một dòng. Danh sách rỗng ⇒ không ghi gì. */
  async notifyNeedsAttention(
    em: EntityManager,
    input: { giaoDichId: string; adminIds: readonly string[]; now: Date },
  ): Promise<void> {
    const text = buildTopupNeedsAttentionText(input.giaoDichId);
    for (const adminId of input.adminIds)
      await em.query(INSERT_SQL, [
        adminId,
        text,
        TOPUP_NOTIFICATION_EVENTS.NEEDS_ATTENTION,
        input.now,
      ]);
  }
}
