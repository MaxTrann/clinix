import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import {
  insertEmailRow,
  insertThongBao,
  type ThongBaoInsertResult,
} from '../../../appointments/notifications/thong-bao-insert.query.js';
import { toSingleLine } from '../../../mail/mail-safety.js';
import {
  EXAM_NOTIFICATION_EVENTS,
  NOTIFICATION_MAX_LENGTH,
} from '../examination.constants.js';

// Thông báo của phần khám bệnh (doctor-exam B1; PLAN 5.12, E6; Q17, Đại chốt 15/11/2026). Ghi `thong_bao` và, từ notification B4 (Q6), MỘT dòng `email_thong_bao` `ChoGui` khi thông báo vừa được
// tạo (nếp `refund-notifier.ts`): worker thư của booking gửi thư "Lịch khám đã hoàn thành" (`678:2`). KHÔNG nhật ký. Ghi bằng `em` của NGƯỜI GỌI để thông báo và lần hoàn thành cùng commit hay cùng rollback: không có "hoàn thành mà
// không báo". Không nuốt lỗi: chỉ 1062 của đúng chỉ mục `(lich_hen_id, tai_khoan_id, loai_su_kien)` được trả như "đã có" (do `insertThongBao` của booking); mọi lỗi khác nổi lên.
// Nội dung KHÔNG có dữ liệu khám, SĐT, lý do khám: hàm chỉ nhận mã lịch hẹn (H10).

export interface CompletedNotification {
  lichHenId: string;
  /** Tài khoản ĐẶT (`lich_hen.benh_nhan_id`), không phải người khám */
  taiKhoanId: string;
  maLichHen: string;
  /** Mốc của lượt (người gọi đã `toSecond(nowVN())`); hàm KHÔNG tự đọc đồng hồ (HD-08) */
  now: Date;
}

/**
 * `noi_dung` của thông báo hoàn thành: một dòng, ≤ `NOTIFICATION_MAX_LENGTH`. Chữ `[đề xuất]` của PLAN 5.12. Mã đi qua `toSingleLine` TRƯỚC khi ghép vào câu; cả câu qua `toSingleLine`
 * một lần nữa để chắc chắn một dòng và không quá dài.
 */
export function buildCompletedText(maLichHen: string): string {
  const ma = toSingleLine(maLichHen, 20);
  return toSingleLine(
    `Lịch hẹn ${ma} đã hoàn thành. Bạn có thể xem hồ sơ khám bệnh và đánh giá bác sĩ trong mục Hồ sơ khám bệnh.`,
    NOTIFICATION_MAX_LENGTH,
  );
}

@Injectable()
export class ExamNotifier {
  /**
   * Ghi MỘT `thong_bao` `LichHenHoanThanh` và dòng thư của nó vào giao dịch của người gọi. Không tự mở giao dịch. "Đã có" (1062 đúng chỉ mục) thì KHÔNG ghi thư thứ hai;
   * lỗi ghi thư nổi lên để người gọi hoàn tác cả lần hoàn thành (EMT-01).
   */
  async notifyCompleted(
    em: EntityManager,
    input: CompletedNotification,
  ): Promise<ThongBaoInsertResult> {
    const result = await insertThongBao(em, {
      taiKhoanId: input.taiKhoanId,
      noiDung: buildCompletedText(input.maLichHen),
      loaiSuKien: EXAM_NOTIFICATION_EVENTS.COMPLETED,
      lichHenId: input.lichHenId,
      thoiDiemTao: input.now,
    });
    if (result.kind === 'Inserted') await insertEmailRow(em, result.thongBaoId);
    return result;
  }
}
