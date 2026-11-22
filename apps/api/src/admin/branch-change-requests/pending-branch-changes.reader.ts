import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { ScheduleRowValue } from '../branches/impact/branch-diff.js';
import { impactInputOf, parseRequestContent } from './request-content.js';

// Hàm đọc cho booking: các thay đổi chi nhánh ĐÃ DUYỆT nhưng CHƯA ÁP DỤNG (admin B10; Q6, Q48; CN-65, CN-88, CN-108).
// Booking dùng để chặn đặt và đổi lịch vào vùng sẽ bị loại khỏi lịch mới, trong suốt thời gian chờ, kể cả khi yêu cầu đã quá hạn.
// CHỈ ĐỌC. Nhận `em` của NGƯỜI GỌI (giao dịch đặt lịch đã khoá `khung_gio`; B10 duyệt khoá cùng các khung giờ đó trước khi commit,
// nên booking luôn thấy bản đã commit của lần duyệt chạy song song). Lệch có chủ ý với chữ ký `getPendingEffectiveChanges(chiNhanhId)` ở PLAN.

export interface PendingEffectiveChange {
  yeuCauThayDoiChiNhanhId: string;
  /** "dự kiến có hiệu lực" (Q48): vùng bị loại tính từ mốc này trở đi */
  hieuLucTu: Date;
  /** Đã đến hạn mà còn lịch hoặc ca chưa xử lý (B11 đặt `qua_han_luc`); vẫn chặn như thường */
  quaHan: boolean;
  /** Dòng MỚI của từng thứ đổi (đủ 6 khóa). Thứ không có ở đây giữ nguyên lịch đang áp dụng. */
  lichHoatDong: ScheduleRowValue[];
  /** Dịch vụ sẽ bị bỏ khỏi chi nhánh (rỗng khi không đổi dịch vụ) */
  dichVuBoIds: string[];
}

interface PendingRow {
  yeuCauThayDoiChiNhanhId: string;
  hieuLucTu: string;
  quaHan: number | string;
  noiDungTruoc: unknown;
  noiDungSau: unknown;
}

@Injectable()
export class PendingBranchChangesReader {
  /**
   * `DaDuyet` và `ap_dung_luc IS NULL` (không lọc `qua_han_luc`: quá hạn vẫn chặn). Theo `hieu_luc_tu`, rồi id.
   * Nội dung dạng cũ (quy tắc 43) không có ở yêu cầu đang chờ: B10 từ chối duyệt dạng cũ (`NOI_DUNG_YEU_CAU_KHONG_HOP_LE`).
   */
  async getPendingEffectiveChanges(
    em: EntityManager,
    chiNhanhId: string,
  ): Promise<PendingEffectiveChange[]> {
    const rows: PendingRow[] = await em.query(
      `SELECT CAST(yeu_cau_thay_doi_chi_nhanh_id AS CHAR) AS yeuCauThayDoiChiNhanhId,
              DATE_FORMAT(hieu_luc_tu, '%Y-%m-%d %H:%i:%s') AS hieuLucTu, qua_han_luc IS NOT NULL AS quaHan,
              noi_dung_truoc AS noiDungTruoc, noi_dung_sau AS noiDungSau
         FROM yeu_cau_thay_doi_chi_nhanh
        WHERE chi_nhanh_id = ? AND trang_thai = 'DaDuyet' AND ap_dung_luc IS NULL
        ORDER BY hieu_luc_tu, yeu_cau_thay_doi_chi_nhanh_id`,
      [chiNhanhId],
    );
    return rows.map((row) => {
      const input = impactInputOf(
        parseRequestContent(row.noiDungTruoc, row.noiDungSau),
      );
      return {
        yeuCauThayDoiChiNhanhId: row.yeuCauThayDoiChiNhanhId,
        // Chuỗi giờ VN của DB ⇒ Date, cộng +07:00 cố định (không phụ thuộc cách driver đổi DATETIME)
        hieuLucTu: new Date(`${row.hieuLucTu.replace(' ', 'T')}+07:00`),
        quaHan: Number(row.quaHan) === 1,
        lichHoatDong: input.changedDays,
        dichVuBoIds: input.removedServiceIds,
      };
    });
  }
}
