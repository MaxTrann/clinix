import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import {
  insertEmailRow,
  insertThongBao,
} from '../../appointments/notifications/thong-bao-insert.query.js';
import { REFUND_NOTIFICATION_EVENTS } from '../wallet.constants.js';
import { buildNeedsAttentionText, buildRefundedText } from './refund.rules.js';

// Thông báo trong ứng dụng của hoàn cọc (payment B8; PLAN 5.12, 4.7 #8). `HoanCocThanhCong` có thêm thư `680:2` (payment B17: dòng `email_thong_bao` qua `insertEmailRow` của booking, worker của booking gửi);
// `HoanCocCanXuLy` của Quản trị viên chỉ là thông báo trong ứng dụng.
// Ghi bằng `em` của NGƯỜI GỌI để thông báo và lần đổi tiền cùng commit hay cùng rollback. GẮN `lich_hen_id` (4.7 #8): khác `loai_su_kien` nên không đụng UNIQUE `thong_bao_index_lich_hen`; đổi lại, INSERT xin khoá chia sẻ
// trên hàng `lich_hen` SAU khi đã giữ ví X (đảo 7b trước 6), vô hại theo lập luận ở 5.3 và được đo bằng DTT-16: thấy 1213 lộ ra ngoài thì quay về không gắn.
// Không nuốt lỗi: chỉ 1062 của đúng chỉ mục `(lich_hen_id, tai_khoan_id, loai_su_kien)` được coi là "đã có" (do `insertThongBao` của booking).

@Injectable()
export class RefundNotifier {
  /**
   * Báo Bệnh nhân đã hoàn cọc. `lichHenId` là lịch bị huỷ (gắn vào thông báo). payment B17: thông báo MỚI ghi thì xếp thêm thư `680:2` (`email_thong_bao` `ChoGui`) cùng giao dịch;
   * "đã có" thì không xếp lần hai.
   */
  async notifyRefunded(
    em: EntityManager,
    input: {
      lichHenId: string;
      taiKhoanId: string;
      maLichHen: string;
      soTien: string;
      now: Date;
    },
  ) {
    const result = await insertThongBao(em, {
      taiKhoanId: input.taiKhoanId,
      noiDung: buildRefundedText(input.maLichHen, input.soTien),
      loaiSuKien: REFUND_NOTIFICATION_EVENTS.REFUNDED,
      lichHenId: input.lichHenId,
      thoiDiemTao: input.now,
    });
    if (result.kind === 'Inserted') await insertEmailRow(em, result.thongBaoId);
    return result;
  }

  /** Báo các Quản trị viên `ToanHeThong` hoàn cọc hết lượt thử. Mỗi người một dòng; ghi lần hai cho cùng lịch chỉ là "đã có". Trả số thông báo MỚI ghi. */
  async notifyNeedsAttention(
    em: EntityManager,
    input: {
      lichHenId: string;
      maLichHen: string;
      adminIds: readonly string[];
      now: Date;
    },
  ): Promise<number> {
    let written = 0;
    for (const taiKhoanId of input.adminIds) {
      const result = await insertThongBao(em, {
        taiKhoanId,
        noiDung: buildNeedsAttentionText(input.maLichHen),
        loaiSuKien: REFUND_NOTIFICATION_EVENTS.NEEDS_ATTENTION,
        lichHenId: input.lichHenId,
        thoiDiemTao: input.now,
      });
      if (result.kind === 'Inserted') written += 1;
    }
    return written;
  }
}
