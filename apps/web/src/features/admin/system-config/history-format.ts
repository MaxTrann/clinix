import { isConfigKey, PARAMS } from './system-config-params';
import type { ConfigChange, ConfigValue } from './system-config-types';
import { formatConfigValue, formatLooseValue } from './system-config-values';

// Định dạng chữ cho tab "Lịch sử thay đổi" (admin F5, câu hỏi e của kế hoạch). Mọi chữ tự do (`lyDo`, `nguoiThucHien`) KHÔNG đi qua đây:
// chúng chỉ được in ra như văn bản thường ở `history-tab.tsx`.

const VN_TIME = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  // h23: nửa đêm là 00, không phải 24
  hourCycle: 'h23',
});

/** ISO UTC sang `dd/MM/yyyy HH:mm:ss` theo giờ Việt Nam; chuỗi không đọc được thì "—". */
export function formatThoiDiem(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const parts = VN_TIME.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('day')}/${part('month')}/${part('year')} ${part('hour')}:${part('minute')}:${part('second')}`;
}

/** Khoá chưa biết (API thêm tham số mới) thì in khoá thô, không làm vỡ trang. */
export function labelOfKey(khoa: string): string {
  return isConfigKey(khoa) ? PARAMS[khoa].label : khoa;
}

export function formatChangeValue(
  khoa: string,
  value: ConfigValue | null,
): string {
  return isConfigKey(khoa)
    ? formatConfigValue(khoa, value)
    : formatLooseValue(value);
}

/** Cột "Thay đổi" của bảng: tạo lần đầu, hoặc số tham số kèm tối đa hai nhãn. */
export function summarizeChanges(changes: readonly ConfigChange[]): string {
  if (changes.length === 0) return '—';
  if (changes.every((change) => change.truoc === null))
    return `Tạo cấu hình lần đầu (${changes.length} tham số)`;
  const shown = changes.slice(0, 2).map((change) => labelOfKey(change.khoa));
  const more = changes.length > 2 ? `, +${changes.length - 2}` : '';
  return `${changes.length} tham số: ${shown.join(', ')}${more}`;
}
