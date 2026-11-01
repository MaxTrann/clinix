export interface WeeklyScheduleIssue {
  thu: number | null;
  maLoi: string;
}

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isTime = (value: unknown): value is string =>
  typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(value);

function rowDay(row: unknown): number | null {
  if (!isRecord(row)) return null;
  const day = row.thuTrongTuan;
  return typeof day === 'number' && Number.isFinite(day) ? day : null;
}

interface PeriodResult {
  present: boolean;
  valid: boolean;
  start?: string;
  end?: string;
}

function validatePeriod(
  value: unknown,
  day: number | null,
  issues: WeeklyScheduleIssue[],
): PeriodResult {
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

/** Kiểm tra lịch ISO 1–7, gom mọi lỗi trước khi tạo dữ liệu. Giờ đầu vào có dạng HH:mm. */
export function validateWeeklySchedule(input: unknown): WeeklyScheduleIssue[] {
  if (!Array.isArray(input))
    return [{ thu: null, maLoi: 'DANH_SACH_KHONG_HOP_LE' }];

  const issues: WeeklyScheduleIssue[] = [];
  const rowsByDay = new Map<number, unknown[]>();

  for (const row of input) {
    if (!isRecord(row)) {
      issues.push({ thu: null, maLoi: 'THU_KHONG_HOP_LE' });
      continue;
    }
    const day = rowDay(row);
    if (day === null || !Number.isInteger(day) || day < 1 || day > 7) {
      issues.push({ thu: day, maLoi: 'THU_KHONG_HOP_LE' });
      continue;
    }
    const rows = rowsByDay.get(day) ?? [];
    rows.push(row);
    rowsByDay.set(day, rows);
    if (rows.length > 1) issues.push({ thu: day, maLoi: 'THU_BI_TRUNG' });
  }

  for (let day = 1; day <= 7; day++) {
    const rows = rowsByDay.get(day);
    if (!rows) {
      issues.push({ thu: day, maLoi: 'THU_BI_THIEU' });
      continue;
    }
    for (const row of rows) {
      if (!isRecord(row)) continue;

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
