import type { DataSource } from 'typeorm';
import type { BacSi } from '../../admin/entities/bac-si.entity.js';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import { BookingFixtures } from '../../appointments/testing/booking-fixtures.js';
import { PendingChangeFixtures } from '../../appointments/testing/pending-change-fixtures.js';
import { insertRequestAt } from '../../appointments/testing/reschedule-request-world.js';
import { WalletFixtures } from '../../wallet/testing/wallet-fixtures.js';

// Bộ dữ liệu dựng sẵn D0 của dashboard (PLAN dashboard 7.0): hai chi nhánh, hai bác sĩ, sáu ca, nghỉ phép, 14 lịch hẹn (B1); 13 giao dịch, 6 dòng hoàn
// và các yêu cầu chờ duyệt (B2). Ghi thật vào DB test qua fixture của admin, doctor, booking, wallet (BỌC, không chép).
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

/** Giao dịch của bảng 7.0: tên, lịch gốc, loại (`Vi` = cọc qua ví, `TienMat` = tiền mặt tại quầy, `NapVi` = nạp ví VNPay), số tiền, `thoi_diem_tao`. */
const D0_PAYMENTS = [
  ['P1', 'L1', 'Vi', '100000.00', '2026-11-28 10:05:00'],
  ['P2', 'L2', 'Vi', '150000.00', '2026-12-01 08:05:00'],
  ['P3', 'L3', 'Vi', '200000.00', '2026-12-01 09:05:00'],
  ['P4', 'L4', 'Vi', '120000.00', '2026-12-02 00:05:00'],
  ['P5', 'L6', 'Vi', '100000.00', '2026-12-02 23:59:59'],
  ['P6', 'L7', 'Vi', '0.00', '2026-12-03 15:00:00'],
  ['P7', 'L7', 'TienMat', '80000.00', '2026-12-04 08:40:00'],
  ['P8', null, 'NapVi', '500000.00', '2026-12-02 10:00:00'],
  ['P9', 'M2', 'Vi', '60000.00', '2026-11-30 23:59:59'],
  ['P10', 'M1', 'Vi', '90000.00', '2026-12-01 10:05:00'],
  ['P11', 'L10', 'Vi', '50000.00', '2026-12-07 23:59:59'],
  ['P12', 'N1', 'Vi', '70000.00', '2026-12-08 00:00:00'],
  ['P13', 'M3', 'Vi', '40000.00', '2026-11-29 23:05:00'],
] as const;

/** Dòng hoàn của bảng 7.0 (R1 đến R6): khoản, loại, kết quả, số tiền, `so_lan_thu`, `thoi_diem`. */
const D0_REFUNDS = [
  ['P3', 'TuDong', 'ThanhCong', '100000.00', 1, '2026-12-01 12:00:00'],
  ['P5', 'TuDong', 'ThatBai', '100000.00', 1, '2026-12-03 09:00:00'],
  ['P5', 'TuDong', 'ThanhCong', '100000.00', 2, '2026-12-03 09:05:00'],
  ['P2', 'DacBiet', 'ThanhCong', '30000.00', 1, '2026-12-05 10:00:00'],
  ['P13', 'TuDong', 'ThatBai', '40000.00', 1, '2026-12-02 16:00:00'],
  ['P1', 'DacBiet', 'ThanhCong', '10000.00', 1, '2026-12-08 00:00:00'],
] as const;

const MORNING = ['08:00', '08:30', '09:00', '09:30'];
const AFTERNOON = ['13:30', '14:00', '14:30', '15:00'];

export type D0World = Awaited<ReturnType<DashboardFixtures['d0']>>;

export class DashboardFixtures {
  readonly fx: BookingFixtures;
  readonly wallet: WalletFixtures;

  constructor(private readonly db: DataSource) {
    this.fx = new BookingFixtures(db);
    this.wallet = new WalletFixtures(db);
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

  /** Bộ D0. Trả id các chi nhánh, tài khoản, lịch và giao dịch theo tên ở bảng 7.0. */
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

    const walletId = patient.wallet.viNoiBoId;
    const payments = await this.d0Payments(
      appointments,
      walletId,
      receptionistA.account.taiKhoanId,
    );
    for (const [
      payment,
      loai,
      trangThai,
      soTien,
      soLanThu,
      thoiDiem,
    ] of D0_REFUNDS)
      await this.refund({
        giaoDichThanhToanId: required(payments, payment),
        viNoiBoId: walletId,
        loai,
        trangThai,
        soTien,
        soLanThu,
        thoiDiem,
      });
    await this.d0Requests({
      appointments,
      slots,
      walletId,
      branchA: branchA.chiNhanhId,
      branchB: branchB.chiNhanhId,
      adminA: adminA.account.taiKhoanId,
      adminB: adminB.account.taiKhoanId,
      systemAdmin: systemAdmin.account.taiKhoanId,
    });

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
      walletId,
      payments,
    };
  }

  /** Mười ba giao dịch của bảng 7.0 (P1 đến P13). Trả id theo tên. */
  private async d0Payments(
    appointments: Record<string, string>,
    walletId: string,
    cashierId: string,
  ): Promise<Record<string, string>> {
    const ids: Record<string, string> = {};
    for (const [name, appointment, kind, soTien, thoiDiemTao] of D0_PAYMENTS) {
      ids[name] = await this.wallet.insertPayment(
        kind === 'NapVi'
          ? {
              viNoiBoId: walletId,
              loai: 'NapVi',
              phuongThuc: 'VNPay',
              soTien,
              thoiDiemTao,
            }
          : kind === 'TienMat'
            ? {
                lichHenId: required(appointments, appointment),
                loai: 'ThanhToanLichHen',
                phuongThuc: 'TienMatTaiQuay',
                nguoiThuId: cashierId,
                soTien,
                thoiDiemTao,
              }
            : {
                viNoiBoId: walletId,
                lichHenId: required(appointments, appointment),
                loai: 'ThanhToanLichHen',
                phuongThuc: 'Vi',
                soTien,
                thoiDiemTao,
              },
      );
    }
    return ids;
  }

  /** Một dòng `lich_su_hoan_tien` (một lần thử hoàn), đặt được loại và giờ (fixture của wallet luôn ghi `TuDong` ở một giờ cố định). */
  async refund(input: {
    giaoDichThanhToanId: string;
    viNoiBoId: string;
    loai: 'TuDong' | 'DacBiet';
    trangThai: 'ThanhCong' | 'ThatBai';
    soTien: string;
    soLanThu: number;
    thoiDiem: string;
  }): Promise<string> {
    const result: { insertId: string } = await this.db.query(
      `INSERT INTO lich_su_hoan_tien (giao_dich_thanh_toan_id, vi_noi_bo_id, loai, so_tien, ly_do, trang_thai, so_lan_thu, thoi_diem)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.giaoDichThanhToanId,
        input.viNoiBoId,
        input.loai,
        input.soTien,
        input.loai === 'DacBiet' ? 'Hoàn đặc biệt mẫu' : null,
        input.trangThai,
        input.soLanThu,
        input.thoiDiem,
      ],
    );
    return String(result.insertId);
  }

  /**
   * Yêu cầu của bảng 7.0: đổi lịch chờ duyệt cho L5, L10, N1 và một yêu cầu từ chối cho L8; rút tiền 2 chờ duyệt, 1 đã duyệt; thay đổi chi nhánh A chờ
   * duyệt, B đã duyệt chưa áp dụng. Dùng lại fixture của booking (đổi lịch), wallet (rút tiền) và admin (thay đổi chi nhánh), không chép.
   */
  private async d0Requests(input: {
    appointments: Record<string, string>;
    slots: Record<string, string | undefined>;
    walletId: string;
    branchA: string;
    branchB: string;
    adminA: string;
    adminB: string;
    systemAdmin: string;
  }): Promise<void> {
    const reschedules = [
      ['L5', 's14', 'ChoDuyet'],
      ['L10', 's15', 'ChoDuyet'],
      ['N1', 'u2', 'ChoDuyet'],
      ['L8', 's16', 'TuChoi'],
    ] as const;
    for (const [appointment, slot, trangThai] of reschedules)
      await insertRequestAt(this.db, {
        lichHenId: required(input.appointments, appointment),
        khungGioMongMuonId: required(input.slots, slot),
        thoiDiemTao: '2026-12-03 09:00:00',
        trangThai,
        nguoiXuLyId: input.systemAdmin,
      });
    for (const trangThai of ['ChoDuyet', 'ChoDuyet', 'DaDuyet'] as const)
      await this.wallet.insertWithdrawal({
        viNoiBoId: input.walletId,
        soTien: '50000.00',
        trangThai,
        nguoiXuLyId: input.systemAdmin,
      });
    const changes = new PendingChangeFixtures(this.db);
    await changes.insert({
      chiNhanhId: input.branchA,
      proposerId: input.adminA,
      approverId: input.systemAdmin,
      trangThai: 'ChoDuyet',
    });
    await changes.insert({
      chiNhanhId: input.branchB,
      proposerId: input.adminB,
      approverId: input.systemAdmin,
      trangThai: 'DaDuyet',
    });
  }
}

/** Giá trị theo tên ở bảng 7.0; thiếu là lỗi của chính fixture. */
function required(
  table: Record<string, string | undefined>,
  name: string | null,
): string {
  const value = name === null ? undefined : table[name];
  if (value === undefined) throw new Error(`Thiếu ${String(name)} trong bộ D0`);
  return value;
}
