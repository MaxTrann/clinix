import type { BranchDayHours } from '../../scheduling/branch-hours/branch-hours.types.js';
import type { BookabilityFacts } from '../slots/bookability.rules.js';

// Dựng `facts` cho test của `evaluateBookability` (PLAN booking 7.23, BKA): MỘT chỗ định nghĩa "thế giới đặt được" để mỗi ca chỉ ghi đè đúng chỗ cần thử, không chép khối dữ liệu
// giữa các test (jscpd quét `testing/`). Mọi giá trị là MINH HOẠ cho test, không phải quyết định của nhóm.

/** 08:00 thứ Hai 02/11/2026 giờ Việt Nam: mốc `now` mặc định (cùng `BOOKING_T0`). */
export const FACTS_NOW = new Date('2026-11-02T08:00:00+07:00');
/** 08:00 thứ Ba 10/11/2026 giờ Việt Nam: khung giờ đặt được mặc định (thứ 2 theo ISO). */
export const FACTS_SLOT_START = new Date('2026-11-10T08:00:00+07:00');

const hour = (h: number) => h * 3600;

/** Chi nhánh mở cả ngày: sáng 08:00–12:00, chiều 13:00–17:00 (như `AdminFixtures.weeklySchedule`). */
export const OPEN_ALL_DAY: BranchDayHours = {
  hoatDong: true,
  sang: { tuGiay: hour(8), denGiay: hour(12) },
  chieu: { tuGiay: hour(13), denGiay: hour(17) },
};

/** `facts` mà `evaluateBookability` trả `{ ok: true, lapsedHold: null }`; `overrides` ghi đè từng nhóm khoá (không trộn sâu: truyền cả đối tượng con). */
export function bookabilityFacts(
  overrides: Partial<BookabilityFacts> = {},
): BookabilityFacts {
  return {
    now: FACTS_NOW,
    noShowLocked: false,
    slot: {
      khungGioId: '10',
      ngayGio: FACTS_SLOT_START,
      trangThai: 'ConTrong',
      giuChoDen: null,
    },
    slotHolder: null,
    doctor: {
      bacSiId: '5',
      khaDung: true,
      chiNhanhId: '1',
      dichVuKhamId: '7',
    },
    shift: { chiNhanhId: '1', ca: 'CaSang' },
    thoiLuongPhut: 30,
    ngayHoatDong: OPEN_ALL_DAY,
    blockingLeave: null,
    pendingBranchChange: null,
    activeAppointments: [],
    soLichHenToiDa: 3,
    overlaps: [],
    ...overrides,
  };
}

/** Đóng băng sâu: dùng để chứng minh luật không đổi `facts`. */
export function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
