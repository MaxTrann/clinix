import type { DataSource, EntityManager } from 'typeorm';
import { BranchHoursReader } from '../../scheduling/branch-hours/branch-hours.reader.js';
import {
  BOOKING_ERROR_CODES,
  type BookingErrorCode,
} from '../appointments.constants.js';
import { withBookingTransaction } from '../locking/booking-transaction.js';
import { BookabilityReader } from '../slots/bookability.reader.js';
import { evaluateBookability } from '../slots/bookability.rules.js';
import { holdDeadline, SlotHoldService } from '../slots/slot-hold.service.js';
import { lockVisitProfile } from '../visit-profile.query.js';
import { HOLD_MINUTES, nextAppointmentCode } from './booking-fixtures.js';
import {
  FakeDoctorLeavePort,
  FakePendingBranchChangesPort,
} from './fake-ports.js';

// Hàm tạo lịch RÚT GỌN chỉ dùng trong TEST (booking B6b; TRACKING 3.14 B6-H): chạy đúng chuỗi giao dịch của bước tạo (PLAN 5.4, thứ tự ở TRACKING 3.14 B6-B) tới `hold`/`markBooked`,
// để DT-01, DT-02, DT-13, BKF-02 và DL-03…DL-05 (mức dịch vụ) kiểm lõi đồng thời TRƯỚC khi B8 viết dịch vụ thật. Nằm trong `testing/` nên AR-01 và AR-06 bỏ qua (nó chèn `lich_hen`
// bằng SQL thẳng). KHÔNG có giá, cọc, mã lỗi API hay HTTP: giá `gia_snapshot` là số minh hoạ. B8 có thể tái dùng hoặc thay bằng dịch vụ thật.
//
//   readNoShowLock('locked') [tầng 2] → lockVisitProfile [tầng 3] → read('locked') [tầng 4, 5, rồi các câu đọc thường] → evaluateBookability
//   → [lapsedHold: expireLapsedHold] → INSERT lich_hen → hold → [cọc 0đ: markBooked]
// Mọi bước ghi chỉ chạy khi `evaluateBookability` trả `ok` (từ chối thì không ghi gì: DL-03, DL-04). Trả KẾT QUẢ CÓ KIỂU, không ném `AppException` trong giao dịch.

/** Giờ của luồng: 09:00 ngày 02/11/2026 (sau hạn giữ chỗ 08:15 của lịch `ChoThanhToan` trong fixture, trước mọi khung giờ của ngày 10/11). */
export const FLOW_NOW = new Date('2026-11-02T09:00:00+07:00');

export interface FlowInput {
  khungGioId: string;
  benhNhanId: string;
  hoSoNguoiThanId?: string | null;
  /** Mặc định `FLOW_NOW` */
  now?: Date;
  /** Mặc định 3 (như `BookingFixtures.systemConfig`) */
  soLichHenToiDa?: number;
  /** Phút giữ chỗ, mặc định `HOLD_MINUTES` */
  thoiGianGiuCho?: number;
  /** Cọc 0đ: xác nhận ngay (`DaXacNhan`, khung giờ `DaDat`) */
  zeroDeposit?: boolean;
}

export type FlowResult =
  | {
      kind: 'Created';
      lichHenId: string;
      maLichHen: string;
      trangThai: 'ChoThanhToan' | 'DaXacNhan';
      hanThanhToan: Date;
      /** `lich_hen_id` của lịch cũ đã hết hạn lười trong cùng giao dịch, nếu có */
      expiredHolderId: string | null;
    }
  | { kind: 'Rejected'; code: BookingErrorCode; chiTiet?: unknown }
  | { kind: 'SlotNotFound' }
  | { kind: 'NoPatient' }
  | { kind: 'ProfileUnusable'; state: 'missing' | 'inactive' };

const INSERT_APPOINTMENT_SQL = `INSERT INTO lich_hen
  (ma_lich_hen, khung_gio_id, benh_nhan_id, ho_so_nguoi_than_id, bac_si_id, chi_nhanh_id, dich_vu_kham_id, thoi_gian, gia_snapshot, trang_thai, han_thanh_toan)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, '100000.00', 'ChoThanhToan', ?)`;

export function createBookingFlow(db: DataSource) {
  const leave = new FakeDoctorLeavePort();
  const pending = new FakePendingBranchChangesPort();
  const reader = new BookabilityReader(new BranchHoursReader(), leave, pending);
  const holds = new SlotHoldService();

  async function run(em: EntityManager, input: FlowInput): Promise<FlowResult> {
    const now = input.now ?? FLOW_NOW;
    const hoSoNguoiThanId = input.hoSoNguoiThanId ?? null;
    const noShow = await reader.readNoShowLock(em, input.benhNhanId, 'locked');
    if (noShow === null) return { kind: 'NoPatient' };
    const profile = await lockVisitProfile(
      em,
      input.benhNhanId,
      hoSoNguoiThanId,
    );
    if (profile !== 'active')
      return { kind: 'ProfileUnusable', state: profile };

    const read = await reader.read(
      em,
      {
        khungGioId: input.khungGioId,
        benhNhanId: input.benhNhanId,
        hoSoNguoiThanId,
        noShowLocked: noShow,
        soLichHenToiDa: input.soLichHenToiDa ?? 3,
        now,
      },
      'locked',
    );
    if (read.kind === 'SlotNotFound') return { kind: 'SlotNotFound' };
    const verdict = evaluateBookability(read.facts);
    if (!verdict.ok)
      return { kind: 'Rejected', code: verdict.code, chiTiet: verdict.chiTiet };
    const locked = read.locked;
    if (locked === null) throw new Error('chế độ locked phải trả LockedSlot');

    let expiredHolderId: string | null = null;
    if (verdict.lapsedHold !== null) {
      const expired = await holds.expireLapsedHold(em, locked, { now });
      if (expired.kind === 'Expired') expiredHolderId = expired.lichHenId;
      else if (expired.kind !== 'NoHolder')
        return { kind: 'Rejected', code: BOOKING_ERROR_CODES.SLOT_HELD };
    }

    const han = holdDeadline(now, input.thoiGianGiuCho ?? HOLD_MINUTES);
    const maLichHen = nextAppointmentCode();
    const inserted: { insertId: string | number } = await em.query(
      INSERT_APPOINTMENT_SQL,
      [
        maLichHen,
        input.khungGioId,
        input.benhNhanId,
        hoSoNguoiThanId,
        read.facts.doctor.bacSiId,
        read.facts.doctor.chiNhanhId,
        read.facts.doctor.dichVuKhamId,
        read.facts.slot.ngayGio,
        han,
      ],
    );
    const lichHenId = String(inserted.insertId);
    // Không `Done` ở đây là bất biến vỡ (đã khoá và đã kiểm `ConTrong`): ném để hoàn tác cả `INSERT`, không commit lịch mồ côi (INV-05)
    if ((await holds.hold(em, locked, { den: han })).kind !== 'Done')
      throw new Error('hold không ghi được dưới khoá sau khi INSERT lich_hen');
    if (input.zeroDeposit === true) {
      await em.query(
        "UPDATE lich_hen SET trang_thai = 'DaXacNhan' WHERE lich_hen_id = ?",
        [lichHenId],
      );
      if ((await holds.markBooked(em, locked)).kind !== 'Done')
        throw new Error('markBooked không ghi được dưới khoá');
    }
    return {
      kind: 'Created',
      lichHenId,
      maLichHen,
      trangThai: input.zeroDeposit === true ? 'DaXacNhan' : 'ChoThanhToan',
      hanThanhToan: han,
      expiredHolderId,
    };
  }

  return {
    reader,
    holds,
    leave,
    pending,
    /** Một lần tạo trong `withBookingTransaction` (READ COMMITTED, thử lại ≤ 2, timeout chờ khoá 3 giây) */
    create: (input: FlowInput): Promise<FlowResult> =>
      withBookingTransaction(db, (em) => run(em, input), {
        label: 'booking-flow-test',
      }),
  };
}

export type BookingFlow = ReturnType<typeof createBookingFlow>;
