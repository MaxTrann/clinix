import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  Matches,
  Max,
  Min,
  ValidateBy,
} from 'class-validator';
import { isCalendarDate } from '../../scheduling/calendar-date.js';
import {
  ASSIGNABLE_SHIFTS,
  MAX_DOCTORS_PER_RULE,
  SHIFT_FIELD_ERRORS,
  type AssignableShift,
} from './shift-assignment.constants.js';
import type { ShiftRuleInput } from './shift-assignment.rules.js';

// Id bigint dương dạng CHUỖI (số JSON bị từ chối: tránh mất độ chính xác). Chuỗi này được chặn 19 chữ số như `parsePublicId`.
const ID_PATTERN = /^[1-9]\d{0,18}$/;

/** Ngày lịch 'YYYY-MM-DD' có thật (loại 2026-02-30). */
const IsCalendarDate = () =>
  ValidateBy(
    {
      name: 'isCalendarDate',
      validator: { validate: (value: unknown) => isCalendarDate(value) },
    },
    { message: SHIFT_FIELD_ERRORS.DATE },
  );

/** Thân của quy tắc phân công, dùng chung cho xem trước (B2) và phân công thật (B3). */
export class ShiftRuleDto implements ShiftRuleInput {
  @IsArray({ message: SHIFT_FIELD_ERRORS.DOCTORS })
  @ArrayMinSize(1, { message: SHIFT_FIELD_ERRORS.DOCTORS })
  @ArrayMaxSize(MAX_DOCTORS_PER_RULE, { message: SHIFT_FIELD_ERRORS.DOCTORS })
  @ArrayUnique(undefined, { message: SHIFT_FIELD_ERRORS.DOCTORS })
  @Matches(ID_PATTERN, { each: true, message: SHIFT_FIELD_ERRORS.DOCTORS })
  bacSiIds!: string[];

  @IsCalendarDate()
  tuNgay!: string;

  @IsCalendarDate()
  denNgay!: string;

  @IsArray({ message: SHIFT_FIELD_ERRORS.WEEKDAY })
  @ArrayMinSize(1, { message: SHIFT_FIELD_ERRORS.WEEKDAY })
  @ArrayUnique(undefined, { message: SHIFT_FIELD_ERRORS.WEEKDAY })
  @IsInt({ each: true, message: SHIFT_FIELD_ERRORS.WEEKDAY })
  @Min(1, { each: true, message: SHIFT_FIELD_ERRORS.WEEKDAY })
  @Max(7, { each: true, message: SHIFT_FIELD_ERRORS.WEEKDAY })
  thuTrongTuan!: number[];

  // `CaToi` không bao giờ tồn tại (Q6, quy tắc 44) ⇒ không nằm trong danh sách được chọn.
  @IsArray({ message: SHIFT_FIELD_ERRORS.SHIFT })
  @ArrayMinSize(1, { message: SHIFT_FIELD_ERRORS.SHIFT })
  @ArrayUnique(undefined, { message: SHIFT_FIELD_ERRORS.SHIFT })
  @IsIn(ASSIGNABLE_SHIFTS, { each: true, message: SHIFT_FIELD_ERRORS.SHIFT })
  cas!: AssignableShift[];
}
