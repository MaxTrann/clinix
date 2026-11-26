import type { EntityManager } from 'typeorm';
import { nowVN, todayVN } from '../../common/time/time.js';
import { NOTIFICATION_CATALOG } from '../../notification/catalog/notification-catalog.js';
import {
  isoWeekdayOfEpochDay,
  parseCalendarDate,
} from '../../scheduling/calendar-date.js';
import {
  BranchHoursReader,
  hoursKey,
} from '../../scheduling/branch-hours/branch-hours.reader.js';
import { shiftWindow } from '../../scheduling/branch-hours/shift-window.rules.js';
import { generateSlotStarts } from '../../scheduling/slots/slot-generator.rules.js';
import { syncShiftSlots } from '../../scheduling/slots/slot-generator.js';
import {
  isDemoRead,
  NOTIFICATION_DEMO_ACCOUNTS,
  NOTIFICATION_DEMO_PER_ACCOUNT,
  NOTIFICATION_DEMO_PREFIX,
  REMINDER_DEMO_DOCTOR_EMAIL,
  REMINDER_DEMO_LEAD_MINUTES,
  REMINDER_DEMO_MAX_LEAD_MINUTES,
  REMINDER_DEMO_OFFSET_HOURS,
  REMINDER_DEMO_PATIENT_EMAIL,
  REMINDER_DEMO_REASON,
  REMINDER_DEMO_SHIFTS,
  reminderDemoCode,
} from './notification-demo-data.js';
import { SeedError } from './seed-error.js';
import type { SeedCounts } from './seed.repository.js';

// Seed demo cho scope "Thông báo" (notification X3; PLAN notification 5.12 "Dữ liệu mẫu"). Chạy trong MỘT giao dịch của `seedTransaction`; CHỈ INSERT (add-only), chạy lại không ghi đè và không nhân đôi.
//  1. Mỗi tài khoản của `dev-accounts` có đủ `NOTIFICATION_DEMO_PER_ACCOUNT` thông báo mẫu, mã sự kiện lấy từ danh mục đúng người nhận, trộn đọc và chưa đọc. Không gắn lịch hẹn (không đụng UNIQUE theo lịch),
//     không ghi `email_thong_bao` (dữ liệu mẫu, không phải sự kiện thật: không được sinh thư).
//  2. Một lịch `DaXacNhan` của bệnh nhân dev với bác sĩ dev, giờ hẹn cách lúc chạy seed từ 2 giờ 5 phút tới 3 giờ 5 phút, ở một ca MỚI hôm nay (AR-01: seed không `UPDATE khung_gio`), để job nhắc lịch
//     gửi thư mốc 2 giờ tới hộp thư giả (KTB-07). Không chạy được trong giờ đó (ngoài giờ nhận khám, bác sĩ đã có ca) thì dừng với mã cố định, không ghi gì.
// Lịch chèn trực tiếp (không qua service đặt lịch) nên tự giữ bất biến như `exam-demo`: khung giờ `DaDat` cùng ca, giờ ca và khung giờ theo đúng mã sản xuất.

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

interface DoctorRow {
  bacSiId: string;
  chiNhanhId: string;
  dichVuKhamId: string;
  thoiLuong: number | string;
  giaMacDinh: string;
}

/** Giờ VN dạng 'YYYY-MM-DD HH:MM:SS' của một thời điểm tuyệt đối (cộng lệch cố định, không qua múi giờ máy). */
const vnText = (instant: Date): string =>
  new Date(instant.getTime() + VN_OFFSET_MS)
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ');

function clockText(seconds: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`;
}

export class NotificationDemoRepository {
  readonly counts: SeedCounts = { created: 0, skipped: 0 };

  constructor(
    private readonly manager: EntityManager,
    private readonly now: Date = nowVN(),
  ) {}

  async run(): Promise<void> {
    // Kiểm đủ điều kiện TRƯỚC mọi câu ghi: thiếu thì ném, cả giao dịch không có gì để hoàn tác
    const accounts = await this.requireAccounts();
    await this.requireReminderOffset();
    for (const account of NOTIFICATION_DEMO_ACCOUNTS)
      await this.ensureNotices(accounts.get(account.email)!, account.vaiTro);
    await this.ensureReminderAppointment(accounts);
  }

  // Năm tài khoản của `dev-accounts`; thiếu một ⇒ chưa chạy `dev-accounts`.
  private async requireAccounts(): Promise<Map<string, string>> {
    const emails = NOTIFICATION_DEMO_ACCOUNTS.map((a) => a.email);
    const rows = await this.manager.query<{ id: string; email: string }[]>(
      `SELECT CAST(tai_khoan_id AS CHAR) AS id, email FROM tai_khoan WHERE email IN (${emails.map(() => '?').join(', ')})`,
      emails,
    );
    const byEmail = new Map(rows.map((r) => [r.email, r.id]));
    if (emails.some((email) => !byEmail.has(email)))
      throw new SeedError('SEED_DEV_ACCOUNTS_REQUIRED');
    return byEmail;
  }

  // Mốc 2 giờ phải có trong cấu hình (chạy `config-dev` trước, hay Quản trị viên đã thêm mốc 2 ở màn Cài đặt hệ thống). Seed KHÔNG sửa cấu hình.
  private async requireReminderOffset(): Promise<void> {
    const rows = await this.manager.query<{ moc: unknown }[]>(
      'SELECT thoi_diem_nhac_lich AS moc FROM cau_hinh_he_thong WHERE id = 1',
    );
    const raw = rows[0]?.moc;
    const offsets: unknown =
      typeof raw === 'string' ? (JSON.parse(raw) as unknown) : raw;
    if (
      !Array.isArray(offsets) ||
      !offsets.includes(REMINDER_DEMO_OFFSET_HOURS)
    )
      throw new SeedError('SEED_REMINDER_CONFIG_REQUIRED');
  }

  /** Bổ sung cho đủ `NOTIFICATION_DEMO_PER_ACCOUNT` dòng mẫu của tài khoản; đã đủ thì bỏ qua. */
  private async ensureNotices(
    taiKhoanId: string,
    vaiTro: (typeof NOTIFICATION_DEMO_ACCOUNTS)[number]['vaiTro'],
  ): Promise<void> {
    const [existing] = await this.manager.query<{ n: string }[]>(
      'SELECT COUNT(*) AS n FROM thong_bao WHERE tai_khoan_id = ? AND noi_dung LIKE ?',
      [taiKhoanId, `${NOTIFICATION_DEMO_PREFIX}%`],
    );
    const have = Number(existing!.n);
    if (have >= NOTIFICATION_DEMO_PER_ACCOUNT) {
      this.counts.skipped++;
      return;
    }
    // Chỉ mã ĐÃ có nơi ghi trong mã và đúng người nhận (danh mục B1); mã có phiên bản không dùng (cần đúng hậu tố của nơi ghi)
    const codes = NOTIFICATION_CATALOG.filter(
      (e) =>
        e.trangThai === 'CoMa' && !e.coPhienBan && e.nguoiNhan.includes(vaiTro),
    );
    if (codes.length === 0) throw new SeedError('SEED_NOTIFICATION_CATALOG');
    for (let i = have; i < NOTIFICATION_DEMO_PER_ACCOUNT; i++) {
      const entry = codes[i % codes.length]!;
      // Mỗi dòng cách nhau 37 phút về trước: thứ tự hiển thị ổn định, trải qua vài ngày
      const at = vnText(new Date(this.now.getTime() - (i + 1) * 37 * 60_000));
      await this.manager.query(
        'INSERT INTO thong_bao (tai_khoan_id, noi_dung, loai_su_kien, trang_thai_doc, thoi_diem_tao) VALUES (?, ?, ?, ?, ?)',
        [
          taiKhoanId,
          `${NOTIFICATION_DEMO_PREFIX} ${entry.tieuDe} (dòng ${String(i + 1)}, dữ liệu minh họa).`,
          entry.ma,
          isDemoRead(i),
          at,
        ],
      );
    }
    this.counts.created++;
  }

  /** Lịch `DaXacNhan` cách giờ hẹn 2 giờ 5 phút tới 3 giờ 5 phút, ở một ca MỚI hôm nay của bác sĩ dev. Đã có lịch mẫu hôm nay thì bỏ qua. */
  private async ensureReminderAppointment(
    accounts: Map<string, string>,
  ): Promise<void> {
    const today = todayVN(this.now);
    const code = reminderDemoCode(today.replaceAll('-', ''));
    const [found] = await this.manager.query<{ n: string }[]>(
      'SELECT COUNT(*) AS n FROM lich_hen WHERE ma_lich_hen = ?',
      [code],
    );
    if (Number(found!.n) > 0) {
      this.counts.skipped++;
      return;
    }
    const doctor = await this.requireDoctor();
    const placed = await this.placeSlot(doctor, today);
    const nowText = vnText(this.now);
    await this.manager.query(
      `INSERT INTO lich_hen (ma_lich_hen, khung_gio_id, benh_nhan_id, ho_so_nguoi_than_id, bac_si_id, chi_nhanh_id, dich_vu_kham_id,
                            thoi_gian, gia_snapshot, trang_thai, ly_do_kham, thoi_diem_tao, cap_nhat_lan_cuoi, thoi_diem_xac_nhan)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, 'DaXacNhan', ?, ?, ?, ?)`,
      [
        code,
        placed.khungGioId,
        accounts.get(REMINDER_DEMO_PATIENT_EMAIL)!,
        doctor.bacSiId,
        doctor.chiNhanhId,
        doctor.dichVuKhamId,
        placed.ngayGio,
        doctor.giaMacDinh,
        REMINDER_DEMO_REASON,
        nowText,
        nowText,
        nowText,
      ],
    );
    this.counts.created++;
  }

  private async requireDoctor(): Promise<DoctorRow> {
    const rows = await this.manager.query<DoctorRow[]>(
      `SELECT CAST(b.tai_khoan_id AS CHAR) AS bacSiId, CAST(b.chi_nhanh_id AS CHAR) AS chiNhanhId,
              CAST(b.dich_vu_kham_id AS CHAR) AS dichVuKhamId, dv.thoi_luong AS thoiLuong,
              CAST(dv.gia_mac_dinh AS CHAR) AS giaMacDinh
         FROM bac_si b
         JOIN tai_khoan tk ON tk.tai_khoan_id = b.tai_khoan_id
         JOIN dich_vu_kham dv ON dv.dich_vu_kham_id = b.dich_vu_kham_id
        WHERE tk.email = ?`,
      [REMINDER_DEMO_DOCTOR_EMAIL],
    );
    if (!rows[0]) throw new SeedError('SEED_DEV_ACCOUNTS_REQUIRED');
    return rows[0];
  }

  // Khung giờ đầu tiên hôm nay có giờ bắt đầu trong [now + 2:05, now + 3:05], ở ca mà chi nhánh nhận khám và bác sĩ CHƯA có ca (seed không UPDATE khung giờ có sẵn).
  // Tạo ca mới, chèn ô `DaDat` TRƯỚC, rồi `syncShiftSlots` điền các ô còn lại `ConTrong` (nếp `exam-demo`).
  private async placeSlot(
    doctor: DoctorRow,
    today: string,
  ): Promise<{ khungGioId: string; ngayGio: string }> {
    const epochDay = parseCalendarDate(today)!;
    const weekday = isoWeekdayOfEpochDay(epochDay);
    const hours = await new BranchHoursReader().loadMany(this.manager, [
      { chiNhanhId: doctor.chiNhanhId, thuTrongTuan: weekday },
    ]);
    const dayHours =
      hours.get(
        hoursKey({ chiNhanhId: doctor.chiNhanhId, thuTrongTuan: weekday }),
      ) ?? null;
    const earliest = vnText(
      new Date(this.now.getTime() + REMINDER_DEMO_LEAD_MINUTES * 60_000),
    );
    const latest = vnText(
      new Date(this.now.getTime() + REMINDER_DEMO_MAX_LEAD_MINUTES * 60_000),
    );
    for (const ca of REMINDER_DEMO_SHIFTS) {
      const window = shiftWindow(ca, dayHours);
      if (!window.ok) continue;
      const start = generateSlotStarts(window.khoang, Number(doctor.thoiLuong))
        .map((seconds) => `${today} ${clockText(seconds)}`)
        .find((ngayGio) => ngayGio >= earliest && ngayGio <= latest);
      if (start === undefined) continue;
      const [shift] = await this.manager.query<{ n: string }[]>(
        'SELECT COUNT(*) AS n FROM lich_lam_viec WHERE bac_si_id = ? AND ngay = ? AND ca = ?',
        [doctor.bacSiId, today, ca],
      );
      if (Number(shift!.n) > 0) continue;
      const shiftId = await this.insert(
        'INSERT INTO lich_lam_viec (bac_si_id, chi_nhanh_id, ngay, ca) VALUES (?, ?, ?, ?)',
        [doctor.bacSiId, doctor.chiNhanhId, today, ca],
      );
      this.counts.created++;
      const khungGioId = await this.insert(
        "INSERT INTO khung_gio (lich_lam_viec_id, ngay_gio, trang_thai) VALUES (?, ?, 'DaDat')",
        [shiftId, start],
      );
      await syncShiftSlots(this.manager, {
        lichLamViecId: shiftId,
        ngay: today,
        khoang: window.khoang,
        thoiLuongPhut: Number(doctor.thoiLuong),
      });
      return { khungGioId, ngayGio: start };
    }
    throw new SeedError('SEED_REMINDER_SLOT_UNAVAILABLE');
  }

  private async insert(sql: string, params: unknown[]): Promise<string> {
    const result: { insertId: string } = await this.manager.query(sql, params);
    return String(result.insertId);
  }
}
