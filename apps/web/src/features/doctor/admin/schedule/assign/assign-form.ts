import {
  MAX_DOCTORS_PER_RULE,
  MAX_RULE_RANGE_DAYS,
  type ShiftRule,
} from '../../../api/shift-assignment-api';
import type { ShiftCode } from '../../../../../shared/schedule/shift-labels';
import { addDays, isoWeekday } from '../../../../../shared/schedule/week';

// Dữ liệu và kiểm tra của hộp "Phân công ca làm việc" (doctor F7; WA-02, WA-05). Server là nơi quyết định cuối (A1–A4): ở đây chỉ chặn sớm các
// lỗi hiển nhiên để nút "Phân công" chỉ bật khi đủ điều kiện, và để không gọi "Xem trước" với dữ liệu thiếu.
// "Cả ngày" của Figma = hai ca (`cas` = Sáng + Chiều); không có "Ghi chú" (Q10).
export type CaChoice = 'CaSang' | 'CaChieu' | 'CaNgay';

export interface AssignFormValues {
  tuNgay: string;
  denNgay: string;
  thuTrongTuan: number[];
  ca: CaChoice;
  bacSiIds: string[];
}

export const CA_CHOICE_LABELS: Record<CaChoice, string> = {
  CaSang: 'Sáng',
  CaChieu: 'Chiều',
  CaNgay: 'Cả ngày',
};

// Nhãn nút thứ của Figma `516:2`: T2 … T7, CN (khoá ISO 1…7)
export const WEEKDAY_OPTIONS = [
  { value: 1, label: 'T2' },
  { value: 2, label: 'T3' },
  { value: 3, label: 'T4' },
  { value: 4, label: 'T5' },
  { value: 5, label: 'T6' },
  { value: 6, label: 'T7' },
  { value: 7, label: 'CN' },
] as const;

export const EMPTY_ASSIGN_FORM: AssignFormValues = {
  tuNgay: '',
  denNgay: '',
  thuTrongTuan: [],
  ca: 'CaSang',
  bacSiIds: [],
};

export const ASSIGN_MESSAGES = {
  datePast: 'Không thể phân công vào ngày đã qua.',
  dateOrder: 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.',
  dateRange: `Khoảng ngày tối đa ${MAX_RULE_RANGE_DAYS} ngày.`,
  tooManyDoctors: `Tối đa ${MAX_DOCTORS_PER_RULE} bác sĩ mỗi lần.`,
} as const;

/** Điền sẵn từ ô "+" (WA-05): một bác sĩ, đúng ngày đó, đúng thứ của ngày đó, đúng ca của ô. */
export function prefillFromCell(input: {
  bacSiId: string;
  ngay: string;
  ca: ShiftCode;
}): AssignFormValues {
  return {
    tuNgay: input.ngay,
    denNgay: input.ngay,
    thuTrongTuan: [isoWeekday(input.ngay)],
    ca: input.ca,
    bacSiIds: [input.bacSiId],
  };
}

export function casOf(choice: CaChoice): ShiftCode[] {
  return choice === 'CaNgay' ? ['CaSang', 'CaChieu'] : [choice];
}

const daysBetween = (from: string, to: string) => {
  let days = 0;
  for (let day = from; day < to; day = addDays(day, 1)) days += 1;
  return days;
};

export interface AssignFieldErrors {
  tuNgay?: string;
  denNgay?: string;
}

/** Lỗi theo ngày; rỗng = hợp lệ. `today` là hôm nay theo giờ VN. Ô còn trống chưa báo lỗi (chỉ làm nút vô hiệu). */
export function dateErrors(
  values: Pick<AssignFormValues, 'tuNgay' | 'denNgay'>,
  today: string,
): AssignFieldErrors {
  const errors: AssignFieldErrors = {};
  if (values.tuNgay !== '' && values.tuNgay < today)
    errors.tuNgay = ASSIGN_MESSAGES.datePast;
  if (values.tuNgay !== '' && values.denNgay !== '') {
    if (values.denNgay < values.tuNgay)
      errors.denNgay = ASSIGN_MESSAGES.dateOrder;
    // 92 ngày tính cả hai đầu: chênh lệch tối đa 91
    else if (daysBetween(values.tuNgay, values.denNgay) >= MAX_RULE_RANGE_DAYS)
      errors.denNgay = ASSIGN_MESSAGES.dateRange;
  }
  return errors;
}

/** Đủ điều kiện để "Xem trước" và "Phân công" (WA-02): đủ ngày hợp lệ, ≥ 1 thứ, có ca, 1–20 bác sĩ. */
export function isRuleComplete(
  values: AssignFormValues,
  today: string,
): boolean {
  const errors = dateErrors(values, today);
  return (
    values.tuNgay !== '' &&
    values.denNgay !== '' &&
    !errors.tuNgay &&
    !errors.denNgay &&
    values.thuTrongTuan.length > 0 &&
    values.bacSiIds.length >= 1 &&
    values.bacSiIds.length <= MAX_DOCTORS_PER_RULE
  );
}

export function toShiftRule(values: AssignFormValues): ShiftRule {
  return {
    bacSiIds: values.bacSiIds,
    tuNgay: values.tuNgay,
    denNgay: values.denNgay,
    thuTrongTuan: [...values.thuTrongTuan].sort((a, b) => a - b),
    cas: casOf(values.ca),
  };
}
