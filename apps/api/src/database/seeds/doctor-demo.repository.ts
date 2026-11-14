import type { EntityManager } from 'typeorm';
import { TaiKhoan } from '../../auth/entities/tai-khoan.entity.js';
import { nowVN, toSecond, todayVN } from '../../common/time/time.js';
import { YeuCauNghiPhep } from '../../doctor/entities/yeu-cau-nghi-phep.entity.js';
import type { CaLamViec } from '../../admin/entities/enums.js';
import {
  formatCalendarDate,
  isoWeekdayOfEpochDay,
  parseCalendarDate,
} from '../../scheduling/calendar-date.js';
import {
  BranchHoursReader,
  hoursKey,
} from '../../scheduling/branch-hours/branch-hours.reader.js';
import { shiftWindow } from '../../scheduling/branch-hours/shift-window.rules.js';
import { syncShiftSlots } from '../../scheduling/slots/slot-generator.js';
import {
  DEMO_DAYS,
  DEMO_DOCTOR_EMAILS,
  DEMO_LEAVES,
  DEV_ADMIN_EMAIL,
  type DemoLeave,
} from './doctor-demo-data.js';
import { SeedError } from './seed-error.js';
import type { SeedCounts } from './seed.repository.js';

interface DoctorRow {
  bacSiId: string;
  chiNhanhId: string;
  thoiLuong: number | string;
  email: string;
}

interface SeededShift {
  ngay: string;
  ca: CaLamViec;
}

const CAS: readonly CaLamViec[] = ['CaSang', 'CaChieu'];

// Seed demo cho doctor. Chạy trong một giao dịch của seedTransaction; add-only, chạy lại không ghi đè.
// Dùng ĐÚNG mã sản xuất cho giờ ca (shiftWindow) và khung giờ (syncShiftSlots), không qua DI.
export class DoctorDemoRepository {
  readonly counts: SeedCounts = { created: 0, skipped: 0 };
  constructor(
    private readonly manager: EntityManager,
    private readonly now: Date = nowVN(),
  ) {}

  async run(): Promise<void> {
    const doctors = await this.findDoctors();
    if (doctors.length === 0) throw new SeedError('SEED_DOCTORS_REQUIRED');
    const days = this.days();
    const hours = await new BranchHoursReader().loadMany(
      this.manager,
      doctors.flatMap((d) =>
        days.map((day) => ({
          chiNhanhId: d.chiNhanhId,
          thuTrongTuan: day.weekday,
        })),
      ),
    );

    const seeded = new Map<string, SeededShift[]>();
    for (const doctor of doctors) {
      const shifts: SeededShift[] = [];
      for (const day of days) {
        for (const ca of CAS) {
          const window = shiftWindow(
            ca,
            hours.get(
              hoursKey({
                chiNhanhId: doctor.chiNhanhId,
                thuTrongTuan: day.weekday,
              }),
            ) ?? null,
          );
          // Chi nhánh nghỉ hoặc không có ca đó trong ngày: không phân công.
          if (!window.ok) continue;
          const id = await this.ensureShift(doctor, day.ngay, ca);
          await syncShiftSlots(this.manager, {
            lichLamViecId: id,
            ngay: day.ngay,
            khoang: window.khoang,
            thoiLuongPhut: Number(doctor.thoiLuong),
          });
          shifts.push({ ngay: day.ngay, ca });
        }
      }
      seeded.set(doctor.email, shifts);
    }

    for (const leave of DEMO_LEAVES) {
      const doctor = doctors.find((d) => d.email === leave.email);
      if (doctor)
        await this.ensureLeave(doctor, leave, seeded.get(doctor.email)!);
    }
  }

  // Bác sĩ đang hoạt động trong danh sách demo; thiếu thì chạy seed trước (search-demo, dev-accounts).
  private findDoctors(): Promise<DoctorRow[]> {
    return this.manager.query<DoctorRow[]>(
      `SELECT CAST(b.tai_khoan_id AS CHAR) AS bacSiId, CAST(b.chi_nhanh_id AS CHAR) AS chiNhanhId,
              dv.thoi_luong AS thoiLuong, tk.email AS email
         FROM bac_si b
         JOIN tai_khoan tk ON tk.tai_khoan_id = b.tai_khoan_id
         JOIN dich_vu_kham dv ON dv.dich_vu_kham_id = b.dich_vu_kham_id
        WHERE tk.trang_thai = 'DangHoatDong'
          AND tk.email IN (${DEMO_DOCTOR_EMAILS.map(() => '?').join(', ')})
        ORDER BY b.tai_khoan_id ASC`,
      [...DEMO_DOCTOR_EMAILS],
    );
  }

  // 14 ngày kể từ ngày mai (giờ VN), tính trên số ngày thuần nên không lệch theo múi giờ máy.
  private days(): { ngay: string; weekday: number }[] {
    const today = parseCalendarDate(todayVN(this.now))!;
    return Array.from({ length: DEMO_DAYS }, (_, i) => ({
      ngay: formatCalendarDate(today + 1 + i),
      weekday: isoWeekdayOfEpochDay(today + 1 + i),
    }));
  }

  // Có ca rồi thì giữ nguyên; chưa có thì thêm. Đọc lại theo khoá tự nhiên (bac_si, ngay, ca).
  private async ensureShift(
    doctor: DoctorRow,
    ngay: string,
    ca: CaLamViec,
  ): Promise<string> {
    const find = () =>
      this.manager.query<{ id: string }[]>(
        `SELECT CAST(lich_lam_viec_id AS CHAR) AS id FROM lich_lam_viec WHERE bac_si_id = ? AND ngay = ? AND ca = ?`,
        [doctor.bacSiId, ngay, ca],
      );
    const existing = await find();
    if (existing[0]) {
      this.counts.skipped++;
      return existing[0].id;
    }
    await this.manager.query(
      'INSERT INTO lich_lam_viec (bac_si_id, chi_nhanh_id, ngay, ca) VALUES (?, ?, ?, ?)',
      [doctor.bacSiId, doctor.chiNhanhId, ngay, ca],
    );
    this.counts.created++;
    return (await find())[0]!.id;
  }

  // Khoá chạy lại = (bác sĩ, lý do mẫu): ngày nghỉ tính theo ngày chạy nên không dùng làm khoá.
  private async ensureLeave(
    doctor: DoctorRow,
    leave: DemoLeave,
    shifts: SeededShift[],
  ): Promise<void> {
    const repo = this.manager.getRepository(YeuCauNghiPhep);
    if (await repo.existsBy({ bacSiId: doctor.bacSiId, lyDo: leave.lyDo })) {
      this.counts.skipped++;
      return;
    }
    const from = parseCalendarDate(todayVN(this.now))! + 1 + leave.offsetNgay;
    const candidates = shifts.filter((s) => parseCalendarDate(s.ngay)! >= from);
    // TheoCa phải rơi đúng ca có thật trong lịch; không có thì lấy ca đầu tiên còn lại.
    const target =
      (leave.hinhThucNghi === 'TheoCa'
        ? candidates.find((s) => s.ca === leave.ca)
        : undefined) ?? candidates[0];
    if (!target) return;

    let nguoiXuLyId: string | null = null;
    if (leave.trangThai === 'DaDuyet') {
      const admin = await this.manager
        .getRepository(TaiKhoan)
        .findOneBy({ email: DEV_ADMIN_EMAIL });
      if (!admin) throw new SeedError('SEED_DEV_ACCOUNTS_REQUIRED');
      nguoiXuLyId = admin.taiKhoanId;
    }
    const at = toSecond(this.now);
    await repo.save(
      repo.create({
        bacSiId: doctor.bacSiId,
        hinhThucNghi: leave.hinhThucNghi,
        ngayBatDau: target.ngay,
        ngayKetThuc: target.ngay,
        ca: leave.hinhThucNghi === 'TheoCa' ? target.ca : null,
        lyDo: leave.lyDo,
        trangThai: leave.trangThai,
        nguoiXuLyId,
        thoiDiemXuLy: nguoiXuLyId ? at : null,
        thoiDiemTao: at,
      }),
    );
    this.counts.created++;
  }
}
