import type { EntityManager } from 'typeorm';
import type { CaLamViec } from '../../admin/entities/enums.js';
import { AuditRepository } from '../../audit/audit.repository.js';
import { AuditService } from '../../audit/audit.service.js';
import { BenhNhan } from '../../auth/entities/benh-nhan.entity.js';
import { TaiKhoan } from '../../auth/entities/tai-khoan.entity.js';
import { ViNoiBo } from '../../auth/entities/vi-noi-bo.entity.js';
import { nowVN, todayVN } from '../../common/time/time.js';
import {
  formatCalendarDate,
  isoWeekdayOfEpochDay,
  parseCalendarDate,
} from '../../scheduling/calendar-date.js';
import {
  BranchHoursReader,
  hoursKey,
} from '../../scheduling/branch-hours/branch-hours.reader.js';
import type { BranchDayHours } from '../../scheduling/branch-hours/branch-hours.types.js';
import { shiftWindow } from '../../scheduling/branch-hours/shift-window.rules.js';
import { generateSlotStarts } from '../../scheduling/slots/slot-generator.rules.js';
import { syncShiftSlots } from '../../scheduling/slots/slot-generator.js';
import { DEMO_DOCTOR_EMAILS, DEV_ADMIN_EMAIL } from './doctor-demo-data.js';
import {
  bookerEmail,
  DEV_PATIENT_EMAIL,
  doctorEmail,
  EXAM_DEMO_PATIENTS,
  EXAM_DEMO_RECORDS,
  EXAM_DEMO_RELATIVES,
  EXAM_DEMO_SAMPLES,
  FOLLOW_UP_DAYS,
  sampleRowCount,
  type ExamDemoPatient,
  type ExamDemoRelative,
  type ExamDemoSample,
} from './exam-demo-data.js';
import { SeedError } from './seed-error.js';
import type { SeedCounts } from './seed.repository.js';

interface DoctorRow {
  bacSiId: string;
  chiNhanhId: string;
  dichVuKhamId: string;
  thoiLuong: number | string;
  giaMacDinh: string;
  email: string;
}

interface Placed {
  khungGioId: string;
  /** 'YYYY-MM-DD HH:MM:SS' giờ VN */
  ngayGio: string;
}

interface Context {
  doctors: Map<string, DoctorRow>;
  patients: Map<string, string>;
  relatives: Map<string, string>;
  adminId: string;
}

const CAS: readonly CaLamViec[] = ['CaSang', 'CaChieu'];
/** Số ngày lùi tối đa khi tìm ngày và ca còn trống của bác sĩ. */
const SCAN_DAYS = 30;
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const LY_DO_KHAM = '[Mẫu exam-demo] Khám theo hẹn (dữ liệu minh họa).';

// Giờ ghi bằng CHUỖI 'YYYY-MM-DD HH:MM:SS' (giờ VN): cộng trên chuỗi bằng UTC, không qua múi giờ máy (như doctor-demo, H1).
function addSeconds(local: string, seconds: number): string {
  const ms = Date.parse(`${local.replace(' ', 'T')}Z`) + seconds * 1000;
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

const earlier = (a: string, b: string): string => (a < b ? a : b);

function clockText(seconds: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`;
}

// Seed demo cho hồ sơ khám và đánh giá (doctor-exam B10). Chạy trong MỘT giao dịch của seedTransaction; chỉ INSERT, không UPDATE/DELETE.
// Lịch hẹn chèn trực tiếp (không qua service đặt lịch) nên tự giữ bất biến: khung giờ `DaDat` + lịch cùng ca, đúng mã sản xuất cho giờ ca và khung giờ.
// AR-01: seed chỉ được `INSERT INTO lich_hen` và `INSERT INTO khung_gio`, KHÔNG `UPDATE khung_gio` ⇒ mỗi lịch mẫu nằm ở một ca MỚI do seed tạo.
export class ExamDemoRepository {
  readonly counts: SeedCounts = { created: 0, skipped: 0 };
  private readonly audit = new AuditService(new AuditRepository());
  private readonly today: number;
  private readonly nowText: string;
  // Giờ nhận khám của chi nhánh theo thứ (đọc một lần ở `run`).
  private hoursMap = new Map<string, BranchDayHours | null>();

  constructor(
    private readonly manager: EntityManager,
    now: Date = nowVN(),
  ) {
    this.today = parseCalendarDate(todayVN(now))!;
    this.nowText = new Date(now.getTime() + VN_OFFSET_MS)
      .toISOString()
      .slice(0, 19)
      .replace('T', ' ');
  }

  async run(hash: string): Promise<void> {
    // Thiếu tiền đề thì dừng với mã rõ ràng, không tự chạy seed khác.
    const dev = await this.requireDevAccounts();
    const doctors = await this.requireDoctors();
    const patients = new Map<string, string>([
      [DEV_PATIENT_EMAIL, dev.patientId],
    ]);
    for (const patient of EXAM_DEMO_PATIENTS)
      patients.set(patient.email, await this.ensurePatient(patient, hash));
    const relatives = new Map<string, string>();
    for (const relative of EXAM_DEMO_RELATIVES)
      relatives.set(
        relative.hoTen,
        await this.ensureRelative(dev.patientId, relative),
      );
    const branchIds = new Set([...doctors.values()].map((d) => d.chiNhanhId));
    this.hoursMap = await new BranchHoursReader().loadMany(
      this.manager,
      [...branchIds].flatMap((chiNhanhId) =>
        [1, 2, 3, 4, 5, 6, 7].map((thuTrongTuan) => ({
          chiNhanhId,
          thuTrongTuan,
        })),
      ),
    );
    const context: Context = {
      doctors,
      patients,
      relatives,
      adminId: dev.adminId,
    };
    for (const [index, sample] of EXAM_DEMO_SAMPLES.entries())
      await this.ensureSample(sample, index, context);
  }

  // Tài khoản của dev-accounts: bệnh nhân (người đặt chính, chủ ba hồ sơ người thân) và Admin toàn hệ thống (người ẩn đánh giá trong nhật ký).
  private async requireDevAccounts(): Promise<{
    patientId: string;
    adminId: string;
  }> {
    const accounts = this.manager.getRepository(TaiKhoan);
    const patient = await accounts.findOneBy({ email: DEV_PATIENT_EMAIL });
    const admin = await accounts.findOneBy({ email: DEV_ADMIN_EMAIL });
    if (!patient || !admin) throw new SeedError('SEED_DEV_ACCOUNTS_REQUIRED');
    if (
      patient.loaiTaiKhoan !== 'BenhNhan' ||
      admin.loaiTaiKhoan !== 'QuanTriVien'
    )
      throw new SeedError('SEED_ACCOUNT_CONFLICT');
    return { patientId: patient.taiKhoanId, adminId: admin.taiKhoanId };
  }

  // Chín bác sĩ: doctor@example.invalid (dev-accounts) và tám bác sĩ search-demo. Cố ý KHÔNG lọc trạng thái: đánh giá của bác sĩ đã ngừng vẫn là lịch sử hợp lệ.
  private async requireDoctors(): Promise<Map<string, DoctorRow>> {
    const rows = await this.manager.query<DoctorRow[]>(
      `SELECT CAST(b.tai_khoan_id AS CHAR) AS bacSiId, CAST(b.chi_nhanh_id AS CHAR) AS chiNhanhId,
              CAST(b.dich_vu_kham_id AS CHAR) AS dichVuKhamId, dv.thoi_luong AS thoiLuong,
              CAST(dv.gia_mac_dinh AS CHAR) AS giaMacDinh, tk.email AS email
         FROM bac_si b
         JOIN tai_khoan tk ON tk.tai_khoan_id = b.tai_khoan_id
         JOIN dich_vu_kham dv ON dv.dich_vu_kham_id = b.dich_vu_kham_id
        WHERE tk.email IN (${DEMO_DOCTOR_EMAILS.map(() => '?').join(', ')})`,
      [...DEMO_DOCTOR_EMAILS],
    );
    const byEmail = new Map(rows.map((row) => [row.email, row]));
    if (!byEmail.has(doctorEmail(0)))
      throw new SeedError('SEED_DEV_ACCOUNTS_REQUIRED');
    if (DEMO_DOCTOR_EMAILS.some((email) => !byEmail.has(email)))
      throw new SeedError('SEED_DOCTORS_REQUIRED');
    return byEmail;
  }

  // Bệnh nhân mẫu có đủ bản ghi như dev-accounts tạo cho bệnh nhân: tai_khoan + benh_nhan + vi_noi_bo (0 đồng); đã xác minh, đăng nhập được bằng SEED_DEV_PASSWORD.
  private async ensurePatient(
    patient: ExamDemoPatient,
    hash: string,
  ): Promise<string> {
    const accounts = this.manager.getRepository(TaiKhoan);
    const existing = await accounts.findOneBy({ email: patient.email });
    if (existing) {
      if (
        existing.loaiTaiKhoan !== 'BenhNhan' ||
        !(await this.manager
          .getRepository(BenhNhan)
          .existsBy({ taiKhoanId: existing.taiKhoanId })) ||
        !(await this.manager
          .getRepository(ViNoiBo)
          .existsBy({ benhNhanId: existing.taiKhoanId }))
      )
        throw new SeedError('SEED_ACCOUNT_CONFLICT');
      this.counts.skipped += 3;
      return existing.taiKhoanId;
    }
    const account = await accounts.save(
      accounts.create({
        email: patient.email,
        hoTen: patient.name,
        soDienThoai: patient.phone,
        loaiTaiKhoan: 'BenhNhan',
        matKhauBam: hash,
        trangThai: 'DangHoatDong',
        daXacMinhEmail: true,
      }),
    );
    const id = account.taiKhoanId;
    const profiles = this.manager.getRepository(BenhNhan);
    await profiles.save(profiles.create({ taiKhoanId: id }));
    const wallets = this.manager.getRepository(ViNoiBo);
    await wallets.save(
      wallets.create({ benhNhanId: id, soDu: '0.00', soTienDangGiu: '0.00' }),
    );
    this.counts.created += 3;
    return id;
  }

  // Khoá chạy lại = (chủ, họ tên). Một hồ sơ có `trang_thai_hieu_luc = 0` để thử lọc người khám gồm hồ sơ ngừng dùng (Q18).
  private async ensureRelative(
    ownerId: string,
    relative: ExamDemoRelative,
  ): Promise<string> {
    const found = await this.manager.query<{ id: string }[]>(
      `SELECT CAST(ho_so_nguoi_than_id AS CHAR) AS id FROM ho_so_nguoi_than WHERE benh_nhan_id = ? AND ho_ten = ?`,
      [ownerId, relative.hoTen],
    );
    if (found[0]) {
      this.counts.skipped++;
      return found[0].id;
    }
    const id = await this.insert(
      `INSERT INTO ho_so_nguoi_than (benh_nhan_id, ho_ten, ngay_sinh, gioi_tinh, moi_quan_he, trang_thai_hieu_luc)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        ownerId,
        relative.hoTen,
        relative.ngaySinh,
        relative.gioiTinh,
        relative.moiQuanHe,
        relative.active ? 1 : 0,
      ],
    );
    this.counts.created++;
    return id;
  }

  // Khoá nhận diện = `ma_lich_hen` cố định (UNIQUE ở DB). Có lịch mang mã này rồi ⇒ bỏ qua CẢ NHÓM, không sửa gì (kể cả khi người dùng đã
  // hoàn thành ca, ghi hồ sơ, đánh giá hay ẩn bằng giao diện). Ngày khám tính từ ngày chạy lần đầu, lần sau không đổi vì khoá là mã.
  private async ensureSample(
    sample: ExamDemoSample,
    index: number,
    context: Context,
  ): Promise<void> {
    const found = await this.manager.query<{ n: string }[]>(
      'SELECT COUNT(*) AS n FROM lich_hen WHERE ma_lich_hen = ?',
      [sample.code],
    );
    if (Number(found[0]!.n) > 0) {
      this.counts.skipped += sampleRowCount(sample);
      return;
    }
    const doctor = context.doctors.get(doctorEmail(sample.doctorKey))!;
    const placed = await this.placeSlot(doctor, sample.daysAgo, index);
    const ngay = placed.ngayGio.slice(0, 10);
    const done = sample.state === 'HoanThanh';
    const lichHenId = await this.insert(
      `INSERT INTO lich_hen (ma_lich_hen, khung_gio_id, benh_nhan_id, ho_so_nguoi_than_id, bac_si_id, chi_nhanh_id, dich_vu_kham_id,
                            thoi_gian, gia_snapshot, trang_thai, ly_do_kham, thoi_diem_tao, cap_nhat_lan_cuoi,
                            thoi_diem_xac_nhan, thoi_diem_tiep_don, thoi_diem_hoan_thanh)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sample.code,
        placed.khungGioId,
        context.patients.get(bookerEmail(sample.bookerKey))!,
        sample.relative ? context.relatives.get(sample.relative)! : null,
        doctor.bacSiId,
        doctor.chiNhanhId,
        doctor.dichVuKhamId,
        placed.ngayGio,
        doctor.giaMacDinh,
        sample.state,
        LY_DO_KHAM,
        addSeconds(placed.ngayGio, -3 * 86400),
        done
          ? addSeconds(placed.ngayGio, 45 * 60)
          : earlier(placed.ngayGio, this.nowText),
        // Ba mốc từng bước (booking B19) `[đề xuất]` là DỮ LIỆU GIẢ suy ra từ giờ hẹn: xác nhận lúc đặt (cọc 0đ), tiếp đón 10 phút trước giờ hẹn, hoàn thành 45 phút sau giờ hẹn;
        // kẹp không vượt giờ hiện tại (lịch DaTiepDon hôm nay có thể ở sau giờ chạy seed). Lịch HoanThanh luôn có đủ ba mốc, lịch DaTiepDon không có mốc hoàn thành.
        addSeconds(placed.ngayGio, -3 * 86400),
        earlier(addSeconds(placed.ngayGio, -10 * 60), this.nowText),
        done
          ? earlier(addSeconds(placed.ngayGio, 45 * 60), this.nowText)
          : null,
      ],
    );
    this.counts.created++;

    if (sample.record !== 'none') {
      const text = EXAM_DEMO_RECORDS[index % EXAM_DEMO_RECORDS.length]!;
      await this.manager.query(
        `INSERT INTO ho_so_kham (lich_hen_id, trieu_chung, chan_doan_so_bo, huong_xu_ly, ngay_tai_kham_du_kien, cap_nhat_lan_cuoi)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          lichHenId,
          text.trieuChung,
          text.chanDoanSoBo,
          text.huongXuLy,
          sample.record === 'followUp'
            ? formatCalendarDate(parseCalendarDate(ngay)! + FOLLOW_UP_DAYS)
            : null,
          earlier(addSeconds(placed.ngayGio, 30 * 60), this.nowText),
        ],
      );
      this.counts.created++;
    }

    if (sample.rating) {
      const reason = sample.rating.hiddenReason ?? null;
      const ratingId = await this.insert(
        `INSERT INTO danh_gia_bac_si (lich_hen_id, so_sao, nhan_xet, bi_an, ly_do_an, thoi_diem_tao)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          lichHenId,
          sample.rating.stars,
          sample.rating.comment,
          reason ? 1 : 0,
          reason,
          earlier(addSeconds(placed.ngayGio, 3 * 3600), this.nowText),
        ],
      );
      this.counts.created++;
      // IVK-04: đánh giá ẩn phải có đúng một dòng nhật ký AnDanhGia; ghi bằng AuditService thật (cùng hình dạng với B8).
      if (reason) {
        await this.audit.record(this.manager, {
          actorId: context.adminId,
          branchId: doctor.chiNhanhId,
          action: 'AnDanhGia',
          targetType: 'danh_gia_bac_si',
          targetId: ratingId,
          result: 'ThanhCong',
          changes: {
            truoc: { bi_an: false },
            sau: { bi_an: true },
            ly_do: reason,
            bac_si_id: doctor.bacSiId,
          },
        });
        this.counts.created++;
      }
    }
  }

  // Chọn chỗ cho một lịch: ngày–ca đầu tiên (từ `daysAgo` ngày trước, lùi dần) mà chi nhánh nhận khám ca đó và bác sĩ CHƯA có ca ngày đó.
  // Ca có sẵn (của doctor-demo hay của mẫu trước) bị bỏ qua vì seed không được UPDATE khung_gio. Tạo ca mới, chèn ô `DaDat` TRƯỚC,
  // rồi syncShiftSlots (ON DUPLICATE KEY không đổi ô có sẵn) điền các ô còn lại `ConTrong`.
  private async placeSlot(
    doctor: DoctorRow,
    daysAgo: number,
    index: number,
  ): Promise<Placed> {
    for (let back = daysAgo; back <= daysAgo + SCAN_DAYS; back++) {
      const epochDay = this.today - back;
      const ngay = formatCalendarDate(epochDay);
      const weekday = isoWeekdayOfEpochDay(epochDay);
      for (const ca of CAS) {
        const window = shiftWindow(
          ca,
          this.hoursOf(doctor.chiNhanhId, weekday),
        );
        if (!window.ok) continue;
        const starts = generateSlotStarts(
          window.khoang,
          Number(doctor.thoiLuong),
        );
        if (starts.length === 0) continue;
        const existing = await this.manager.query<{ n: string }[]>(
          'SELECT COUNT(*) AS n FROM lich_lam_viec WHERE bac_si_id = ? AND ngay = ? AND ca = ?',
          [doctor.bacSiId, ngay, ca],
        );
        if (Number(existing[0]!.n) > 0) continue;

        const shiftId = await this.insert(
          'INSERT INTO lich_lam_viec (bac_si_id, chi_nhanh_id, ngay, ca) VALUES (?, ?, ?, ?)',
          [doctor.bacSiId, doctor.chiNhanhId, ngay, ca],
        );
        this.counts.created++;
        const ngayGio = `${ngay} ${clockText(starts[index % starts.length]!)}`;
        const khungGioId = await this.insert(
          "INSERT INTO khung_gio (lich_lam_viec_id, ngay_gio, trang_thai) VALUES (?, ?, 'DaDat')",
          [shiftId, ngayGio],
        );
        await syncShiftSlots(this.manager, {
          lichLamViecId: shiftId,
          ngay,
          khoang: window.khoang,
          thoiLuongPhut: Number(doctor.thoiLuong),
        });
        return { khungGioId, ngayGio };
      }
    }
    throw new SeedError('SEED_EXAM_SLOT_UNAVAILABLE');
  }

  private hoursOf(chiNhanhId: string, weekday: number): BranchDayHours | null {
    return (
      this.hoursMap.get(hoursKey({ chiNhanhId, thuTrongTuan: weekday })) ?? null
    );
  }

  private async insert(sql: string, params: unknown[]): Promise<string> {
    const result: { insertId: string } = await this.manager.query(sql, params);
    return String(result.insertId);
  }
}
