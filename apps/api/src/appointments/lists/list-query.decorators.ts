import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsOptional,
  ValidateBy,
  type ValidationArguments,
} from 'class-validator';
import { isCalendarDate } from '../../scheduling/calendar-date.js';
import {
  isValidKeyword,
  normalizeKeyword,
} from '../../patient/validation/keyword-policy.js';
import { BOOKING_FIELD_ERROR_CODES } from '../appointments.constants.js';
import {
  isBigintId,
  isNotBefore,
  isVisitProfileFilter,
  toStringArray,
} from './list-query.rules.js';

// Decorator của query các danh sách lịch hẹn (task B1; B3, B4, B5 dùng lại, không viết lại: tránh jscpd; TRACKING 3.13 B1-B). Mọi tham số đều TUỲ CHỌN.
// Mã lỗi ở `loi[].ma`: ràng buộc nào có `message` là mã (như `q`) thì dùng nguyên, còn lại là tên ràng buộc viết SNAKE_CASE hoa (`isBigintId` ⇒ `IS_BIGINT_ID`),
// đúng cách `validation-exception.ts` đặt mã cho mọi DTO của dự án. Không thêm mã vào PLAN 5.14 (3.13.3 câu (i)).

// Ràng buộc có tên: `name` là khoá trong `ValidationError.constraints`, cũng là phần gốc của mã lỗi.
function constraint(
  name: string,
  validate: (value: unknown, args: ValidationArguments) => boolean,
  message: string = name,
): PropertyDecorator {
  return ValidateBy({
    name,
    validator: { validate, defaultMessage: () => message },
  });
}

/** Tham số mảng trạng thái (`trangThai`, lặp khoá hoặc dấu phẩy): chuẩn hoá thành mảng, mỗi phần tử phải thuộc `allowed`. */
export const StateListParam = (allowed: readonly string[]) =>
  applyDecorators(
    IsOptional(),
    Transform(({ value }: { value: unknown }) => toStringArray(value)),
    IsArray(),
    IsIn(allowed, { each: true }),
  );

/** Bộ lọc theo id BIGINT dạng chuỗi (`bacSiId`, `chuyenKhoaId`). */
export const IdFilterParam = () =>
  applyDecorators(
    IsOptional(),
    constraint('isBigintId', (value) => isBigintId(value)),
  );

/** Bộ lọc hồ sơ đi khám: `BanThan` hoặc id hồ sơ người thân. */
export const VisitProfileFilterParam = () =>
  applyDecorators(
    IsOptional(),
    constraint('isVisitProfileFilter', (value) => isVisitProfileFilter(value)),
  );

/** Ngày lịch `YYYY-MM-DD` CÓ THẬT (`2026-13-45` qua được `@Matches` nhưng không qua đây, X1 M8). */
export const CalendarDayParam = () =>
  applyDecorators(
    IsOptional(),
    constraint('isCalendarDate', (value) => isCalendarDate(value)),
  );

/**
 * Đặt cạnh `CalendarDayParam` ở `denNgay`: không trước ngày ở thuộc tính `fromProperty` (`tuNgay`). Chỉ báo khi CẢ HAI đều là ngày có thật; một
 * trong hai sai dạng thì lỗi `IS_CALENDAR_DATE` của chính nó đã đủ.
 */
export const NotBeforeParam = (fromProperty: string) =>
  applyDecorators(
    IsOptional(),
    constraint('isNotBeforeFrom', (value, args) => {
      const from = (args.object as Record<string, unknown>)[fromProperty];
      return (
        !isCalendarDate(value) ||
        !isCalendarDate(from) ||
        isNotBefore(from, value)
      );
    }),
  );

/**
 * Từ khoá `q` (Q35): luật của patient B6 (NFC + cắt khoảng trắng ASCII, 2 đến 100 điểm mã, không ký tự điều khiển). MỘT lỗi
 * `{ truong: 'q', ma: 'TU_KHOA_KHONG_HOP_LE' }` cho mọi trường hợp sai, kể cả `q=` rỗng và mảng (`q=a&q=b`).
 */
export const KeywordParam = () =>
  applyDecorators(
    IsOptional(),
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' ? normalizeKeyword(value) : value,
    ),
    constraint(
      'isAppointmentKeyword',
      (value) => typeof value === 'string' && isValidKeyword(value),
      BOOKING_FIELD_ERROR_CODES.INVALID_KEYWORD,
    ),
  );
