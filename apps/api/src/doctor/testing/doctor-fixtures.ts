import type { DataSource, EntityManager } from 'typeorm';
import { AdminFixtures } from '../../admin/testing/admin-fixtures.js';
import type { BacSi } from '../../admin/entities/bac-si.entity.js';
import type { LichLamViec } from '../../admin/entities/lich-lam-viec.entity.js';
import { formatHHMM } from '../../scheduling/branch-hours/time-of-day.js';
import { generateSlotStarts } from '../../scheduling/slots/slot-generator.rules.js';
import type { CaLamViec } from '../../scheduling/branch-hours/branch-hours.types.js';

// Hạ tầng test dùng chung của module doctor (H13: không chép giữa các file test, jscpd quét cả *.int-spec.ts).
// Bọc AdminFixtures, KHÔNG sửa nó. Ghi thật vào DB test.

/** Khoảng của hai ca khớp `AdminFixtures.weeklySchedule` (sáng 08–12, chiều 13–17). */
const CA_RANGE = {
  CaSang: { tuGiay: 8 * 3600, denGiay: 12 * 3600 },
  CaChieu: { tuGiay: 13 * 3600, denGiay: 17 * 3600 },
} as const;

export interface LeaveRequestInput {
  bacSiId: string;
  hinhThuc?: 'CaNgay' | 'TheoCa';
  batDau?: string;
  ketThuc?: string;
  ca?: CaLamViec | null;
  trangThai?: 'ChoDuyet' | 'DaDuyet' | 'TuChoi';
  nguoiXuLyId?: string | null;
  thoiDiemXuLy?: string | null;
}

export class DoctorFixtures {
  readonly admin: AdminFixtures;

  constructor(private readonly db: DataSource | EntityManager) {
    this.admin = new AdminFixtures(db);
  }

  /** Một chi nhánh đủ 7 thứ (08–12, 13–17) + bác sĩ + Lễ tân + Admin Toàn hệ thống + Admin Chi nhánh. Dịch vụ 30 phút. */
  async world() {
    const branch = await this.admin.branch();
    await this.admin.weeklySchedule(branch.chiNhanhId);
    const doctor = await this.admin.doctor(branch);
    const receptionist = await this.admin.receptionist(branch);
    const systemAdmin = await this.admin.admin();
    const branchAdmin = await this.admin.admin(branch);
    return { branch, doctor, receptionist, systemAdmin, branchAdmin };
  }

  /** Ca kèm đủ khung giờ `ConTrong`; `ngay_gio` ghi bằng CHUỖI (H1), không qua Date. */
  async shiftWithSlots(
    doctor: BacSi,
    input: { ngay: string; ca: 'CaSang' | 'CaChieu'; thoiLuongPhut?: number },
  ): Promise<{ shift: LichLamViec; slotIds: string[] }> {
    const shift = await this.admin.shift(doctor, {
      ngay: input.ngay,
      ca: input.ca,
    });
    const starts = generateSlotStarts(
      CA_RANGE[input.ca],
      input.thoiLuongPhut ?? 30,
    );
    const slotIds: string[] = [];
    for (const start of starts) {
      const result: { insertId: string } = await this.db.query(
        "INSERT INTO khung_gio (lich_lam_viec_id, ngay_gio, trang_thai) VALUES (?, ?, 'ConTrong')",
        [shift.lichLamViecId, `${input.ngay} ${formatHHMM(start)}:00`],
      );
      slotIds.push(String(result.insertId));
    }
    return { shift, slotIds };
  }

  /** Chèn thẳng một yêu cầu nghỉ phép (mặc định hợp lệ: CaNgay một ngày, ChoDuyet); từng ca test ghi đè đúng chỗ cần thử. */
  async leaveRequest(input: LeaveRequestInput): Promise<string> {
    const batDau = input.batDau ?? '2026-12-01';
    const result: { insertId: string } = await this.db.query(
      `INSERT INTO yeu_cau_nghi_phep
         (bac_si_id, hinh_thuc_nghi, ngay_bat_dau, ngay_ket_thuc, ca, ly_do, trang_thai, nguoi_xu_ly_id, thoi_diem_xu_ly, thoi_diem_tao)
       VALUES (?, ?, ?, ?, ?, 'Việc gia đình', ?, ?, ?, NOW())`,
      [
        input.bacSiId,
        input.hinhThuc ?? 'CaNgay',
        batDau,
        input.ketThuc ?? batDau,
        input.ca ?? null,
        input.trangThai ?? 'ChoDuyet',
        input.nguoiXuLyId ?? null,
        input.thoiDiemXuLy ?? null,
      ],
    );
    return String(result.insertId);
  }
}
