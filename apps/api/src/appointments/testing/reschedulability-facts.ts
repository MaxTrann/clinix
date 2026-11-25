import type {
  ReschedulabilityFacts,
  ReschedulabilityVerdict,
  RescheduleSource,
} from '../reschedule/reschedule.types.js';
import { FACTS_NOW, bookabilityFacts } from './bookability-facts.js';

// Dựng `facts` cho test của `evaluateReschedulability` (reschedule B2, PLAN reschedule 7.1, KDL): MỘT chỗ định nghĩa "đổi được" để mỗi ca chỉ ghi đè đúng chỗ cần thử, không chép khối dữ liệu
// giữa các test (jscpd quét `testing/`). Giá trị là MINH HOẠ cho test, không phải quyết định của nhóm. Cùng nếp `bookability-facts.ts`: dùng lại `bookabilityFacts` cho phần khung giờ ĐÍCH.

/** Mã lịch hẹn CŨ trong mọi `facts` mặc định (cũng là `thayThe`). */
export const OLD_APPOINTMENT_CODE = 'CLX-20261109-OLDAP';
/** Chủ lịch mặc định (tài khoản Bệnh nhân) và chi nhánh của lịch. */
export const OWNER_ID = '9';
export const BRANCH_ID = '1';

/** Lịch cũ: `DaXacNhan`, 08:00 thứ Hai 09/11/2026 giờ Việt Nam (sau `FACTS_NOW`), khung giờ cũ `11`, bác sĩ `5`, dịch vụ `7`, chi nhánh `1`, chưa tự đổi lần nào. */
export function rescheduleSource(
  overrides: Partial<RescheduleSource> = {},
): RescheduleSource {
  return {
    lichHenId: '100',
    maLichHen: OLD_APPOINTMENT_CODE,
    benhNhanId: OWNER_ID,
    hoSoNguoiThanId: null,
    bacSiId: '5',
    chiNhanhId: BRANCH_ID,
    dichVuKhamId: '7',
    khungGioId: '11',
    trangThai: 'DaXacNhan',
    thoiGian: new Date('2026-11-09T08:00:00+07:00'),
    soLanTuDoiLich: 0,
    ...overrides,
  };
}

/** Kết quả gọn để so trong test: `ok:<nhánh>`, mã của `Rule`, hoặc tên `kind` của lỗi có kiểu khác (`NotFound`, `ProfileInactive`, `SlotNotFound`). */
export function verdictLabel(verdict: ReschedulabilityVerdict): string {
  if (verdict.ok) return `ok:${verdict.branch}`;
  return verdict.failure.kind === 'Rule'
    ? verdict.failure.code
    : verdict.failure.kind;
}

/**
 * `facts` mà `evaluateReschedulability` trả `{ ok: true, branch: 'Reschedule', lapsedHold: null }` cho Bệnh nhân tự đổi sang khung giờ `10` (khung giờ đích của `bookabilityFacts`) của
 * cùng bác sĩ; lịch cũ có trong danh sách lịch đang hoạt động và là `thayThe`. `overrides` ghi đè từng nhóm khoá (không trộn sâu: truyền cả đối tượng con).
 */
export function reschedulabilityFacts(
  overrides: Partial<ReschedulabilityFacts> = {},
): ReschedulabilityFacts {
  return {
    actor: { via: 'TuDoi', accountId: OWNER_ID },
    now: FACTS_NOW,
    config: { soLanTuDoiLichToiDa: 2, checkInSauPhut: 15 },
    source: rescheduleSource(),
    profileActive: true,
    chainLength: 1,
    bookability: bookabilityFacts({
      thayThe: { maLichHen: OLD_APPOINTMENT_CODE },
      activeAppointments: [{ maLichHen: OLD_APPOINTMENT_CODE }],
    }),
    requestReasonGiven: false,
    pendingRequest: false,
    ...overrides,
  };
}
