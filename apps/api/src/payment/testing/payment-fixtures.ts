import type { DataSource } from 'typeorm';
import type { BacSi } from '../../admin/entities/bac-si.entity.js';
import type { LichHen } from '../../admin/entities/lich-hen.entity.js';
import type { BookingFixtures } from '../../appointments/testing/booking-fixtures.js';

// Hạ tầng test của `payment/` (payment P4; PLAN payment 5.15). BỌC `BookingFixtures` (chính nó bọc `DoctorFixtures` và `AdminFixtures`), KHÔNG chép: chi nhánh, bác sĩ, ca, khung giờ,
// Bệnh nhân kèm ví đều do các lớp đó dựng. Ghi thẳng DB test bằng SQL ở `testing/` (luật AR-01 và QTT-08 không quét thư mục này). Số tiền trong file là MINH HOẠ cho test.

/** Cọc minh hoạ của lịch `ChoThanhToan` trong world. */
export const PAYMENT_DEPOSIT = '100000.00';

export interface ChainInput {
  doctor: BacSi;
  patientId: string;
  /** Mỗi lịch của chuỗi cần một khung giờ riêng, theo đúng thứ tự (cũ nhất trước) */
  slotIds: readonly string[];
}

export class PaymentFixtures {
  constructor(
    private readonly db: DataSource,
    private readonly booking: BookingFixtures,
  ) {}

  /**
   * Chuỗi đổi lịch gồm `slotIds.length` lịch, CŨ NHẤT TRƯỚC: lịch sau trỏ `lich_hen_truoc_id` về lịch ngay trước; mọi lịch trừ lịch cuối ở `DaDoiLich`, lịch cuối ở `DaXacNhan`
   * (đúng thứ booking tạo khi đổi lịch, PLAN booking 5.2). Trả các lịch theo thứ tự đó; lịch đầu tiên là lịch GỐC.
   */
  async rescheduleChain(input: ChainInput): Promise<LichHen[]> {
    const lastIndex = input.slotIds.length - 1;
    const rows: LichHen[] = [];
    for (const [index, khungGioId] of input.slotIds.entries()) {
      rows.push(
        await this.booking.appointmentIn(
          index === lastIndex ? 'DaXacNhan' : 'DaDoiLich',
          { doctor: input.doctor, khungGioId, patientId: input.patientId },
        ),
      );
    }
    for (let i = 1; i < rows.length; i += 1)
      await this.linkPrevious(rows[i]!.lichHenId, rows[i - 1]!.lichHenId);
    return rows;
  }

  /** Đặt `lich_hen_truoc_id` của `lichHenId` (cho cả dữ liệu hỏng như vòng, tự trỏ chính mình: FK vẫn thoả vì hàng đã tồn tại). */
  async linkPrevious(lichHenId: string, truocId: string | null) {
    await this.db.query(
      'UPDATE lich_hen SET lich_hen_truoc_id = ? WHERE lich_hen_id = ?',
      [truocId, lichHenId],
    );
  }
}
