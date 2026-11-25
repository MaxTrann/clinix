import type { EntityManager } from 'typeorm';
import {
  BOOKING_NOTIFICATION_EVENTS,
  RESCHEDULE_NOTIFICATION_EVENTS,
} from '../appointments.constants.js';
import {
  BRANCH_CHANGE_MAIL_EVENTS,
  EMAIL_MAX_ATTEMPTS,
  EXAM_MAIL_EVENTS,
  EMAIL_RETRY_GAP_MINUTES,
  PAYMENT_MAIL_EVENTS,
} from './notifications.constants.js';

// NƠI DUY NHẤT booking ĐỔI `email_thong_bao` (AR-06 `UPDATE email_thong_bao`; task B15; PLAN booking 5.12; TRACKING 3.37 B15-H). Mọi câu chạy TỰ XÁC NHẬN (autocommit, dùng `db.manager`), mỗi câu một hàng theo khoá chính: không giao dịch dài,
// không khoá nào giữ qua lúc gọi SMTP. Hai bản API cùng chạy không gửi trùng nhờ câu NHẬN VIỆC có điều kiện: đúng MỘT bên có `affectedRows` = 1 (đúng chữ `docs/database`: "gửi lại bằng UPDATE có điều kiện để không gửi trùng").
//
// CHECK `chk_email_thong_bao_ket_qua`: `DaGui` cần `da_gui_luc` và `so_lan_thu` ≥ 1; `ThatBai` cần `da_gui_luc` NULL, `loi_cuoi` và `so_lan_thu` ≥ 1; `ChoGui` cần `da_gui_luc` NULL. Câu nhận việc tăng `so_lan_thu` TRƯỚC khi gửi nên cả hai
// kết quả đều thoả `so_lan_thu` ≥ 1.

export type EmailStatus = 'ChoGui' | 'ThatBai';

/** Một thư đến lượt gửi, ĐỌC trước khi nhận việc (giá trị cũ dùng làm điều kiện nhận việc và để trả lại khi không gửi được vì chưa cấu hình SMTP). */
export interface DueEmail {
  id: string;
  thongBaoId: string;
  trangThai: EmailStatus;
  soLanThu: number;
  /** 'YYYY-MM-DD HH:mm:ss' (giờ Việt Nam, như đã lưu) hoặc null */
  lanThuCuoiLuc: string | null;
  loiCuoi: string | null;
}

/**
 * Loại có thư mà worker xử lý (18 loại): bốn loại của booking (B15), năm loại của payment, wallet (payment B17), bốn loại của yêu cầu thay đổi chi nhánh (admin C4), bốn loại của đổi lịch và yêu cầu
 * đổi lịch (reschedule B3) và loại hoàn thành lịch khám (notification B4). Thứ tự cố định: booking trước, loại mới thêm vào CUỐI. Đây là PHẦN GỐC của mã: mã có phiên bản (`ThayDoiChiNhanhAnhHuongLichHen:v2`) khớp nhờ câu chọn lô so phần trước dấu `:`.
 */
export const MAIL_EVENTS: readonly string[] = [
  ...Object.values(BOOKING_NOTIFICATION_EVENTS),
  ...Object.values(PAYMENT_MAIL_EVENTS),
  ...Object.values(BRANCH_CHANGE_MAIL_EVENTS),
  ...Object.values(RESCHEDULE_NOTIFICATION_EVENTS),
  ...Object.values(EXAM_MAIL_EVENTS),
];

/**
 * Chọn lô thư đến lượt: `ChoGui` hoặc `ThatBai`, chưa hết `EMAIL_MAX_ATTEMPTS` lần, chưa thử hoặc lần thử cuối đã quá `EMAIL_RETRY_GAP_MINUTES`, và THUỘC `MAIL_EVENTS` (JOIN `thong_bao`: bảng này còn chứa
 * các loại chỉ có trong ứng dụng, worker không được đụng). Sắp theo khoá chính, con trỏ `afterId` để một lô không lặp lại hàng của lô trước.
 * `SUBSTRING_INDEX(loai, ':', 1)` bỏ hậu tố phiên bản `:v{n}` của admin C4; mã không có dấu `:` giữ nguyên, nên các loại của booking và payment so như cũ.
 */
export const SELECT_DUE_EMAILS_SQL = `SELECT CAST(e.email_thong_bao_id AS CHAR) AS id, CAST(e.thong_bao_id AS CHAR) AS thongBaoId, e.trang_thai AS trangThai, e.so_lan_thu AS soLanThu,
       DATE_FORMAT(e.lan_thu_cuoi_luc, '%Y-%m-%d %H:%i:%s') AS lanThuCuoiLuc, e.loi_cuoi AS loiCuoi
  FROM email_thong_bao e
  JOIN thong_bao t ON t.thong_bao_id = e.thong_bao_id
 WHERE e.trang_thai IN ('ChoGui', 'ThatBai')
   AND e.so_lan_thu < ?
   AND (e.lan_thu_cuoi_luc IS NULL OR e.lan_thu_cuoi_luc <= ?)
   AND SUBSTRING_INDEX(t.loai_su_kien, ':', 1) IN (${MAIL_EVENTS.map(() => '?').join(', ')})
   AND e.email_thong_bao_id > ?
 ORDER BY e.email_thong_bao_id
 LIMIT ?`;

export async function selectDueEmails(
  em: EntityManager,
  input: { now: Date; afterId: string; limit: number },
): Promise<DueEmail[]> {
  const retryBefore = new Date(
    input.now.getTime() - EMAIL_RETRY_GAP_MINUTES * 60_000,
  );
  const rows: (Omit<DueEmail, 'soLanThu'> & { soLanThu: number | string })[] =
    await em.query(SELECT_DUE_EMAILS_SQL, [
      EMAIL_MAX_ATTEMPTS,
      retryBefore,
      ...MAIL_EVENTS,
      input.afterId,
      input.limit,
    ]);
  return rows.map((row) => ({ ...row, soLanThu: Number(row.soLanThu) }));
}

const AFFECTED_ONE = (result: { affectedRows?: number }): boolean =>
  result.affectedRows === 1;

/** NHẬN VIỆC: tăng `so_lan_thu` và ghi `lan_thu_cuoi_luc` nếu hàng vẫn đúng như đã đọc. `true` = bên này thắng; `false` = bên khác đã nhận trước (không gửi). */
export const CLAIM_EMAIL_SQL = `UPDATE email_thong_bao SET so_lan_thu = so_lan_thu + 1, lan_thu_cuoi_luc = ?
 WHERE email_thong_bao_id = ? AND trang_thai IN ('ChoGui', 'ThatBai') AND so_lan_thu = ?`;

export async function claimEmail(
  em: EntityManager,
  email: DueEmail,
  now: Date,
): Promise<boolean> {
  return AFFECTED_ONE(
    await em.query(CLAIM_EMAIL_SQL, [now, email.id, email.soLanThu]),
  );
}

// Ba câu kết quả chỉ ghi khi hàng vẫn ở đúng lần nhận việc CỦA MÌNH (`so_lan_thu` = số đã đọc + 1): nếu mình chậm quá nhịp và bên khác đã nhận lại thì kết quả của mình bị bỏ, không đè
export const MARK_SENT_SQL = `UPDATE email_thong_bao SET trang_thai = 'DaGui', da_gui_luc = ?, loi_cuoi = NULL
 WHERE email_thong_bao_id = ? AND trang_thai IN ('ChoGui', 'ThatBai') AND so_lan_thu = ?`;
export const MARK_FAILED_SQL = `UPDATE email_thong_bao SET trang_thai = 'ThatBai', da_gui_luc = NULL, loi_cuoi = ?
 WHERE email_thong_bao_id = ? AND trang_thai IN ('ChoGui', 'ThatBai') AND so_lan_thu = ?`;
export const RELEASE_CLAIM_SQL = `UPDATE email_thong_bao SET so_lan_thu = ?, lan_thu_cuoi_luc = ?, trang_thai = ?, loi_cuoi = ?
 WHERE email_thong_bao_id = ? AND so_lan_thu = ?`;

export async function markSent(
  em: EntityManager,
  email: DueEmail,
  at: Date,
): Promise<boolean> {
  return AFFECTED_ONE(
    await em.query(MARK_SENT_SQL, [at, email.id, email.soLanThu + 1]),
  );
}

/** `loiCuoi` là chữ CỐ ĐỊNH (loại lỗi), không bao giờ có địa chỉ, tiêu đề hay nội dung; cột `varchar(500)`. */
export async function markFailed(
  em: EntityManager,
  email: DueEmail,
  loiCuoi: string,
): Promise<boolean> {
  return AFFECTED_ONE(
    await em.query(MARK_FAILED_SQL, [
      loiCuoi.slice(0, 500),
      email.id,
      email.soLanThu + 1,
    ]),
  );
}

/** Trả hàng về đúng giá trị TRƯỚC khi nhận việc (chưa cấu hình SMTP không được tính là một lần thử). */
export async function releaseClaim(
  em: EntityManager,
  email: DueEmail,
): Promise<boolean> {
  return AFFECTED_ONE(
    await em.query(RELEASE_CLAIM_SQL, [
      email.soLanThu,
      email.lanThuCuoiLuc,
      email.trangThai,
      email.loiCuoi,
      email.id,
      email.soLanThu + 1,
    ]),
  );
}

export interface EmailPayload {
  taiKhoanId: string;
  noiDung: string;
  loai: string;
  lichHenId: string | null;
  /** Chỉ có với thông báo của yêu cầu thay đổi chi nhánh (admin C4) */
  yeuCauId: string | null;
  /** Chỉ có với thông báo của yêu cầu đổi lịch ngoài chính sách (reschedule B3); khi có thì `lichHenId` để trống */
  yeuCauDoiLichId: string | null;
  email: string;
  hoTen: string;
  /** Lúc ghi thông báo "dd/MM/yyyy — HH:mm" (giờ Việt Nam như đã lưu, đọc bằng `DATE_FORMAT` nên không lệch múi giờ): "thời gian" của thư payment, wallet (B17) */
  thoiDiem: string;
}

export const READ_EMAIL_PAYLOAD_SQL = `SELECT CAST(t.tai_khoan_id AS CHAR) AS taiKhoanId, t.noi_dung AS noiDung, t.loai_su_kien AS loai, CAST(t.lich_hen_id AS CHAR) AS lichHenId,
       CAST(t.yeu_cau_thay_doi_chi_nhanh_id AS CHAR) AS yeuCauId, CAST(t.yeu_cau_doi_lich_ngoai_chinh_sach_id AS CHAR) AS yeuCauDoiLichId, tk.email AS email, tk.ho_ten AS hoTen, DATE_FORMAT(t.thoi_diem_tao, '%d/%m/%Y — %H:%i') AS thoiDiem
  FROM thong_bao t
  JOIN tai_khoan tk ON tk.tai_khoan_id = t.tai_khoan_id
 WHERE t.thong_bao_id = ?`;

/** Người nhận (TÀI KHOẢN của dòng `thong_bao`) và chữ của thông báo. `null` khi dòng không còn. */
export async function readEmailPayload(
  em: EntityManager,
  thongBaoId: string,
): Promise<EmailPayload | null> {
  const rows: EmailPayload[] = await em.query(READ_EMAIL_PAYLOAD_SQL, [
    thongBaoId,
  ]);
  return rows[0] ?? null;
}
