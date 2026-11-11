import type { DataSource } from 'typeorm';
import type { BacSi } from '../../admin/entities/bac-si.entity.js';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import type { LichHen } from '../../admin/entities/lich-hen.entity.js';
import type {
  AppointmentListFixtures,
  BookInput,
} from './appointment-list-fixtures.js';
import type { BookingFixtures } from './booking-fixtures.js';

// Hạ tầng test dùng chung của danh sách và chi tiết lịch hẹn cho NHÂN SỰ (Lễ tân B3, Quản trị viên B4): int-spec và e2e cùng dựng một "thế giới" hai chi nhánh để jscpd không thấy hai bản
// (PLAN booking 5.15, H18; TRACKING 3.17.3). BỌC `BookingFixtures` và `AppointmentListFixtures`, không sửa chúng. Mọi tên, SĐT, mã lịch là MINH HOẠ cho test (SĐT không phải số thật).

export const PATIENT_ONE = {
  hoTen: 'Nguyễn Văn An',
  soDienThoai: '0911111111',
};
export const PATIENT_TWO = {
  hoTen: 'Đặng Văn Cường',
  soDienThoai: '0922222222',
};
export const RELATIVE_NAME = 'Trần Thị Bình';
export const INACTIVE_RELATIVE_NAME = 'Lê Thị Cũ';

// Mã đúng dạng Q13 (năm ký tự Crockford, KHÔNG có I, L, O, U). Chi nhánh A: AAA0x; chi nhánh B: BBB0x
export const CODES = {
  a1: 'CLX-20261110-AAA01',
  a2: 'CLX-20261110-AAA02',
  a3: 'CLX-20261111-AAA03',
  a4: 'CLX-20261112-AAA04',
  a5: 'CLX-20261113-AAA05',
  a6: 'CLX-20261114-AAA06',
  a7: 'CLX-20261115-AAA07',
  b1: 'CLX-20261110-BBB01',
  missing: 'CLX-20261110-ZZZZZ',
} as const;

export interface TimedBookInput extends BookInput {
  /** `HH:mm:ss` giờ VN của ngày `ngay`: đặt lại `thoi_gian` (ca biên, ca cùng giờ); mặc định là giờ của khung giờ kế tiếp */
  gio?: string;
  /** Đổi `gia_snapshot` (mặc định của fixture là 100000.00); `0.00` để thử "đã thu đủ" với bản `Noop` */
  giaSnapshot?: string;
}

export class OperationsListFixtures {
  constructor(
    private readonly fx: BookingFixtures,
    private readonly lf: AppointmentListFixtures,
    private readonly db: DataSource,
  ) {}

  /** Lịch hẹn kèm giờ và giá tuỳ chọn (cập nhật SAU khi dựng, chỉ để thử danh sách: không đổi khung giờ). Chuỗi giờ, không `Date`: không qua múi giờ của driver (H1). */
  async book(
    doctor: BacSi,
    trangThai: TrangThaiLichHen,
    input: TimedBookInput,
  ): Promise<LichHen> {
    const { gio, giaSnapshot, ...bookInput } = input;
    const appointment = await this.lf.book(doctor, trangThai, bookInput);
    if (gio !== undefined)
      await this.lf.setTime(appointment.lichHenId, `${input.ngay} ${gio}`);
    if (giaSnapshot !== undefined)
      await this.db.query(
        'UPDATE lich_hen SET gia_snapshot = ? WHERE lich_hen_id = ?',
        [giaSnapshot, appointment.lichHenId],
      );
    return appointment;
  }

  /** Một chi nhánh với một bác sĩ (chuyên khoa và dịch vụ RIÊNG do `AdminFixtures.doctor` dựng) và một Lễ tân. */
  async branchWith(doctorName: string) {
    const branch = await this.fx.admin.branch();
    const doctor = await this.lf.doctorIn(branch, doctorName);
    const reception = await this.fx.admin.receptionist(branch);
    return { branch, doctor, reception };
  }

  /**
   * Hai chi nhánh. A: hai bác sĩ, bảy lịch (đủ bảy trạng thái); B: một bác sĩ, một lịch. Hai Bệnh nhân với họ tên và SĐT riêng; Bệnh nhân một có một hồ sơ người thân đang dùng
   * (lịch a2) và một đã ngừng (lịch a7). Thứ tự dựng cũng là thứ tự `lich_hen_id` tăng. Giờ mặc định: khung giờ kế tiếp của bác sĩ ở ngày đó (08:00, 08:30…).
   * a1 DaXacNhan (bản thân, có lý do khám), a2 ChoThanhToan (người thân), a3 HoanThanh, a4 DaHuy (có `ly_do_huy`), a5 DaDoiLich, a6 VangMat, a7 DaXacNhan (người thân đã ngừng).
   */
  async world() {
    const a = await this.branchWith('Bác Sĩ Một');
    const a2 = await this.lf.doctorIn(a.branch, 'Bác Sĩ Hai');
    const b = await this.branchWith('Bác Sĩ Ba');
    const one = await this.fx.admin.patient(PATIENT_ONE);
    const two = await this.fx.admin.patient(PATIENT_TWO);
    const oneId = one.account.taiKhoanId;
    const twoId = two.account.taiKhoanId;
    const relativeId = await this.fx.relative(oneId, { hoTen: RELATIVE_NAME });
    const inactiveRelativeId = await this.fx.relative(oneId, {
      hoTen: INACTIVE_RELATIVE_NAME,
      active: false,
    });
    const d1 = a.doctor.profile;
    const d2 = a2.profile;
    const apps = {
      a1: await this.book(d1, 'DaXacNhan', {
        patientId: oneId,
        ngay: '2026-11-10',
        maLichHen: CODES.a1,
        lyDoKham: 'Đau đầu ba ngày',
      }),
      a2: await this.book(d1, 'ChoThanhToan', {
        patientId: oneId,
        ngay: '2026-11-10',
        hoSoNguoiThanId: relativeId,
        maLichHen: CODES.a2,
      }),
      a3: await this.book(d2, 'HoanThanh', {
        patientId: twoId,
        ngay: '2026-11-11',
        maLichHen: CODES.a3,
      }),
      a4: await this.book(d2, 'DaHuy', {
        patientId: twoId,
        ngay: '2026-11-12',
        maLichHen: CODES.a4,
      }),
      a5: await this.book(d1, 'DaDoiLich', {
        patientId: oneId,
        ngay: '2026-11-13',
        maLichHen: CODES.a5,
      }),
      a6: await this.book(d1, 'VangMat', {
        patientId: twoId,
        ngay: '2026-11-14',
        maLichHen: CODES.a6,
      }),
      a7: await this.book(d2, 'DaXacNhan', {
        patientId: oneId,
        ngay: '2026-11-15',
        hoSoNguoiThanId: inactiveRelativeId,
        maLichHen: CODES.a7,
      }),
      b1: await this.book(b.doctor.profile, 'DaXacNhan', {
        patientId: oneId,
        ngay: '2026-11-10',
        maLichHen: CODES.b1,
      }),
    };
    return {
      branchA: a.branch,
      branchB: b.branch,
      doctorA1: a.doctor,
      doctorA2: a2,
      doctorB: b.doctor,
      receptionA: a.reception,
      receptionB: b.reception,
      oneId,
      twoId,
      relativeId,
      inactiveRelativeId,
      apps,
    };
  }
}
