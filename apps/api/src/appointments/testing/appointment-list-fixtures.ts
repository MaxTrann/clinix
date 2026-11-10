import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import type { BacSi } from '../../admin/entities/bac-si.entity.js';
import type { ChiNhanh } from '../../admin/entities/chi-nhanh.entity.js';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import type { LichHen } from '../../admin/entities/lich-hen.entity.js';
import type { BookingFixtures } from './booking-fixtures.js';

// Hạ tầng test dùng chung của các danh sách lịch hẹn (task B1; int-spec và e2e cùng dùng, để jscpd không thấy dựng dữ liệu hai lần; PLAN booking 5.15, H18).
// BỌC `BookingFixtures`, không chép: mỗi lịch hẹn có khung giờ RIÊNG (UNIQUE `khung_gio_dang_giu`), nên ở đây chỉ lo chọn khung giờ kế tiếp còn trống.
// Mọi tên, ngày, số tiền là MINH HOẠ cho test.

/** SĐT riêng của bác sĩ dựng ở đây: test quét JSON phản hồi để chắc nó không bao giờ lọt ra (LSH-14). Mặc định của fixture dùng chung một SĐT cho mọi tài khoản. */
export const DOCTOR_PHONE = '0987000111';

/** Hai ca một ngày, mỗi ca 8 khung giờ 30 phút: sáng 08:00 đến 11:30, chiều 13:00 đến 16:30. */
const SLOTS_PER_DOCTOR_DAY = 16;

export interface BookInput {
  patientId: string;
  /** Ngày (giờ VN) `YYYY-MM-DD` của lịch; giờ là giờ của khung giờ kế tiếp còn trống của bác sĩ ở ngày đó */
  ngay: string;
  hoSoNguoiThanId?: string | null;
  maLichHen?: string;
}

export class AppointmentListFixtures {
  private readonly freeSlots = new Map<string, string[]>();

  constructor(
    private readonly fx: BookingFixtures,
    private readonly db: DataSource,
  ) {}

  /**
   * Chi nhánh, một bác sĩ và một Bệnh nhân, với họ tên đặt được. Mặc định KHÁC tên mặc định của fixture (mọi tài khoản đều là "Nguyễn Văn A") để từ khoá `q`
   * không khớp nhầm giữa bác sĩ và Bệnh nhân.
   */
  async scene(input: { doctorName?: string; patientName?: string } = {}) {
    const branch = await this.fx.admin.branch();
    const doctor = await this.doctorIn(branch, input.doctorName);
    const patient = await this.fx.admin.patient({
      hoTen: input.patientName ?? 'Bệnh Nhân Mẫu',
    });
    return { branch, doctor, patient, patientId: patient.account.taiKhoanId };
  }

  /** Thêm một bác sĩ vào chi nhánh (mỗi bác sĩ có chuyên khoa và dịch vụ riêng do `AdminFixtures.doctor` dựng), SĐT là `DOCTOR_PHONE`, email riêng. */
  doctorIn(branch: ChiNhanh, hoTen = 'Bác Sĩ Mẫu') {
    return this.fx.admin.doctor(
      branch,
      {},
      {
        hoTen,
        soDienThoai: DOCTOR_PHONE,
        email: `bac.si.${randomUUID()}@example.com`,
      },
    );
  }

  /** Lịch hẹn ở `trangThai`, kèm khung giờ nhất quán (`BookingFixtures.appointmentIn`), dùng khung giờ kế tiếp còn trống của bác sĩ ở `ngay`. */
  async book(
    doctor: BacSi,
    trangThai: TrangThaiLichHen,
    input: BookInput,
  ): Promise<LichHen> {
    return this.fx.appointmentIn(trangThai, {
      doctor,
      khungGioId: await this.nextSlot(doctor, input.ngay),
      patientId: input.patientId,
      hoSoNguoiThanId: input.hoSoNguoiThanId ?? null,
      ...(input.maLichHen === undefined ? {} : { maLichHen: input.maLichHen }),
    });
  }

  /**
   * Đặt `thoi_gian` của lịch bằng CHUỖI giờ VN `YYYY-MM-DD HH:mm:ss` (ca biên nửa đêm, ca cùng giờ): chỉ để thử bộ lọc danh sách, không đổi khung giờ.
   * Chuỗi, không `Date`: không qua múi giờ của driver (H1).
   */
  async setTime(lichHenId: string, gio: string): Promise<void> {
    await this.db.query(
      'UPDATE lich_hen SET thoi_gian = ? WHERE lich_hen_id = ?',
      [gio, lichHenId],
    );
  }

  private async nextSlot(doctor: BacSi, ngay: string): Promise<string> {
    const key = `${doctor.taiKhoanId}|${ngay}`;
    let slots = this.freeSlots.get(key);
    if (slots === undefined) {
      const morning = await this.fx.doctor.shiftWithSlots(doctor, {
        ngay,
        ca: 'CaSang',
      });
      const afternoon = await this.fx.doctor.shiftWithSlots(doctor, {
        ngay,
        ca: 'CaChieu',
      });
      slots = [...morning.slotIds, ...afternoon.slotIds];
      this.freeSlots.set(key, slots);
    }
    const next = slots.shift();
    if (next === undefined)
      throw new Error(
        `Hết khung giờ của bác sĩ ${doctor.taiKhoanId} ngày ${ngay} (${String(SLOTS_PER_DOCTOR_DAY)} ô): dùng ngày khác`,
      );
    return next;
  }
}
