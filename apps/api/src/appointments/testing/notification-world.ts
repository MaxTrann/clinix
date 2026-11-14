import type { DataSource, EntityManager } from 'typeorm';
import { SystemConfigRepository } from '../../admin/system-config/system-config.repository.js';
import { FakeMailService } from '../../mail/testing/fake-mail.service.js';
import { SystemConfigService } from '../../admin/system-config/system-config.service.js';
import { ExamPriceReader } from '../../pricing/exam-price.reader.js';
import { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';
import { BranchHoursReader } from '../../scheduling/branch-hours/branch-hours.reader.js';
import { randomCodeSuffix } from '../appointment-code.js';
import { AppointmentCancellationService } from '../cancel/appointment-cancellation.service.js';
import { BookingSummaryReader } from '../create/booking-summary.reader.js';
import { CreateAppointmentService } from '../create/create-appointment.service.js';
import { RefundPolicyReader } from '../create/refund-policy.js';
import { withBookingTransaction } from '../locking/booking-transaction.js';
import { BookingNotifier } from '../notifications/booking-notifier.js';
import { EmailOutboxJob } from '../notifications/email-outbox.job.js';
import { EmailOutboxService } from '../notifications/email-outbox.service.js';
import { BookabilityReader } from '../slots/bookability.reader.js';
import { SlotHoldService } from '../slots/slot-hold.service.js';
import { AppointmentTransitionService } from '../state/appointment-transition.service.js';
import {
  createFakePorts,
  FakeDoctorLeavePort,
  FakePaymentPort,
  FakePendingBranchChangesPort,
} from './fake-ports.js';

// Hạ tầng test dùng chung của B15 trên MySQL THẬT (task B15; PLAN booking 7.43 `[đề xuất]`; TRACKING 3.37 B15-K): cả hai int-spec (tuần tự và đồng thời) cùng dựng MỘT bộ dịch vụ chạy `BookingNotifier` THẬT, đọc hàng `thong_bao` và
// `email_thong_bao`, và chụp trạng thái để so "không đổi một byte" sau hoàn tác, để jscpd (vốn quét cả `*.int-spec.ts`) không thấy cùng một đoạn ở nhiều file. KHÔNG sửa `create-appointment-world.ts`, `cancel-world.ts` hay
// `status-world.ts` (của B8, B10, B12: chúng dựng sẵn thông báo `Fake` hay `Recording`), mà dựng bộ riêng ở đây từ các lớp thật. Nằm trong `testing/` nên AR-01 và AR-06 bỏ qua.

/**
 * "Một bản API" với thông báo THẬT: `AppointmentTransitionService` và `AppointmentCancellationService` thật, cổng danh sách chờ, hoàn tiền và tiền đã thu là bản `Fake` (truyền bộ cổng chung để hai bản API đếm vào cùng bộ đếm).
 * `BookingNotifier` ghi `thong_bao` và `email_thong_bao` bằng `em` của từng giao dịch.
 */
export function createRealNotifierStack(
  db: DataSource,
  ports: ReturnType<typeof createFakePorts> = createFakePorts(),
) {
  const notifier = new BookingNotifier();
  const transition = new AppointmentTransitionService(
    db,
    new SlotHoldService(),
    ports.waitlist,
    notifier,
  );
  const cancellation = new AppointmentCancellationService(
    db,
    transition,
    new BranchAccessPolicy(),
    ports.paymentSummary,
    ports.refund,
    ports.waitlist,
    notifier,
  );
  return { ports, notifier, transition, cancellation };
}

/** `CreateAppointmentService` THẬT (đường tạo cọc 0đ gọi `notify`) với thông báo thật; thanh toán, nghỉ phép, đổi chi nhánh là `Fake`. */
export function createRealCreateService(db: DataSource) {
  const reader = new BookabilityReader(
    new BranchHoursReader(),
    new FakeDoctorLeavePort(),
    new FakePendingBranchChangesPort(),
  );
  return new CreateAppointmentService(
    db,
    new SystemConfigService(new SystemConfigRepository(db)),
    reader,
    new SlotHoldService(),
    new BookingSummaryReader(new ExamPriceReader(db), new RefundPolicyReader()),
    new FakePaymentPort(),
    new BookingNotifier(),
    randomCodeSuffix,
  );
}

/** `confirmPaid` trong MỘT `withBookingTransaction` THẬT (như `payment` sẽ làm). */
export const runConfirmPaid = (
  db: DataSource,
  transition: AppointmentTransitionService,
  lichHenId: string,
  soTienDaThu = '100000.00',
) =>
  withBookingTransaction(
    db,
    (em) => transition.confirmPaid(em, { lichHenId, soTienDaThu }),
    { label: 'test-confirm-paid' },
  );

export interface ThongBaoRow {
  thongBaoId: string;
  taiKhoanId: string;
  noiDung: string;
  loai: string;
  lichHenId: string | null;
  trangThaiDoc: number;
  thoiDiemTao: string;
}

export interface EmailRow {
  thongBaoId: string;
  trangThai: string;
  soLanThu: number;
  lanThuCuoiLuc: string | null;
  daGuiLuc: string | null;
  loiCuoi: string | null;
}

const TS = (column: string) => `DATE_FORMAT(${column}, '%Y-%m-%d %H:%i:%s')`;

/** Mọi dòng `thong_bao` theo thứ tự ghi (id là chuỗi, giờ là chuỗi giờ Việt Nam); `loai` lọc theo loại sự kiện. */
export function readThongBao(
  db: DataSource | EntityManager,
  loai?: string,
): Promise<ThongBaoRow[]> {
  return db.query(
    `SELECT CAST(thong_bao_id AS CHAR) AS thongBaoId, CAST(tai_khoan_id AS CHAR) AS taiKhoanId, noi_dung AS noiDung,
            loai_su_kien AS loai, CAST(lich_hen_id AS CHAR) AS lichHenId, trang_thai_doc AS trangThaiDoc, ${TS('thoi_diem_tao')} AS thoiDiemTao
       FROM thong_bao ${loai === undefined ? '' : 'WHERE loai_su_kien = ?'} ORDER BY thong_bao_id`,
    loai === undefined ? [] : [loai],
  );
}

/** Mọi dòng `email_thong_bao` theo thứ tự ghi. */
export function readEmails(
  db: DataSource | EntityManager,
): Promise<EmailRow[]> {
  return db.query(
    `SELECT CAST(thong_bao_id AS CHAR) AS thongBaoId, trang_thai AS trangThai, so_lan_thu AS soLanThu,
            ${TS('lan_thu_cuoi_luc')} AS lanThuCuoiLuc, ${TS('da_gui_luc')} AS daGuiLuc, loi_cuoi AS loiCuoi
       FROM email_thong_bao ORDER BY email_thong_bao_id`,
  );
}

/**
 * Ảnh chụp mọi thứ một lần đổi trạng thái có thể đụng: lịch, khung giờ, bộ đếm no-show, `thong_bao` và `email_thong_bao`. Hoàn tác trọn thì ảnh sau BẰNG ảnh trước (kể cả cột tự cập nhật,
 * vì hoàn tác không ghi lại gì).
 */
export async function worldState(db: DataSource) {
  return {
    lich: await db.query('SELECT * FROM lich_hen ORDER BY lich_hen_id'),
    khungGio: await db.query(
      'SELECT khung_gio_id, trang_thai, giu_cho_den FROM khung_gio ORDER BY khung_gio_id',
    ),
    benhNhan: await db.query(
      'SELECT tai_khoan_id, so_lan_no_show, khoa_dat_lich_do_no_show FROM benh_nhan ORDER BY tai_khoan_id',
    ),
    thongBao: await readThongBao(db),
    emails: await readEmails(db),
  };
}

/**
 * Dọn giữa các vòng đua có thông báo THẬT: dòng `email_thong_bao` (khoá ngoại tới `thong_bao`) TRƯỚC, rồi `thong_bao`, `lich_hen`, và đưa mọi khung giờ về `ConTrong`. `resetBookingRound` có sẵn (B11) không xoá
 * `email_thong_bao` nên sẽ gặp lỗi 1451 khi còn dòng hộp thư đi.
 */
export async function resetNotificationRound(db: DataSource): Promise<void> {
  await db.query('DELETE FROM email_thong_bao');
  await db.query('DELETE FROM thong_bao');
  await db.query('DELETE FROM lich_hen');
  await db.query(
    "UPDATE khung_gio SET trang_thai = 'ConTrong', giu_cho_den = NULL",
  );
}

/** Một dòng `thong_bao` KHÔNG thuộc booking (không `lich_hen_id`), như nghỉ phép của doctor ghi: để chứng minh B15 không đụng dòng của nguồn khác. */
export async function insertForeignThongBao(
  db: DataSource,
  taiKhoanId: string,
  noiDung = 'Yêu cầu nghỉ phép đã được gửi, đang chờ duyệt.',
): Promise<void> {
  await db.query(
    "INSERT INTO thong_bao (tai_khoan_id, noi_dung, loai_su_kien, thoi_diem_tao) VALUES (?, ?, 'NghiPhepDaGui', '2026-11-02 08:00:00')",
    [taiKhoanId, noiDung],
  );
}

/**
 * "Một bản API" của WORKER gửi thư: `EmailOutboxService` và `EmailOutboxJob` THẬT với `FakeMailService` (test KHÔNG BAO GIỜ gửi thư thật, TB-08). Truyền `mail` riêng để hai bản API đếm thư riêng,
 * hay chung để đếm tổng.
 */
export function createOutbox(
  db: DataSource,
  mail: FakeMailService = new FakeMailService(),
) {
  const service = new EmailOutboxService(db, mail);
  return { mail, service, job: new EmailOutboxJob(service) };
}

export interface OutboxRow extends EmailRow {
  id: string;
}

/** Mọi dòng `email_thong_bao` kèm id, theo thứ tự ghi. */
export function readOutbox(db: DataSource): Promise<OutboxRow[]> {
  return db.query(
    `SELECT CAST(email_thong_bao_id AS CHAR) AS id, CAST(thong_bao_id AS CHAR) AS thongBaoId, trang_thai AS trangThai, so_lan_thu AS soLanThu,
            ${TS('lan_thu_cuoi_luc')} AS lanThuCuoiLuc, ${TS('da_gui_luc')} AS daGuiLuc, loi_cuoi AS loiCuoi
       FROM email_thong_bao ORDER BY email_thong_bao_id`,
  );
}

export interface QueuedEmailSpec {
  taiKhoanId: string;
  /** `null` = thông báo không gắn lịch hẹn (nguồn khác) */
  lichHenId: string | null;
  loai: string;
  noiDung?: string;
  trangThai?: 'ChoGui' | 'DaGui' | 'ThatBai' | 'BoQua';
  soLanThu?: number;
  /** 'YYYY-MM-DD HH:mm:ss' giờ Việt Nam */
  lanThuCuoiLuc?: string | null;
  daGuiLuc?: string | null;
  loiCuoi?: string | null;
}

/**
 * Chèn thẳng MỘT dòng `thong_bao` và MỘT dòng `email_thong_bao` ở trạng thái tuỳ ý (SQL thẳng: dữ liệu dựng của test; thoả `chk_email_thong_bao_ket_qua` nếu người gọi truyền đúng). Dùng cho ca cần trạng thái mà
 * `BookingNotifier` không tạo ra (đã gửi, thất bại, đã nhận việc, nguồn khác).
 */
export async function insertQueuedEmail(
  db: DataSource,
  spec: QueuedEmailSpec,
): Promise<{ thongBaoId: string; emailId: string }> {
  const thongBao: { insertId: number | string } = await db.query(
    "INSERT INTO thong_bao (tai_khoan_id, noi_dung, loai_su_kien, lich_hen_id, thoi_diem_tao) VALUES (?, ?, ?, ?, '2026-11-02 08:00:00')",
    [
      spec.taiKhoanId,
      spec.noiDung ?? 'Thông báo thử nghiệm.',
      spec.loai,
      spec.lichHenId,
    ],
  );
  const email: { insertId: number | string } = await db.query(
    'INSERT INTO email_thong_bao (thong_bao_id, trang_thai, so_lan_thu, lan_thu_cuoi_luc, da_gui_luc, loi_cuoi) VALUES (?, ?, ?, ?, ?, ?)',
    [
      thongBao.insertId,
      spec.trangThai ?? 'ChoGui',
      spec.soLanThu ?? 0,
      spec.lanThuCuoiLuc ?? null,
      spec.daGuiLuc ?? null,
      spec.loiCuoi ?? null,
    ],
  );
  return {
    thongBaoId: String(thongBao.insertId),
    emailId: String(email.insertId),
  };
}

/** Địa chỉ email của một tài khoản (người nhận thư kỳ vọng). */
export async function emailOf(
  db: DataSource,
  taiKhoanId: string,
): Promise<string> {
  const rows: { email: string }[] = await db.query(
    'SELECT email FROM tai_khoan WHERE tai_khoan_id = ?',
    [taiKhoanId],
  );
  return rows[0]!.email;
}
