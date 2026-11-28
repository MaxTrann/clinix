import {
  IsOptional,
  ValidateBy,
  type ValidationArguments,
} from 'class-validator';
import { isCalendarDate } from '../../scheduling/calendar-date.js';
import { DASHBOARD_FIELD_ERROR_CODES } from '../dashboard.constants.js';
import { rangeError } from './date-range.rules.js';

// Query của `GET /admin/dashboard` (PLAN dashboard 5.5, 5.7, 5.8; T3, T6). Mọi tham số tuỳ chọn; khoá lạ là 400 `TRUONG_KHONG_DUOC_PHEP` do
// `forbidNonWhitelisted` của ValidationPipe toàn cục. Lỗi nằm ở `loi[{ truong, ma }]` với `ma` là mã của `DASHBOARD_FIELD_ERROR_CODES`
// (`validation-exception.ts` dùng nguyên `message` khi nó có dạng mã).

const BIGINT_MAX = '9223372036854775807';
const ID_PATTERN = /^[1-9]\d{0,18}$/;

/** Id BIGINT dương dạng chuỗi, không vượt BIGINT có dấu (số âm, `0`, chữ, `1e3`, số quá lớn đều sai). Giữ chuỗi: ép `Number` sẽ sai với id lớn hơn 2^53. */
export function isBigintId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    ID_PATTERN.test(value) &&
    (value.length < BIGINT_MAX.length || value <= BIGINT_MAX)
  );
}

function rule(
  name: string,
  validate: (value: unknown, args: ValidationArguments) => boolean,
  code: string,
): PropertyDecorator {
  return ValidateBy({
    name,
    validator: { validate, defaultMessage: () => code },
  });
}

/** Ngày lịch có thật (`2026-02-30`, chữ, chuỗi rỗng, mảng ⇒ `NGAY_KHONG_HOP_LE`). */
const CalendarDay = () =>
  rule(
    'isDashboardDate',
    (value) => isCalendarDate(value),
    DASHBOARD_FIELD_ERROR_CODES.INVALID_DATE,
  );

/** Hai ngày đi cùng nhau (T6): gửi một ngày thì ngày ĐÃ GỬI báo `KHOANG_NGAY_KHONG_HOP_LE`. */
const NeedsPartner = (partner: 'tuNgay' | 'denNgay') =>
  rule(
    'isDashboardPair',
    (_value, args) =>
      (args.object as Record<string, unknown>)[partner] !== undefined,
    DASHBOARD_FIELD_ERROR_CODES.INVALID_RANGE,
  );

/**
 * Đặt ở `denNgay`: không trước `tuNgay` (`KHOANG_NGAY_KHONG_HOP_LE`) và không quá 366 ngày (`KHOANG_NGAY_QUA_DAI`). Chỉ xét khi CẢ HAI là ngày có thật:
 * một ngày sai dạng thì lỗi `NGAY_KHONG_HOP_LE` của chính nó đã đủ. Hai mã khác nhau nên mỗi mã một ràng buộc.
 */
const RangeRule = (code: NonNullable<ReturnType<typeof rangeError>>) =>
  rule(
    code === DASHBOARD_FIELD_ERROR_CODES.INVALID_RANGE
      ? 'isDashboardOrder'
      : 'isDashboardLength',
    (value, args) => {
      const from = (args.object as Record<string, unknown>).tuNgay;
      if (!isCalendarDate(value) || !isCalendarDate(from)) return true;
      return rangeError(from, value) !== code;
    },
    code,
  );

/** Id chi nhánh đúng dạng BIGINT (chữ, số âm, `0`, quá BIGINT ⇒ `CHI_NHANH_KHONG_HOP_LE`). */
const BranchId = () =>
  rule(
    'isDashboardBranch',
    (value) => isBigintId(value),
    DASHBOARD_FIELD_ERROR_CODES.INVALID_BRANCH,
  );

export class DashboardFilterDto {
  @IsOptional()
  @CalendarDay()
  @NeedsPartner('denNgay')
  tuNgay?: string;

  @IsOptional()
  @CalendarDay()
  @NeedsPartner('tuNgay')
  @RangeRule(DASHBOARD_FIELD_ERROR_CODES.INVALID_RANGE)
  @RangeRule(DASHBOARD_FIELD_ERROR_CODES.RANGE_TOO_LONG)
  denNgay?: string;

  /** Chỉ là BỘ LỌC, không phải quyền: phạm vi do máy chủ giải (guard), chi nhánh ngoài phạm vi là 404 ở service (T3). */
  @IsOptional()
  @BranchId()
  chiNhanhId?: string;
}
