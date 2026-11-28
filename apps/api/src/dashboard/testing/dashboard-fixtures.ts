import type { DataSource } from 'typeorm';
import type { BacSi } from '../../admin/entities/bac-si.entity.js';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import { BookingFixtures } from '../../appointments/testing/booking-fixtures.js';

// Bộ dữ liệu dựng sẵn D0 của dashboard (PLAN dashboard 7.0), phần B1 cần: hai chi nhánh, hai bác sĩ, sáu ca, nghỉ phép và 14 lịch hẹn.
// B2 thêm giao dịch cọc, dòng hoàn và yêu cầu chờ duyệt vào đây. Ghi thật vào DB test qua fixture của admin, doctor, booking (BỌC, không chép).
// Mọi giờ là CHUỖI giờ Việt Nam `YYYY-MM-DD HH:MM:SS` (không qua `Date` nên không lệch theo múi giờ máy). Dữ liệu giả.

/** "Bây giờ" của bộ D0: 04/12/2026 10:00 giờ Việt Nam. */
export const D0_NOW = new Date('2026-12-04T10:00:00+07:00');
/** Bộ lọc chuẩn của bảng 7.0. */
export const D0_RANGE = { tuNgay: '2026-12-01', denNgay: '2026-12-07' };

/** Lịch của bảng 7.0: khung, trạng thái, `thoi_diem_tao`. Thứ tự chèn theo bảng (L4 trước L5 vì L5 trỏ L4). */
const D0_APPOINTMENTS = [
  ['L1', 's1', 'HoanThanh', '2026-11-28 10:00:00'],
  ['L2', 's2', 'VangMat', '2026-12-01 08:00:00'],
  ['L3', 's3', 'DaHuy', '2026-12-01 09:00:00'],
  ['L4', 's4', 'DaDoiLich', '2026-12-02 00:00:00'],
  ['L6', 's5', 'DaHuy', '2026-12-02 23:59:59'],
  ['L5', 's9', 'DaXacNhan', '2026-12-02 12:00:00'],
  ['L7', 's10', 'DaTiepDon', '2026-12-03 15:00:00'],
  ['L8', 's11', 'HoanThanh', '2026-12-04 07:00:00'],
  ['L9', 's12', 'ChoThanhToan', '2026-12-04 09:55:00'],
  ['L10', 's13', 'DaXacNhan', '2026-12-07 23:59:59'],
  ['M1', 't1', 'VangMat', '2026-12-01 10:00:00'],
  ['M2', 't2', 'HoanThanh', '2026-11-30 23:59:59'],
  ['M3', 't3', 'DaHuy', '2026-11-29 23:00:00'],
  ['N1', 'u1', 'DaXacNhan', '2026-12-08 00:00:00'],
] as const satisfies readonly (readonly [
  string,
  string,
  TrangThaiLichHen,
  string,
])[];

const MORNING = ['08:00', '08:30', '09:00', '09:30'];
const AFTERNOON = ['13:30', '14:00', '14:30', '15:00'];

export type D0World = Awaited<ReturnType<DashboardFixtures['d0']>>;

export class DashboardFixtures {
  readonly fx: BookingFixtures;

  constructor(private readonly db: DataSource) {
    this.fx = new BookingFixtures(db);
  }

  /** Một ca và các khung giờ `ConTrong` ở đúng các giờ cho trước (bảng 7.0 dùng 4 khung mỗi ca, không phải 8 khung của `shiftWithSlots`). */
  async shift(
    doctor: BacSi,
    ngay: string,
    ca: 'CaSang' | 'CaChieu',
    times: readonly string[],
  ): Promise<string[]> {
    const shift = await this.fx.admin.shift(doctor, { ngay, ca });
    const ids: string[] = [];
    for (const time of times) {
      const result: { insertId: string } = await this.db.query(
        "INSERT INTO khung_gio (lich_lam_viec_id, ngay_gio, trang_thai) VALUES (?, ?, 'ConTrong')",
        // `HH:MM` thêm giây 00; `HH:MM:SS` giữ nguyên (ca biên 23:59:59 của DHN-02)
        [
          shift.lichLamViecId,
          `${ngay} ${time.length === 5 ? `${time}:00` : time}`,
        ],
      );
      ids.push(String(result.insertId));
    }
    return ids;
  }

  /** Bộ D0 (phần B1). Trả id các chi nhánh, tài khoản và lịch theo tên ở bảng 7.0. */
  async d0() {
    const admin = this.fx.admin;
    const branchA = await admin.branch();
    const branchB = await admin.branch();
    const d1 = await admin.doctor(branchA);
    const d2 = await admin.doctor(branchB);
    const patient = await admin.patient();
    const receptionistA = await admin.receptionist(branchA);
    const systemAdmin = await admin.admin();
    const adminA = await admin.admin(branchA);
    const adminB = await admin.admin(branchB);

    const [s1, s2, s3, s4] = await this.shift(
      d1.profile,
      '2026-12-02',
      'CaSang',
      MORNING,
    );
    const [s5, s6, s7, s8] = await this.shift(
      d1.profile,
      '2026-12-03',
      'CaSang',
      MORNING,
    );
    // Ca hôm nay: s12 lúc 11:00 (bảng 7.0), sau "bây giờ" 10:00
    const [s9, s10, s11, s12] = await this.shift(
      d1.profile,
      '2026-12-04',
      'CaSang',
      ['08:00', '08:30', '09:00', '11:00'],
    );
    const [s13, s14, s15, s16] = await this.shift(
      d1.profile,
      '2026-12-08',
      'CaSang',
      MORNING,
    );
    const [t1, t2, t3, t4] = await this.shift(
      d2.profile,
      '2026-12-02',
      'CaChieu',
      AFTERNOON,
    );
    const [u1, u2, u3, u4] = await this.shift(
      d2.profile,
      '2026-12-09',
      'CaChieu',
      AFTERNOON,
    );
    const slots: Record<string, string | undefined> = {
      s1,
      s2,
      s3,
      s4,
      s5,
      s6,
      s7,
      s8,
      s9,
      s10,
      s11,
      s12,
      s13,
      s14,
      s15,
      s16,
      t1,
      t2,
      t3,
      t4,
      u1,
      u2,
      u3,
      u4,
    };

    // Nghỉ phép: chỉ D1 03/12 ca sáng ĐÃ DUYỆT (loại s5 đến s8 khỏi mẫu số khung giờ); ba yêu cầu còn lại không loại khung nào
    const handled = {
      nguoiXuLyId: systemAdmin.account.taiKhoanId,
      thoiDiemXuLy: '2026-11-30 10:00:00',
    };
    const leave = this.fx.doctor;
    await leave.leaveRequest({
      bacSiId: d1.profile.taiKhoanId,
      hinhThuc: 'TheoCa',
      ca: 'CaSang',
      batDau: '2026-12-03',
      trangThai: 'DaDuyet',
      ...handled,
    });
    await leave.leaveRequest({
      bacSiId: d1.profile.taiKhoanId,
      batDau: '2026-12-10',
    });
    await leave.leaveRequest({
      bacSiId: d1.profile.taiKhoanId,
      batDau: '2026-12-11',
      trangThai: 'TuChoi',
      ...handled,
    });
    await leave.leaveRequest({
      bacSiId: d2.profile.taiKhoanId,
      batDau: '2026-12-12',
    });

    const appointments: Record<string, string> = {};
    for (const [name, slot, trangThai, createdAt] of D0_APPOINTMENTS) {
      const khungGioId = slots[slot];
      if (khungGioId === undefined) throw new Error(`Thiếu khung ${slot}`);
      const doctor = slot.startsWith('s') ? d1.profile : d2.profile;
      const row = await this.fx.appointmentIn(trangThai, {
        doctor,
        khungGioId,
        patientId: patient.account.taiKhoanId,
      });
      appointments[name] = row.lichHenId;
      await this.db.query(
        'UPDATE lich_hen SET thoi_diem_tao = ? WHERE lich_hen_id = ?',
        [createdAt, row.lichHenId],
      );
    }
    // L5 là lịch MỚI sinh do đổi lịch từ L4 (xu hướng của B2 không đếm dòng này)
    await this.db.query(
      'UPDATE lich_hen SET lich_hen_truoc_id = ? WHERE lich_hen_id = ?',
      [appointments.L4, appointments.L5],
    );

    return {
      branchA: branchA.chiNhanhId,
      branchB: branchB.chiNhanhId,
      d1,
      d2,
      patient,
      receptionistA,
      systemAdmin,
      adminA,
      adminB,
      slots,
      appointments,
    };
  }
}
