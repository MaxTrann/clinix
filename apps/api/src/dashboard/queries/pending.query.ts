import type { EntityManager } from 'typeorm';

// Số yêu cầu ĐANG CHỜ DUYỆT (PLAN dashboard 5.6 (7); Q6, MH1, MH7). Chỉ đọc; chạy trong `runReadOnly` của service. Mọi thời điểm, KHÔNG theo bộ lọc ngày.
// Chi nhánh của từng loại khớp trang duyệt tương ứng, để số ở dashboard bằng tổng của trang đó (DCD-03):
//  - nghỉ phép: chi nhánh HIỆN TẠI của bác sĩ (`bac_si.chi_nhanh_id`, MH7);
//  - đổi lịch ngoài chính sách: chi nhánh của lịch (`lich_hen.chi_nhanh_id`);
//  - thay đổi chi nhánh: `chi_nhanh_id` của yêu cầu (chỉ `ChoDuyet`; yêu cầu đã duyệt chưa áp dụng không còn chờ ai duyệt);
//  - rút tiền: KHÔNG gắn chi nhánh, luôn là số toàn hệ thống (MH1). Service trả `null` cho Quản trị viên Chi nhánh (Q6).
// Một câu với bốn truy vấn con: một lượt tới DB, cùng ảnh chụp với các số khác.
const PENDING_SQL = `
  SELECT
    (SELECT COUNT(*) FROM yeu_cau_nghi_phep y
       JOIN bac_si bs ON bs.tai_khoan_id = y.bac_si_id
       WHERE y.trang_thai = 'ChoDuyet' AND (? IS NULL OR bs.chi_nhanh_id = ?)) AS nghiPhep,
    (SELECT COUNT(*) FROM yeu_cau_doi_lich_ngoai_chinh_sach r
       JOIN lich_hen lh ON lh.lich_hen_id = r.lich_hen_id
       WHERE r.trang_thai = 'ChoDuyet' AND (? IS NULL OR lh.chi_nhanh_id = ?)) AS doiLich,
    (SELECT COUNT(*) FROM yeu_cau_thay_doi_chi_nhanh c
       WHERE c.trang_thai = 'ChoDuyet' AND (? IS NULL OR c.chi_nhanh_id = ?)) AS thayDoiChiNhanh,
    (SELECT COUNT(*) FROM yeu_cau_rut_tien w
       WHERE w.trang_thai = 'ChoDuyet') AS rutTien`;

export interface PendingCounts {
  nghiPhep: number;
  doiLich: number;
  thayDoiChiNhanh: number;
  /** Toàn hệ thống, không theo chi nhánh */
  rutTien: number;
}

export async function countPending(
  manager: EntityManager,
  chiNhanhId: string | null,
): Promise<PendingCounts> {
  const rows: Record<keyof PendingCounts, number | string>[] =
    await manager.query(PENDING_SQL, [
      chiNhanhId,
      chiNhanhId,
      chiNhanhId,
      chiNhanhId,
      chiNhanhId,
      chiNhanhId,
    ]);
  const row = rows[0];
  return {
    nghiPhep: Number(row?.nghiPhep ?? 0),
    doiLich: Number(row?.doiLich ?? 0),
    thayDoiChiNhanh: Number(row?.thayDoiChiNhanh ?? 0),
    rutTien: Number(row?.rutTien ?? 0),
  };
}
