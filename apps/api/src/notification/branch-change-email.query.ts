import type { EntityManager } from 'typeorm';
import { CHANGE_NOTICE_TYPES } from './branch-change-events.js';

// Hai câu về THƯ của yêu cầu thay đổi chi nhánh (admin C4): dừng thư còn chờ gửi (Q47, Q48, H21; PLAN 4.2a ý 4) và đọc trạng thái gửi để B9 hiển thị (Q9).
// Câu gửi, nhận việc, ghi kết quả vẫn chỉ ở worker của booking (`appointments/notifications/email-outbox.query.ts`).

// Thư báo thay đổi của bệnh nhân mang mã có phiên bản (`ThayDoiChiNhanhAnhHuongLichHen:v1`, …) nên so bằng tiền tố `LIKE 'Ma:v%'`.
// Mã chỉ gồm chữ cái nên không có ký tự đại diện `%` hay `_` nào lọt vào mẫu.
const NOTICE_PATTERNS = CHANGE_NOTICE_TYPES.map((type) => `${type}:v%`);

export const SKIP_PENDING_NOTICES_SQL = `UPDATE email_thong_bao e
  JOIN thong_bao t ON t.thong_bao_id = e.thong_bao_id
   SET e.trang_thai = 'BoQua'
 WHERE t.yeu_cau_thay_doi_chi_nhanh_id = ?
   AND e.trang_thai IN ('ChoGui', 'ThatBai')
   AND (${NOTICE_PATTERNS.map(() => 't.loai_su_kien LIKE ?').join(' OR ')})`;

/**
 * Chuyển thư báo thay đổi CÒN CHỜ GỬI (`ChoGui`, hoặc `ThatBai` còn lượt thử) của một yêu cầu sang `BoQua`. Gọi trong giao dịch hủy hay dời (B21, B22),
 * TRƯỚC khi ghi thông báo mới của chính lần hủy hay dời đó. Worker chỉ nhận `ChoGui`/`ThatBai` nên sau câu này không gửi nữa; thư `DaGui` giữ nguyên.
 * Giới hạn đã biết (PLAN 4.2a ý 4): thư worker đã nhận việc trước lúc này vẫn có thể tới người nhận, vì vậy lần hủy hay dời luôn báo thêm một lần.
 * @returns số thư đã dừng
 */
export async function skipPendingChangeNotices(
  em: EntityManager,
  yeuCauId: string,
): Promise<number> {
  const result: { affectedRows?: number } = await em.query(
    SKIP_PENDING_NOTICES_SQL,
    [yeuCauId, ...NOTICE_PATTERNS],
  );
  return result.affectedRows ?? 0;
}

export type EmailDeliveryStatus = 'ChoGui' | 'DaGui' | 'ThatBai' | 'BoQua';

/** Trạng thái thông báo và thư của một yêu cầu, cho màn chi tiết B9. Cố ý KHÔNG trả `loi_cuoi` (chữ lỗi kỹ thuật, không cần cho Quản trị viên). */
export interface BranchChangeNotificationStatus {
  thongBaoId: string;
  taiKhoanId: string;
  loaiSuKien: string;
  /** `null` = loại chỉ trong ứng dụng, không có thư */
  trangThaiEmail: EmailDeliveryStatus | null;
  soLanThu: number;
  /** 'YYYY-MM-DD HH:mm:ss' giờ Việt Nam, chỉ có khi `DaGui` */
  daGuiLuc: string | null;
}

export const READ_NOTIFICATION_STATUS_SQL = `SELECT CAST(t.thong_bao_id AS CHAR) AS thongBaoId, CAST(t.tai_khoan_id AS CHAR) AS taiKhoanId, t.loai_su_kien AS loaiSuKien,
       e.trang_thai AS trangThaiEmail, COALESCE(e.so_lan_thu, 0) AS soLanThu, DATE_FORMAT(e.da_gui_luc, '%Y-%m-%d %H:%i:%s') AS daGuiLuc
  FROM thong_bao t
  LEFT JOIN email_thong_bao e ON e.thong_bao_id = t.thong_bao_id
 WHERE t.yeu_cau_thay_doi_chi_nhanh_id = ?
 ORDER BY t.thong_bao_id`;

export async function readNotificationStatuses(
  em: EntityManager,
  yeuCauId: string,
): Promise<BranchChangeNotificationStatus[]> {
  const rows: (Omit<BranchChangeNotificationStatus, 'soLanThu'> & {
    soLanThu: number | string;
  })[] = await em.query(READ_NOTIFICATION_STATUS_SQL, [yeuCauId]);
  return rows.map((row) => ({ ...row, soLanThu: Number(row.soLanThu) }));
}
