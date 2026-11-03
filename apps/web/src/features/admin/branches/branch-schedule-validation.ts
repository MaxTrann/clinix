import type { BranchPeriodInput, BranchScheduleInput } from './branch-types';

export interface WeeklyScheduleIssue {
  thu: number | null;
  maLoi: string;
}

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isTime = (value: unknown): value is string =>
  typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(value);

function validatePeriod(
  value: unknown,
  day: number,
  issues: WeeklyScheduleIssue[],
): { present: boolean; valid: boolean; start?: string; end?: string } {
  if (value === undefined || value === null)
    return { present: false, valid: true };
  if (!isRecord(value)) {
    issues.push({ thu: day, maLoi: 'KHOANG_GIO_KHONG_HOP_LE' });
    return { present: true, valid: false };
  }

  const start = value.batDau;
  const end = value.ketThuc;
  if (start === undefined || end === undefined) {
    issues.push({ thu: day, maLoi: 'KHOANG_GIO_CHUA_DAY_DU' });
    return { present: true, valid: false };
  }
  if (!isTime(start) || !isTime(end)) {
    issues.push({ thu: day, maLoi: 'GIO_KHONG_HOP_LE' });
    return { present: true, valid: false };
  }
  if (start >= end) {
    issues.push({ thu: day, maLoi: 'KHOANG_GIO_KHONG_TANG' });
    return { present: true, valid: false };
  }
  return { present: true, valid: true, start, end };
}

/** Giữ mã lỗi theo B7 để chỉ đúng dòng lịch cần sửa trước khi gửi. */
export function validateWeeklySchedule(
  input: readonly BranchScheduleInput[],
): WeeklyScheduleIssue[] {
  const issues: WeeklyScheduleIssue[] = [];
  const rowsByDay = new Map<number, BranchScheduleInput[]>();

  for (const row of input) {
    const day = row.thuTrongTuan;
    if (!Number.isInteger(day) || day < 1 || day > 7) {
      issues.push({ thu: day, maLoi: 'THU_KHONG_HOP_LE' });
      continue;
    }
    const rows = rowsByDay.get(day) ?? [];
    rows.push(row);
    rowsByDay.set(day, rows);
    if (rows.length > 1) issues.push({ thu: day, maLoi: 'THU_BI_TRUNG' });
  }

  for (let day = 1; day <= 7; day += 1) {
    const rows = rowsByDay.get(day);
    if (!rows) {
      issues.push({ thu: day, maLoi: 'THU_BI_THIEU' });
      continue;
    }

    for (const row of rows) {
      const active = row.hoatDong;
      if (typeof active !== 'boolean')
        issues.push({ thu: day, maLoi: 'TRANG_THAI_HOAT_DONG_KHONG_HOP_LE' });

      const morning = validatePeriod(row.sang, day, issues);
      const afternoon = validatePeriod(row.chieu, day, issues);
      if (active === false && (morning.present || afternoon.present))
        issues.push({ thu: day, maLoi: 'NGAY_NGHI_CO_GIO' });
      if (active === true && !morning.present && !afternoon.present)
        issues.push({ thu: day, maLoi: 'NGAY_HOAT_DONG_THIEU_KHOANG' });
      if (
        morning.valid &&
        afternoon.valid &&
        morning.end !== undefined &&
        afternoon.start !== undefined &&
        morning.end > afternoon.start
      )
        issues.push({ thu: day, maLoi: 'KHOANG_GIO_CHONG_NHAU' });
    }
  }

  return issues;
}

export function toPeriodInput(
  enabled: boolean,
  batDau: string,
  ketThuc: string,
): BranchPeriodInput | undefined {
  return enabled ? { batDau, ketThuc } : undefined;
}

export function weeklyScheduleIssueMessage(code: string): string {
  switch (code) {
    case 'THU_KHONG_HOP_LE':
    case 'THU_BI_THIEU':
    case 'THU_BI_TRUNG':
      return 'Lịch phải có đủ một dòng duy nhất cho mỗi ngày trong tuần.';
    case 'TRANG_THAI_HOAT_DONG_KHONG_HOP_LE':
      return 'Chọn ngày hoạt động hoặc ngày nghỉ.';
    case 'NGAY_NGHI_CO_GIO':
      return 'Ngày nghỉ không thể có giờ nhận khám.';
    case 'NGAY_HOAT_DONG_THIEU_KHOANG':
      return 'Chọn ít nhất một buổi và nhập giờ nhận khám.';
    case 'KHOANG_GIO_KHONG_HOP_LE':
    case 'KHOANG_GIO_CHUA_DAY_DU':
      return 'Nhập giờ bắt đầu và kết thúc cho buổi này.';
    case 'GIO_KHONG_HOP_LE':
      return 'Giờ phải theo định dạng 24 giờ HH:mm.';
    case 'KHOANG_GIO_KHONG_TANG':
      return 'Giờ kết thúc phải sau giờ bắt đầu.';
    case 'KHOANG_GIO_CHONG_NHAU':
      return 'Buổi sáng phải kết thúc trước hoặc đúng giờ bắt đầu buổi chiều.';
    default:
      return 'Lịch hoạt động chưa hợp lệ.';
  }
}

export function scheduleIssuesFromApi(value: unknown): WeeklyScheduleIssue[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: unknown) => {
    if (!isRecord(item) || typeof item.maLoi !== 'string') return [];
    const day = item.thu;
    return [
      {
        thu: typeof day === 'number' && Number.isInteger(day) ? day : null,
        maLoi: item.maLoi,
      },
    ];
  });
}
