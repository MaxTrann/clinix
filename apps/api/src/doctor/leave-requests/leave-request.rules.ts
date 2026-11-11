import type { FieldError } from '../../common/errors/app.exception.js';
import type { ShiftWindowResult } from '../../scheduling/branch-hours/branch-hours.types.js';
import { secondsOfDayVN } from '../../scheduling/branch-hours/time-of-day.js';
import { parseCalendarDate } from '../../scheduling/calendar-date.js';
import type { LeaveWindow } from '../../scheduling/leave/leave-overlap.rules.js';
import {
  LEAVE_ERROR_CODES,
  LEAVE_FIELD_ERRORS,
  MAX_LEAVE_DAYS,
  MAX_LEAVE_DAYS_AHEAD,
  REASON_MAX_LENGTH,
  REASON_MIN_LENGTH,
} from './leave-request.constants.js';

// Luật thuần của "tạo yêu cầu nghỉ" (PLAN doctor 5.7): không DB, không Nest, không đồng hồ thật (nhận `today`/`now` từ nơi gọi).
// Ngày là chuỗi 'YYYY-MM-DD', so sánh chuỗi cho đúng thứ tự thời gian và đổi sang "số ngày" khi cần cộng trừ (H1: không qua Date địa phương).

/** Hai ca được phép xin nghỉ theo ca; `CaToi` không bao giờ được phân công (Q6) nên không có gì để nghỉ. */
const LEAVE_SHIFTS = ['CaSang', 'CaChieu'] as const;

/** Dữ liệu client gửi, sau khi DTO đã bảo đảm đúng kiểu cơ bản. */
export interface LeaveRequestInput {
  hinhThuc: 'CaNgay' | 'TheoCa';
  tuNgay: string;
  denNgay: string;
  ca?: string | null;
  lyDo: string;
}

// Khoảng trắng ASCII: dấu cách, tab, xuống dòng, form feed, vertical tab. Cố ý KHÔNG dùng trim() của JS vì nó cắt cả khoảng trắng Unicode.
const ASCII_EDGE_WHITESPACE = /^[ \t\n\r\f\v]+|[ \t\n\r\f\v]+$/g;
const CONTROL_CHARACTER = /\p{Cc}/u;

/**
 * Chuẩn hoá lý do (Q25): NFC, cắt khoảng trắng ASCII hai đầu, rồi kiểm 2–500 điểm mã và không có ký tự điều khiển.
 * Trả chuỗi đã chuẩn hoá, hoặc mã lỗi của trường `lyDo`.
 */
export function normalizeReason(
  raw: unknown,
): { ok: true; value: string } | { ok: false; ma: string } {
  if (typeof raw !== 'string') {
    return { ok: false, ma: LEAVE_FIELD_ERRORS.REASON_REQUIRED };
  }
  const value = normalizeFreeText(raw, REASON_MIN_LENGTH, REASON_MAX_LENGTH);
  if (value === null) {
    // Rỗng sau khi cắt ⇒ thiếu; còn lại (quá ngắn, quá dài, ký tự điều khiển) ⇒ không hợp lệ.
    const empty =
      raw.normalize('NFC').replace(ASCII_EDGE_WHITESPACE, '') === '';
    return {
      ok: false,
      ma: empty
        ? LEAVE_FIELD_ERRORS.REASON_REQUIRED
        : LEAVE_FIELD_ERRORS.REASON_INVALID,
    };
  }
  return { ok: true, value };
}

/**
 * Chuẩn hoá chữ tự do: NFC, cắt khoảng trắng ASCII hai đầu, rồi kiểm `min`–`max` điểm mã (một emoji là 1, khớp cách người dùng đếm)
 * và không có ký tự điều khiển. Trả chuỗi đã chuẩn hoá hoặc `null` nếu sai. Dùng chung cho lý do xin nghỉ (Q25) và lý do từ chối (Q27).
 */
export function normalizeFreeText(
  raw: string,
  min: number,
  max: number,
): string | null {
  const value = raw.normalize('NFC').replace(ASCII_EDGE_WHITESPACE, '');
  // Đếm điểm mã bằng vòng for..of (duyệt theo điểm mã), không dùng spread trên chuỗi.
  let length = 0;
  for (const _ of value) length += 1;
  if (length < min || length > max || CONTROL_CHARACTER.test(value))
    return null;
  return value;
}

/** Kiểm chéo các trường (PLAN 5.7 bước 1). Rỗng = hợp lệ. Kiểm kiểu từng trường đã do DTO làm. */
export function validateLeaveShape(input: LeaveRequestInput): FieldError[] {
  const errors: FieldError[] = [];
  const hasShift = input.ca !== undefined && input.ca !== null;

  if (input.hinhThuc === 'TheoCa') {
    if (!hasShift) {
      errors.push({ truong: 'ca', ma: LEAVE_FIELD_ERRORS.SHIFT_REQUIRED });
    } else if (!(LEAVE_SHIFTS as readonly string[]).includes(input.ca ?? '')) {
      errors.push({ truong: 'ca', ma: LEAVE_FIELD_ERRORS.SHIFT_INVALID });
    }
    if (input.tuNgay !== input.denNgay) {
      errors.push({
        truong: 'denNgay',
        ma: LEAVE_FIELD_ERRORS.SINGLE_DAY_ONLY,
      });
    }
  } else {
    if (hasShift) {
      errors.push({ truong: 'ca', ma: LEAVE_FIELD_ERRORS.SHIFT_NOT_ALLOWED });
    }
    if (input.tuNgay > input.denNgay) {
      errors.push({ truong: 'denNgay', ma: LEAVE_FIELD_ERRORS.DATE_ORDER });
    }
  }

  const reason = normalizeReason(input.lyDo);
  if (!reason.ok) errors.push({ truong: 'lyDo', ma: reason.ma });
  return errors;
}

function epochDay(ngay: string): number {
  const day = parseCalendarDate(ngay);
  if (day === null) throw new Error(`Ngày không hợp lệ: ${ngay}`);
  return day;
}

/** Số ngày của khoảng, tính cả hai đầu (một ngày ⇒ 1). */
export function countDays(tuNgay: string, denNgay: string): number {
  return epochDay(denNgay) - epochDay(tuNgay) + 1;
}

/** Hạn của khoảng nghỉ (Q19, Q24). Thứ tự kiểm: quá khứ, quá dài, quá xa. Trả mã lỗi nghiệp vụ hoặc `null`. */
export function checkLeaveDates(input: {
  tuNgay: string;
  denNgay: string;
  today: string;
}): string | null {
  if (input.tuNgay < input.today) return LEAVE_ERROR_CODES.PAST_DATE;
  if (countDays(input.tuNgay, input.denNgay) > MAX_LEAVE_DAYS) {
    return LEAVE_ERROR_CODES.RANGE_TOO_LONG;
  }
  if (epochDay(input.denNgay) - epochDay(input.today) > MAX_LEAVE_DAYS_AHEAD) {
    return LEAVE_ERROR_CODES.TOO_FAR;
  }
  return null;
}

/**
 * Hai yêu cầu có chồng nhau không (Q21). Khoảng ngày phải giao nhau; nếu cả hai đều `TheoCa` thì phải CÙNG ca,
 * còn có một bên là `CaNgay` thì giao ngày là đủ (CaNgay phủ cả hai ca).
 */
export function leaveWindowsOverlap(a: LeaveWindow, b: LeaveWindow): boolean {
  if (a.ngayBatDau > b.ngayKetThuc || b.ngayBatDau > a.ngayKetThuc) {
    return false;
  }
  if (a.hinhThucNghi === 'TheoCa' && b.hinhThucNghi === 'TheoCa') {
    return a.ca === b.ca;
  }
  return true;
}

/**
 * Ca hôm nay đã kết thúc chưa (Q24): giờ hiện tại (VN) ≥ giờ kết thúc của khoảng nhận khám ghi trong `window`.
 * Chưa xác định được giờ ca (chi nhánh đã đổi lịch, ngày nghỉ...) thì coi là CHƯA kết thúc: không từ chối oan người xin nghỉ.
 */
export function isShiftEnded(window: ShiftWindowResult, now: Date): boolean {
  return window.ok && secondsOfDayVN(now) >= window.khoang.denGiay;
}
