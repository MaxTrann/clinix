import type { AccountStatus } from './account-types';

// Định dạng chữ cho màn tài khoản (admin F9). Mọi chữ tự do của người dùng (họ tên, email, địa chỉ) KHÔNG đi qua đây: chúng chỉ được in như văn bản thường.
// Mỗi module tự giữ bản định dạng giờ của mình (F5 `history-format`, doctor `leave-format`, patient `profile-format`), nên file này cũng vậy.

export const MISSING_LABEL = 'Chưa có';
export const INVALID_LABEL = '—';

const STATUS_LABELS: Record<AccountStatus, string> = {
  ChoKichHoat: 'Chờ kích hoạt',
  DangHoatDong: 'Đang hoạt động',
  NgungHoatDong: 'Ngừng hoạt động',
};

/** Trạng thái tài khoản; giá trị lạ (API thêm trạng thái mới) thì in dấu gạch, không in nguyên giá trị thô. */
export function formatStatus(value: string): string {
  return Object.hasOwn(STATUS_LABELS, value)
    ? STATUS_LABELS[value as AccountStatus]
    : INVALID_LABEL;
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `YYYY-MM-DD` sang `dd/MM/yyyy`; `null` là "Chưa có", ngày không có thật (30/02) hay chuỗi rác là dấu gạch. */
export function formatBirthDate(value: string | null | undefined): string {
  if (value === null || value === undefined) return MISSING_LABEL;
  const match = DATE_ONLY.exec(value);
  if (match === null) return INVALID_LABEL;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  const real =
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() === Number(month) - 1 &&
    date.getUTCDate() === Number(day);
  return real ? `${day}/${month}/${year}` : INVALID_LABEL;
}

const VN_TIME = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  // h23: nửa đêm là 00, không phải 24
  hourCycle: 'h23',
});

/** ISO UTC sang `dd/MM/yyyy HH:mm` theo giờ Việt Nam; thiếu là "Chưa có", không đọc được là dấu gạch. */
export function formatCreatedAt(value: string | null | undefined): string {
  if (value === null || value === undefined) return MISSING_LABEL;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return INVALID_LABEL;
  const parts = VN_TIME.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('day')}/${part('month')}/${part('year')} ${part('hour')}:${part('minute')}`;
}

/** Giới tính là chữ tự do (`varchar(10)` của schema, không có enum): in nguyên giá trị, trống thì "Chưa có". */
export function formatGender(value: string | null | undefined): string {
  return value === null || value === undefined || value.trim() === ''
    ? MISSING_LABEL
    : value;
}

/** Cờ khoá đặt lịch do no-show: `null` (chưa xác minh, chưa có hồ sơ bệnh nhân) khác `false`. */
export function formatNoShowLock(value: boolean | null | undefined): string {
  if (value === true) return 'Đang bị khoá';
  if (value === false) return 'Không bị khoá';
  return MISSING_LABEL;
}

export function formatNoShowCount(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? String(value)
    : MISSING_LABEL;
}

export function formatEmailVerified(value: boolean | undefined): string {
  if (value === true) return 'Đã xác minh';
  if (value === false) return 'Chưa xác minh';
  return MISSING_LABEL;
}

/** Địa chỉ trống hoặc thiếu là "Chưa có"; còn lại in nguyên văn. */
export function formatText(value: string | null | undefined): string {
  return value === null || value === undefined || value.trim() === ''
    ? MISSING_LABEL
    : value;
}
