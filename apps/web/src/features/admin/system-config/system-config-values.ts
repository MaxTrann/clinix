import { PARAMS, REMINDER_LIMITS } from './system-config-params';
import {
  CONFIG_KEYS,
  type ConfigKey,
  type ConfigValue,
  type SystemConfig,
} from './system-config-types';

// Hàm THUẦN của màn Cài đặt hệ thống: đọc chữ người dùng gõ, so sánh với giá trị đã lưu, định dạng để hiển thị.
// Trọng số luôn tính bằng PHẦN TRĂM NGUYÊN (0 đến 100), không cộng số thực, giống `toHundredths` ở API (0,1 + 0,2 lệch ở số thực).

// Bản nháp trong ô nhập: mọi ô là chuỗi, riêng nhắc lịch là danh sách chuỗi (mỗi mốc một ô).
export type Draft = {
  [K in ConfigKey]: K extends 'thoiDiemNhacLich' ? string[] : string;
};

const ASCII_EDGE = /^[ \t\n\r\f\v]+|[ \t\n\r\f\v]+$/g;
export const trimAscii = (value: string): string =>
  value.replace(ASCII_EDGE, '');

/** Số nguyên không dấu, tối đa 6 chữ số (miền lớn nhất là 1440); `015` đọc được là 15, `1e2`, `1.5`, `-1` thì không. */
export function parseWholeNumber(text: string): number | null {
  const trimmed = trimAscii(text);
  return /^[0-9]{1,6}$/.test(trimmed) ? Number(trimmed) : null;
}

/** Trọng số `0`, `0,6`, `0.60`, `1` ra phần trăm nguyên; tối đa 2 chữ số thập phân (`0,605` bị loại) và không quá 1. */
export function parseWeightHundredths(text: string): number | null {
  const match = /^([0-9]{1,3})(?:[.,]([0-9]{1,2}))?$/.exec(trimAscii(text));
  if (match === null) return null;
  const fraction = (match[2] ?? '').padEnd(2, '0');
  const hundredths = Number(match[1]) * 100 + Number(fraction);
  return hundredths <= 100 ? hundredths : null;
}

export const toHundredths = (weight: number): number =>
  Math.round(weight * 100);

// n/100 cho ra đúng số thực mà `Number('0.07')` ra (một phép chia hai số nguyên được làm tròn đúng), nên API đọc lại không lệch.
export const weightOfHundredths = (hundredths: number): number =>
  hundredths / 100;

export const formatWeight = (weight: number): string =>
  (Math.round(weight * 100) / 100).toFixed(2).replace('.', ',');

/** Giảm dần (72, 24, 2) như API: đổi thứ tự các mốc không tính là thay đổi. Không sửa mảng gốc. */
export const normalizeReminders = (hours: readonly number[]): number[] =>
  [...hours].sort((a, b) => b - a);

export function sameConfigValue(a: ConfigValue, b: ConfigValue): boolean {
  if (typeof a === 'number' || typeof b === 'number') return a === b;
  return a.length === b.length && a.every((hours, index) => hours === b[index]);
}

export type DraftCheck =
  { ok: true; value: ConfigValue } | { ok: false; blank: boolean };

function checkReminders(items: readonly string[]): DraftCheck {
  if (items.length === 0) return { ok: false, blank: true };
  if (items.length > REMINDER_LIMITS.maxItems)
    return { ok: false, blank: false };
  const hours: number[] = [];
  for (const item of items) {
    const value = parseWholeNumber(item);
    if (
      value === null ||
      value < REMINDER_LIMITS.minHours ||
      value > REMINDER_LIMITS.maxHours
    ) {
      return { ok: false, blank: false };
    }
    hours.push(value);
  }
  if (new Set(hours).size !== hours.length) return { ok: false, blank: false };
  return { ok: true, value: normalizeReminders(hours) };
}

/** Đọc MỘT ô: hợp lệ thì trả giá trị; không thì cho biết ô có trống không (trống và sai có câu báo khác nhau). */
export function checkDraftValue(key: ConfigKey, draft: Draft): DraftCheck {
  const rule = PARAMS[key].rule;
  if (rule.kind === 'reminders') return checkReminders(draft.thoiDiemNhacLich);
  const text = draft[key as Exclude<ConfigKey, 'thoiDiemNhacLich'>];
  if (trimAscii(text) === '') return { ok: false, blank: true };
  if (rule.kind === 'weight') {
    const hundredths = parseWeightHundredths(text);
    return hundredths === null
      ? { ok: false, blank: false }
      : { ok: true, value: weightOfHundredths(hundredths) };
  }
  const value = parseWholeNumber(text);
  return value === null || value < rule.min || value > rule.max
    ? { ok: false, blank: false }
    : { ok: true, value };
}

/** Bản nháp ban đầu từ cấu hình đã tải/đã lưu; giá trị null (chưa cấu hình) là ô trống, không có giá trị ngầm. */
export function draftFromConfig(config: SystemConfig): Draft {
  const text = (key: Exclude<ConfigKey, 'thoiDiemNhacLich'>): string => {
    const value = config[key];
    if (value === null || Array.isArray(value)) return '';
    return PARAMS[key].rule.kind === 'weight'
      ? formatWeight(value)
      : String(value);
  };
  const reminders = config.thoiDiemNhacLich;
  return {
    thoiGianGiuCho: text('thoiGianGiuCho'),
    thoiDiemNhacLich: Array.isArray(reminders)
      ? normalizeReminders(reminders).map(String)
      : [],
    soLichHenToiDaMoiHoSo: text('soLichHenToiDaMoiHoSo'),
    soLanTuDoiLichToiDa: text('soLanTuDoiLichToiDa'),
    checkInTruocPhut: text('checkInTruocPhut'),
    checkInSauPhut: text('checkInSauPhut'),
    thoiHanPhanHoiLoiMoi: text('thoiHanPhanHoiLoiMoi'),
    soMucChoToiDa: text('soMucChoToiDa'),
    nguongNoShow: text('nguongNoShow'),
    soNgayBaoTruocDoiGioLam: text('soNgayBaoTruocDoiGioLam'),
    trongSoW1: text('trongSoW1'),
    trongSoW2: text('trongSoW2'),
  };
}

function sameDraftText(a: string | string[], b: string | string[]): boolean {
  if (typeof a === 'string' || typeof b === 'string') return a === b;
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

/**
 * Ô này có khác giá trị đã lưu không. Chỉ ô ĐÃ ĐỔI mới bị kiểm miền và mới được gửi: dòng cũ có giá trị ngoài miền (seed hay INSERT tay,
 * ví dụ giữ chỗ 120) vẫn tải được, nhưng gửi lại đúng giá trị đó thì API trả 400 (TRACKING 9A.1 mục 8, CHB5-12).
 */
export function isKeyChanged(
  key: ConfigKey,
  config: SystemConfig,
  draft: Draft,
): boolean {
  // Giữ nguyên từng ký tự như lúc tải thì chắc chắn chưa đổi, kể cả khi giá trị đó nằm ngoài miền
  if (sameDraftText(draftFromConfig(config)[key], draft[key])) return false;
  const base = config[key];
  const check = checkDraftValue(key, draft);
  if (check.ok) return base === null || !sameConfigValue(check.value, base);
  // Ô trống: lần đầu là "chưa nhập"; khi đã có cấu hình là xoá mất giá trị (sẽ báo lỗi)
  if (check.blank) return base !== null;
  return true;
}

export const changedKeys = (config: SystemConfig, draft: Draft): ConfigKey[] =>
  CONFIG_KEYS.filter((key) => isKeyChanged(key, config, draft));

export const NO_VALUE_TEXT = 'Chưa có';

/** Giá trị kèm đơn vị cho bảng "trước → sau" và lịch sử (câu hỏi e của kế hoạch): `15 phút`, `72, 24, 2 giờ`, `0,60`, null là "Chưa có". */
export function formatConfigValue(
  key: ConfigKey,
  value: ConfigValue | null,
): string {
  if (value === null) return NO_VALUE_TEXT;
  const { rule, unit } = PARAMS[key];
  if (Array.isArray(value)) return `${value.join(', ')} ${unit}`.trim();
  if (rule.kind === 'weight') return formatWeight(value);
  return `${value} ${unit}`.trim();
}

/** Giá trị của khoá chưa biết (API thêm tham số mới): in thô, không đơn vị. */
export function formatLooseValue(value: ConfigValue | null): string {
  if (value === null) return NO_VALUE_TEXT;
  return Array.isArray(value) ? value.join(', ') : String(value);
}
