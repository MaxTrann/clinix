import type { DataSource } from 'typeorm';
import type { BacSi } from '../../admin/entities/bac-si.entity.js';
import type {
  CaLamViec,
  TrangThaiLichHen,
} from '../../admin/entities/enums.js';
import type { LichHen } from '../../admin/entities/lich-hen.entity.js';
import type { LichLamViec } from '../../admin/entities/lich-lam-viec.entity.js';
import type { BookingFixtures } from './booking-fixtures.js';

// Dữ liệu cho test tích hợp của `queries/` (task B11: CG-08, CG-11…CG-18, AFL-04, AFL-05; TRACKING 3.24.3): ca làm việc ở NGÀY và CA tuỳ ý, khung giờ ở ĐÚNG giờ cần thử biên, lịch hẹn ở đúng trạng thái. BỌC
// `BookingFixtures` (không chép). Mọi giờ là chuỗi `YYYY-MM-DD HH:mm:ss` giờ Việt Nam (không qua `Date`, H1); ngày của ca là ngày của chuỗi giờ.

export class LeaveFixtures {
  // Mỗi (bác sĩ, ngày, ca) chỉ một dòng `lich_lam_viec` (UNIQUE): tạo một lần rồi dùng lại
  private readonly shifts = new Map<string, LichLamViec>();

  constructor(
    private readonly db: DataSource,
    private readonly fx: BookingFixtures,
  ) {}

  /**
   * Chi nhánh, HAI bác sĩ (`doctor` và `other`, để thử "đúng bác sĩ") và một Bệnh nhân. KHÔNG dùng `BookingFixtures.world()`: nó dựng sẵn ca ngày 10/11 của bác sĩ đầu và đụng UNIQUE
   * `(bac_si_id, ngay, ca)` khi test dựng ca cùng ngày.
   */
  async world() {
    const base = await this.fx.doctor.world();
    const other = (await this.fx.admin.doctor(base.branch)).profile;
    const patient = await this.fx.admin.patient();
    return {
      branch: base.branch,
      doctor: base.doctor.profile,
      other,
      patient,
      patientId: patient.account.taiKhoanId,
    };
  }

  async shift(
    doctor: BacSi,
    ngay: string,
    ca: CaLamViec,
  ): Promise<LichLamViec> {
    const key = `${doctor.taiKhoanId}|${ngay}|${ca}`;
    const known = this.shifts.get(key);
    if (known !== undefined) return known;
    const created = await this.fx.admin.shift(doctor, { ngay, ca });
    this.shifts.set(key, created);
    return created;
  }

  /** Khung giờ `ConTrong` của ca ở đúng `at` (`YYYY-MM-DD HH:mm:ss`); trả `khung_gio_id`. */
  async slotAt(shift: LichLamViec, at: string): Promise<string> {
    const result: { insertId: string | number } = await this.db.query(
      "INSERT INTO khung_gio (lich_lam_viec_id, ngay_gio, trang_thai) VALUES (?, ?, 'ConTrong')",
      [shift.lichLamViecId, at],
    );
    return String(result.insertId);
  }

  /**
   * Lịch hẹn của `doctor` ở đúng giờ `at`, thuộc ca (`at` ngày, `ca`), ở `trangThai` (mặc định `DaXacNhan`), kèm khung giờ nhất quán (`BookingFixtures.appointmentIn`). Mỗi lần gọi một
   * khung giờ MỚI, nên hai lịch cùng giờ `at` của cùng bác sĩ và ca không dựng được (UNIQUE `(lich_lam_viec_id, ngay_gio)`).
   */
  async appointmentAt(input: {
    doctor: BacSi;
    at: string;
    ca?: CaLamViec;
    trangThai?: TrangThaiLichHen;
    patientId: string;
    hoSoNguoiThanId?: string | null;
    tienCoc?: string;
  }): Promise<LichHen> {
    const shift = await this.shift(
      input.doctor,
      input.at.slice(0, 10),
      input.ca ?? 'CaSang',
    );
    const khungGioId = await this.slotAt(shift, input.at);
    return this.fx.appointmentIn(input.trangThai ?? 'DaXacNhan', {
      doctor: input.doctor,
      khungGioId,
      patientId: input.patientId,
      ...(input.hoSoNguoiThanId === undefined
        ? {}
        : { hoSoNguoiThanId: input.hoSoNguoiThanId }),
      ...(input.tienCoc === undefined
        ? {}
        : { tienCocSnapshot: input.tienCoc }),
    });
  }
}
