import { DISPLAY_ORDER, PARAMS, REMINDER_LIMITS } from './system-config-params';
import {
  CONFIG_KEYS,
  type ConfigKey,
  type ConfigPatch,
  type SystemConfig,
  type UpdateSystemConfigBody,
} from './system-config-types';
import {
  changedKeys,
  checkDraftValue,
  formatConfigValue,
  toHundredths,
  type Draft,
} from './system-config-values';

// Kiểm bản nháp trước khi gửi (CH A1, CH b4). Chữ báo lỗi chọn theo loại ô; mọi câu là `[đề xuất]` trừ khi ghi khác (PLAN 5.9 chỉ ghi
// "(theo từng thông số)" và hai câu "Vui lòng nhập lý do thay đổi." và "Không có thay đổi nào để lưu.").

export const REQUIRED_MESSAGE = 'Vui lòng nhập giá trị.';
export const WEIGHT_SUM_MESSAGE = 'Tổng hai trọng số phải bằng 1,00.';
export const REASON_REQUIRED_MESSAGE = 'Vui lòng nhập lý do thay đổi.';
export const REASON_TOO_LONG_MESSAGE = 'Lý do thay đổi không quá 500 ký tự.';
export const NO_CHANGE_MESSAGE = 'Không có thay đổi nào để lưu.';
// Lý do thay đổi (Q38): 1 đến 500 ký tự sau trim, đếm theo đơn vị UTF-16 (`String.length`) như DTO của API
export const REASON_MAX_LENGTH = 500;

export type FieldErrors = Partial<Record<ConfigKey, string>>;

/** Câu "giá trị không hợp lệ" của một tham số, nói đúng miền của nó. */
export function invalidValueMessage(key: ConfigKey): string {
  const { rule } = PARAMS[key];
  if (rule.kind === 'int')
    return `Nhập số nguyên từ ${rule.min} đến ${rule.max}.`;
  if (rule.kind === 'weight')
    return 'Nhập số từ 0 đến 1, tối đa 2 chữ số thập phân.';
  return `Nhập từ 1 đến ${REMINDER_LIMITS.maxItems} mốc, mỗi mốc là số giờ nguyên từ ${REMINDER_LIMITS.minHours} đến ${REMINDER_LIMITS.maxHours}, không trùng nhau.`;
}

export interface DraftResult {
  errors: FieldErrors;
  // Chỉ các tham số ĐÃ ĐỔI và hợp lệ
  patch: ConfigPatch;
  changed: ConfigKey[];
}

export function validateDraft(config: SystemConfig, draft: Draft): DraftResult {
  const errors: FieldErrors = {};
  const patch: ConfigPatch = {};
  const changed = changedKeys(config, draft);
  for (const key of CONFIG_KEYS) {
    const check = checkDraftValue(key, draft);
    // Lần đầu (Q35): bảy ô không có DEFAULT ở DB là bắt buộc; năm ô còn lại để trống thì không gửi
    if (
      config.chuaCauHinh &&
      PARAMS[key].requiredOnCreate &&
      !check.ok &&
      check.blank
    ) {
      errors[key] = REQUIRED_MESSAGE;
      continue;
    }
    if (!changed.includes(key)) continue;
    if (check.ok) {
      patch[key] = check.value;
    } else {
      errors[key] =
        check.blank && PARAMS[key].rule.kind !== 'reminders'
          ? REQUIRED_MESSAGE
          : invalidValueMessage(key);
    }
  }

  // w1 + w2 = 1,00 tính trên giá trị HIỆU LỰC (ô đã đổi, còn lại lấy từ cấu hình đã lưu), bằng phần trăm nguyên
  const weightChanged =
    changed.includes('trongSoW1') || changed.includes('trongSoW2');
  if (
    weightChanged &&
    errors.trongSoW1 === undefined &&
    errors.trongSoW2 === undefined
  ) {
    const hundredthsOf = (key: 'trongSoW1' | 'trongSoW2'): number | null => {
      const value = patch[key] ?? config[key];
      return typeof value === 'number' ? toHundredths(value) : null;
    };
    const first = hundredthsOf('trongSoW1');
    const second = hundredthsOf('trongSoW2');
    if (first !== null && second !== null && first + second !== 100) {
      errors.trongSoW1 = WEIGHT_SUM_MESSAGE;
      errors.trongSoW2 = WEIGHT_SUM_MESSAGE;
    }
  }
  return { errors, patch, changed };
}

/** Ô có lỗi đứng đầu theo thứ tự trên màn hình (để chuyển tab và focus). */
export function firstInvalidKey(errors: FieldErrors): ConfigKey | null {
  return DISPLAY_ORDER.find((key) => errors[key] !== undefined) ?? null;
}

/** Lý do: bắt buộc, 1 đến 500 ký tự sau `trim()`. Trả câu lỗi hoặc null. */
export function reasonError(reason: string): string | null {
  const trimmed = reason.trim();
  if (trimmed.length === 0) return REASON_REQUIRED_MESSAGE;
  return trimmed.length > REASON_MAX_LENGTH ? REASON_TOO_LONG_MESSAGE : null;
}

/** Thân `PUT`: lý do đã cắt khoảng trắng + CHỈ các khoá đã đổi (số JSON, nhắc lịch là mảng số). */
export function buildUpdateBody(
  patch: ConfigPatch,
  reason: string,
): UpdateSystemConfigBody {
  return { lyDo: reason.trim(), ...patch };
}

export interface ChangeLine {
  key: ConfigKey;
  label: string;
  before: string;
  after: string;
}

/** Danh sách "nhãn: trước → sau" cho hộp xác nhận, theo thứ tự trên màn hình. */
export function describeChanges(
  config: SystemConfig,
  patch: ConfigPatch,
): ChangeLine[] {
  const lines: ChangeLine[] = [];
  for (const key of DISPLAY_ORDER) {
    const next = patch[key];
    if (next === undefined) continue;
    lines.push({
      key,
      label: PARAMS[key].label,
      before: formatConfigValue(key, config[key]),
      after: formatConfigValue(key, next),
    });
  }
  return lines;
}
