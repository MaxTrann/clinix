import type { CaLamViec } from '../../admin/entities/enums.js';
import type {
  BranchDayHours,
  HoursViolation,
} from '../../scheduling/branch-hours/branch-hours.types.js';
import { checkSlotWithinBranchHours } from '../../scheduling/branch-hours/slot-hours.rules.js';
import type { BlockingLeaveRef } from '../../scheduling/leave/leave-overlap.rules.js';
import type { ActiveAppointment } from '../active-appointment.query.js';
import {
  BOOKING_ERROR_CODES,
  type BookingErrorCode,
} from '../appointments.constants.js';
import type { OverlappingAppointment } from '../overlapping-appointment.query.js';
import type { PendingBranchChange } from '../ports/pending-branch-changes.port.js';
import type { SlotRow } from './slot-lock.js';

// `evaluateBookability`: MỘT bộ luật THUẦN cho mọi kiểm tra "khung giờ này đặt được không" của PLAN booking 5.4 bước 3 (TRACKING 3.14 B6-C, 3.14.3). `POST /booking/checks` (B7, đọc không
// khoá) và bước tạo (B8, đọc dưới khoá) dùng đúng hàm này; chỉ khác nơi lấy `facts` (`BookabilityReader`, hai chế độ `none` và `locked`). Hàm KHÔNG đọc đồng hồ (`facts.now` đã qua
// `toSecond`, H8), KHÔNG đổi `facts`, trả LỖI ĐẦU TIÊN theo đúng thứ tự dưới, không ném `AppException` (người gọi đổi sang lỗi API sau commit).

/** Lịch ĐANG giữ khung giờ (cột sinh `khung_gio_dang_giu`), đọc thường dưới khoá khung giờ. */
export interface SlotHolderRef {
  lichHenId: string;
  maLichHen: string;
}

/**
 * Khung giờ `DangGiuCho` đã hết hạn: coi là TRỐNG (hết hạn lười, PLAN 5.5, Q3) nhưng người gọi phải ghi hết hạn trước khi đặt (B6b `expireLapsedHold`). Cả hai trường `null` khi không có lịch
 * giữ (lời mời danh sách chờ hết hạn mà `waitlist` chưa quét): khung giờ vẫn phải được đặt lại `ConTrong`.
 */
export interface LapsedHoldRef {
  lichHenId: string | null;
  maLichHen: string | null;
}

export interface BookabilityFacts {
  /** Mốc duy nhất của luồng, đã `toSecond(nowVN())` */
  now: Date;
  /** `benh_nhan.khoa_dat_lich_do_no_show` của tài khoản đặt (khoá áp dụng cả khi đặt cho người thân, Q14) */
  noShowLocked: boolean;
  slot: Pick<SlotRow, 'khungGioId' | 'ngayGio' | 'trangThai' | 'giuChoDen'>;
  /** Có khi khung giờ đang `DangGiuCho` và có lịch giữ nó */
  slotHolder: SlotHolderRef | null;
  doctor: {
    bacSiId: string;
    /** `PUBLIC_DOCTOR_CONDITION`: tài khoản và chuyên khoa đang hoạt động, cặp chi nhánh–dịch vụ còn có */
    khaDung: boolean;
    /** Chi nhánh HIỆN TẠI của bác sĩ (đọc dưới khoá `bac_si` ở chế độ `locked`) */
    chiNhanhId: string;
    dichVuKhamId: string;
  };
  /** Ca của khung giờ; `chiNhanhId` là chi nhánh GHI TRÊN CA (D12) */
  shift: { chiNhanhId: string; ca: CaLamViec };
  /** `dich_vu_kham.thoi_luong` hiện hành của dịch vụ của bác sĩ */
  thoiLuongPhut: number;
  /** Giờ nhận khám của chi nhánh của ca ở thứ của khung giờ; `null` = chưa khai báo */
  ngayHoatDong: BranchDayHours | null;
  blockingLeave: BlockingLeaveRef | null;
  pendingBranchChange: PendingBranchChange | null;
  /** Lịch đang hoạt động của hồ sơ đi khám (`findActiveAppointments`) */
  activeAppointments: readonly Pick<ActiveAppointment, 'maLichHen'>[];
  /** `cau_hinh_he_thong.so_lich_hen_toi_da_moi_ho_so` */
  soLichHenToiDa: number;
  /** Lịch đang hoạt động của hồ sơ đi khám chồng giờ khung giờ này (`findOverlappingAppointments`) */
  overlaps: readonly OverlappingAppointment[];
}

export type BookabilityVerdict =
  | { ok: true; lapsedHold: LapsedHoldRef | null }
  | { ok: false; code: BookingErrorCode; chiTiet?: unknown };

/**
 * Khung giờ `DangGiuCho` mà hạn giữ đã hết: `giu_cho_den <= now` (nửa mở: đúng mốc là hết, HG-14) hoặc thiếu `giu_cho_den` (như `deriveSlotStatus` của `scheduling/`, dữ liệu hỏng
 * coi là trống). Một chỗ định nghĩa cho cả luật và bộ đọc.
 */
export function isLapsedHold(
  slot: Pick<SlotRow, 'trangThai' | 'giuChoDen'>,
  now: Date,
): boolean {
  return (
    slot.trangThai === 'DangGiuCho' &&
    (slot.giuChoDen === null || slot.giuChoDen.getTime() <= now.getTime())
  );
}

// Mã lý do của luật giờ nhận khám (`scheduling/`, quy tắc 29) sang mã API (PLAN 5.14)
const HOURS_ERROR_CODES: Record<HoursViolation, BookingErrorCode> = {
  ChuaKhaiBao: BOOKING_ERROR_CODES.BRANCH_NOT_DECLARED,
  NgayNghi: BOOKING_ERROR_CODES.BRANCH_CLOSED,
  CaKhongTonTai: BOOKING_ERROR_CODES.SHIFT_NOT_ACCEPTED,
  NgoaiGioHoatDong: BOOKING_ERROR_CODES.OUTSIDE_OPENING_HOURS,
};

const reject = (
  code: BookingErrorCode,
  chiTiet?: unknown,
): BookabilityVerdict =>
  chiTiet === undefined ? { ok: false, code } : { ok: false, code, chiTiet };

/**
 * Kiểm theo ĐÚNG thứ tự 5.4 bước 3 và dừng ở lỗi đầu tiên:
 *  1. khoá no-show; 2. trạng thái khung giờ (kèm hết hạn lười); 3. giờ bắt đầu `> now`; 4. bác sĩ khả dụng, rồi chi nhánh của ca khớp chi nhánh bác sĩ; 5. giờ nhận khám của chi nhánh;
 *  6. nghỉ phép; 7. vùng bị loại bởi thay đổi chi nhánh đã duyệt; 8. số lịch đang hoạt động; 9. trùng, chồng lấn.
 * Lịch CHỦ đã hết hạn của chính khung giờ này (hết hạn lười) KHÔNG tính ở bước 8 và 9, nếu không người vừa để hết hạn rồi đặt lại đúng khung giờ đó bị từ chối oan (TRACKING 3.14 câu (i));
 * lịch `ChoThanhToan` hết hạn của khung giờ KHÁC vẫn tính (Q4: còn có thể được xác nhận trễ).
 */
export function evaluateBookability(
  facts: BookabilityFacts,
): BookabilityVerdict {
  const { now, slot } = facts;

  // 1. Khoá no-show (A4)
  if (facts.noShowLocked)
    return reject(BOOKING_ERROR_CODES.BOOKING_LOCKED_NO_SHOW);

  // 2. Trạng thái khung giờ (A2). `HetHan` đã lưu: booking không ghi giá trị này (Q3) nên gặp thì coi là đã qua.
  if (slot.trangThai === 'DaDat')
    return reject(BOOKING_ERROR_CODES.SLOT_BOOKED);
  if (slot.trangThai === 'HetHan') return reject(BOOKING_ERROR_CODES.SLOT_PAST);
  const lapsed = isLapsedHold(slot, now);
  if (slot.trangThai === 'DangGiuCho' && !lapsed)
    return reject(BOOKING_ERROR_CODES.SLOT_HELD);
  const lapsedHold: LapsedHoldRef | null = lapsed
    ? {
        lichHenId: facts.slotHolder?.lichHenId ?? null,
        maLichHen: facts.slotHolder?.maLichHen ?? null,
      }
    : null;

  // 3. Giờ bắt đầu phải SAU `now` (Q5): đúng bằng `now` là đã qua
  if (slot.ngayGio.getTime() <= now.getTime())
    return reject(BOOKING_ERROR_CODES.SLOT_PAST);

  // 4. Bác sĩ khả dụng, rồi ca đúng chi nhánh hiện tại của bác sĩ (D12)
  if (!facts.doctor.khaDung)
    return reject(BOOKING_ERROR_CODES.DOCTOR_UNAVAILABLE);
  if (facts.shift.chiNhanhId !== facts.doctor.chiNhanhId)
    return reject(BOOKING_ERROR_CODES.SLOT_INVALID);

  // 5. Khung giờ nằm trọn trong khoảng nhận khám của ca (A6): hàm thuần của `doctor`, không viết lần hai (D2)
  const hours = checkSlotWithinBranchHours({
    ngayGio: slot.ngayGio,
    thoiLuongPhut: facts.thoiLuongPhut,
    ca: facts.shift.ca,
    ngayHoatDong: facts.ngayHoatDong,
  });
  if (!hours.ok) {
    const { thuTrongTuan, gioMo, gioDong } = hours.chiTiet;
    return reject(HOURS_ERROR_CODES[hours.lyDo], {
      thuTrongTuan,
      ...(gioMo === undefined ? {} : { gioMo }),
      ...(gioDong === undefined ? {} : { gioDong }),
    });
  }

  // 6, 7. Nghỉ phép (cả `ChoDuyet` và `DaDuyet`), rồi vùng bị loại (H5, H6)
  if (facts.blockingLeave !== null)
    return reject(BOOKING_ERROR_CODES.DOCTOR_ON_LEAVE);
  if (facts.pendingBranchChange !== null)
    return reject(BOOKING_ERROR_CODES.SLOT_OUTSIDE_NEW_SCHEDULE);

  // 8, 9. Hồ sơ đi khám (Q12, Q10); loại lịch chủ hết hạn của chính khung giờ này
  const ownHolder = lapsedHold?.maLichHen ?? null;
  const counted = (maLichHen: string) => maLichHen !== ownHolder;
  const activeCount = facts.activeAppointments.filter((a) =>
    counted(a.maLichHen),
  ).length;
  if (activeCount >= facts.soLichHenToiDa)
    return reject(BOOKING_ERROR_CODES.OVER_MAX_APPOINTMENTS, {
      toiDa: facts.soLichHenToiDa,
    });
  const overlap = facts.overlaps.find((o) => counted(o.maLichHen));
  if (overlap !== undefined)
    return reject(BOOKING_ERROR_CODES.OVERLAPPING_APPOINTMENT, {
      maLichHen: overlap.maLichHen,
      thoiGian: overlap.thoiGian,
    });

  return { ok: true, lapsedHold };
}
