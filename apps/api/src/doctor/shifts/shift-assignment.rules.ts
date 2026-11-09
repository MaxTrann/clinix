import {
  formatCalendarDate,
  isoWeekdayOfEpochDay,
  parseCalendarDate,
} from '../../scheduling/calendar-date.js';
import type { BranchDayHours } from '../../scheduling/branch-hours/branch-hours.types.js';
import { checkShiftAssignable } from '../../scheduling/branch-hours/shift-window.rules.js';
import { formatRange } from '../../scheduling/branch-hours/time-of-day.js';
import {
  CA_KHONG_TON_TAI,
  MAX_RULE_RANGE_DAYS,
  MAX_RULE_SHIFTS,
} from '../../scheduling/scheduling.constants.js';
import { generateSlotStarts } from '../../scheduling/slots/slot-generator.rules.js';
import {
  ASSIGNABLE_SHIFTS,
  MAX_VIOLATIONS_LISTED,
  SHIFT_ERROR_CODES,
  type AssignableShift,
} from './shift-assignment.constants.js';

// Hàm thuần của phân công (PLAN doctor 5.3): mở quy tắc lặp thành từng ca và kiểm từng ca. Preview (B2) và POST (B3)
// dùng CHUNG các hàm này nên cùng một yêu cầu luôn ra cùng danh sách vi phạm (PC-17).

export interface ShiftRuleInput {
  bacSiIds: readonly string[];
  tuNgay: string;
  denNgay: string;
  thuTrongTuan: readonly number[];
  cas: readonly AssignableShift[];
}

export interface ShiftRow {
  bacSiId: string;
  ngay: string;
  ca: AssignableShift;
}

export type ExpandResult =
  | { ok: true; rows: ShiftRow[] }
  | { ok: false; maLoi: string; chiTiet?: Record<string, unknown> };

export const shiftKey = (row: ShiftRow): string =>
  `${row.bacSiId}|${row.ngay}|${row.ca}`;

/** Id bigint dạng chuỗi so theo số mà không mất độ chính xác. */
const byNumericId = (a: string, b: string): number =>
  a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);

/**
 * Mở quy tắc thành các ca, thứ tự duyệt cố định: bác sĩ (id tăng dần), ngày, ca (Sáng trước Chiều).
 * Khoảng ngày ngược / quá 92 ngày / không chứa thứ nào đã chọn ⇒ KHOANG_NGAY_KHONG_HOP_LE; quá 1.000 ca ⇒ QUA_NHIEU_CA.
 */
export function expandRule(input: ShiftRuleInput): ExpandResult {
  const from = parseCalendarDate(input.tuNgay);
  const to = parseCalendarDate(input.denNgay);
  const invalidRange = {
    ok: false as const,
    maLoi: SHIFT_ERROR_CODES.INVALID_DATE_RANGE,
    chiTiet: { toiDaNgay: MAX_RULE_RANGE_DAYS },
  };
  if (from === null || to === null || to < from) return invalidRange;
  if (to - from + 1 > MAX_RULE_RANGE_DAYS) return invalidRange;

  const weekdays = new Set(input.thuTrongTuan);
  const days: string[] = [];
  for (let day = from; day <= to; day += 1)
    if (weekdays.has(isoWeekdayOfEpochDay(day)))
      days.push(formatCalendarDate(day));
  if (days.length === 0) return invalidRange;

  const doctors = [...input.bacSiIds].sort(byNumericId);
  const cas = ASSIGNABLE_SHIFTS.filter((ca) => input.cas.includes(ca));
  const total = doctors.length * days.length * cas.length;
  if (total > MAX_RULE_SHIFTS)
    return {
      ok: false,
      maLoi: SHIFT_ERROR_CODES.TOO_MANY_SHIFTS,
      chiTiet: { soCa: total, toiDa: MAX_RULE_SHIFTS },
    };

  const rows = doctors.flatMap((bacSiId) =>
    days.flatMap((ngay) => cas.map((ca) => ({ bacSiId, ngay, ca }))),
  );
  return { ok: true, rows };
}

export interface DoctorShiftInfo {
  chiNhanhId: string;
  thoiLuongPhut: number;
}

export interface Violation extends ShiftRow {
  maLoi: string;
  chiTiet?: Record<string, unknown>;
}

export interface ViolationReport {
  /** Tối đa MAX_VIOLATIONS_LISTED vi phạm đầu tiên theo thứ tự duyệt. */
  viPham: Violation[];
  tongSoViPham: number;
  /** Tổng khung giờ của các ca HỢP LỆ (ca vi phạm không tính). */
  soKhungGio: number;
}

const rangeView = (range: BranchDayHours['sang']) =>
  range ? formatRange(range) : null;

/** Kiểm MỌI ca (không dừng ở lỗi đầu tiên): A1–A4 của luật giờ ca rồi trùng ca đã có (CA_DA_PHAN_CONG). */
export function collectViolations(input: {
  rows: readonly ShiftRow[];
  doctors: ReadonlyMap<string, DoctorShiftInfo>;
  /** Giờ nhận khám của (chi nhánh, thứ); `null` = chưa khai báo. */
  hoursOf: (chiNhanhId: string, thuTrongTuan: number) => BranchDayHours | null;
  existingKeys: ReadonlySet<string>;
  now: Date;
}): ViolationReport {
  const viPham: Violation[] = [];
  let tongSoViPham = 0;
  let soKhungGio = 0;
  for (const row of input.rows) {
    const doctor = input.doctors.get(row.bacSiId);
    if (!doctor) throw new Error(`Thiếu thông tin bác sĩ ${row.bacSiId}`);
    const day = parseCalendarDate(row.ngay);
    if (day === null) throw new Error(`Ngày không hợp lệ: ${row.ngay}`);
    const thuTrongTuan = isoWeekdayOfEpochDay(day);
    const hours = input.hoursOf(doctor.chiNhanhId, thuTrongTuan);

    const check = checkShiftAssignable({
      ngay: row.ngay,
      ca: row.ca,
      ngayHoatDong: hours,
      thoiLuongPhut: doctor.thoiLuongPhut,
      now: input.now,
    });
    let violation: Pick<Violation, 'maLoi' | 'chiTiet'> | null = null;
    if (!check.ok)
      violation = {
        maLoi: check.maLoi,
        chiTiet: {
          thuTrongTuan,
          ...(check.maLoi === CA_KHONG_TON_TAI && {
            khoang: {
              sang: rangeView(hours?.sang ?? null),
              chieu: rangeView(hours?.chieu ?? null),
            },
          }),
        },
      };
    else if (input.existingKeys.has(shiftKey(row)))
      violation = { maLoi: SHIFT_ERROR_CODES.ALREADY_ASSIGNED };
    else
      soKhungGio += generateSlotStarts(
        check.khoang,
        doctor.thoiLuongPhut,
      ).length;

    if (violation) {
      tongSoViPham += 1;
      if (viPham.length < MAX_VIOLATIONS_LISTED)
        viPham.push({ ...row, ...violation });
    }
  }
  return { viPham, tongSoViPham, soKhungGio };
}
