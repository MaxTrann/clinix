// Bảng miền giá trị CHUẨN của cấu hình hệ thống và các hàm thuần quanh nó (PLAN admin 5.7, Q34; admin B5 TRACKING 9A.1 mục 2.3).
// DB chỉ có CHECK cận dưới (`chk_cau_hinh_gia_tri`, `chk_cau_hinh_nhac_lich`); cận trên là giới hạn của service. DTO và service cùng dùng bảng này.
// Khoá = tên cột viết camelCase (cũng là tên thuộc tính entity `CauHinhHeThong`); `column` là tên cột DB và là khoá trong nhật ký `CapNhatCauHinh`.
export const CONFIG_KEYS = [
  'thoiGianGiuCho',
  'thoiDiemNhacLich',
  'soLichHenToiDaMoiHoSo',
  'soLanTuDoiLichToiDa',
  'checkInTruocPhut',
  'checkInSauPhut',
  'thoiHanPhanHoiLoiMoi',
  'soMucChoToiDa',
  'nguongNoShow',
  'soNgayBaoTruocDoiGioLam',
  'trongSoW1',
  'trongSoW2',
] as const;

export type ConfigKey = (typeof CONFIG_KEYS)[number];
export type ConfigValue = number | number[];
export type ConfigValues = Record<ConfigKey, ConfigValue>;
// Phần cấu hình muốn đổi hoặc muốn ghi: vắng khoá = không đụng tới tham số đó.
export type ConfigPatch = Partial<ConfigValues>;

type ParamRule =
  | { kind: 'int'; min: number; max: number }
  | { kind: 'reminders' }
  | { kind: 'weight' };

export interface ConfigParam {
  column: string;
  rule: ParamRule;
  // Cột NOT NULL không có DEFAULT ở DB (bảy cột `[cần điền]`): tạo dòng lần đầu (Q35) bắt buộc phải gửi.
  requiredOnCreate: boolean;
}

// Nhắc lịch (Q34): 1 đến 5 mốc, mỗi mốc là số giờ nguyên 1 đến 720, không trùng.
export const REMINDER_LIMITS = { maxItems: 5, minHours: 1, maxHours: 720 };

export const CONFIG_PARAMS: Record<ConfigKey, ConfigParam> = {
  thoiGianGiuCho: {
    column: 'thoi_gian_giu_cho',
    rule: { kind: 'int', min: 1, max: 60 },
    requiredOnCreate: false,
  },
  thoiDiemNhacLich: {
    column: 'thoi_diem_nhac_lich',
    rule: { kind: 'reminders' },
    requiredOnCreate: false,
  },
  soLichHenToiDaMoiHoSo: {
    column: 'so_lich_hen_toi_da_moi_ho_so',
    rule: { kind: 'int', min: 1, max: 20 },
    requiredOnCreate: true,
  },
  soLanTuDoiLichToiDa: {
    column: 'so_lan_tu_doi_lich_toi_da',
    rule: { kind: 'int', min: 0, max: 10 },
    requiredOnCreate: true,
  },
  checkInTruocPhut: {
    column: 'check_in_truoc_phut',
    rule: { kind: 'int', min: 0, max: 240 },
    requiredOnCreate: true,
  },
  checkInSauPhut: {
    column: 'check_in_sau_phut',
    rule: { kind: 'int', min: 0, max: 240 },
    requiredOnCreate: true,
  },
  thoiHanPhanHoiLoiMoi: {
    column: 'thoi_han_phan_hoi_loi_moi',
    rule: { kind: 'int', min: 1, max: 1440 },
    requiredOnCreate: false,
  },
  soMucChoToiDa: {
    column: 'so_muc_cho_toi_da',
    rule: { kind: 'int', min: 0, max: 10 },
    requiredOnCreate: false,
  },
  nguongNoShow: {
    column: 'nguong_no_show',
    rule: { kind: 'int', min: 1, max: 10 },
    requiredOnCreate: false,
  },
  // DB cho `>= 0`, service ép `>= 1` để "báo trước" còn nghĩa (Q34).
  soNgayBaoTruocDoiGioLam: {
    column: 'so_ngay_bao_truoc_doi_gio_lam',
    rule: { kind: 'int', min: 1, max: 60 },
    requiredOnCreate: true,
  },
  trongSoW1: {
    column: 'trong_so_w1',
    rule: { kind: 'weight' },
    requiredOnCreate: true,
  },
  trongSoW2: {
    column: 'trong_so_w2',
    rule: { kind: 'weight' },
    requiredOnCreate: true,
  },
};

function isWholeNumberBetween(
  value: unknown,
  min: number,
  max: number,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}

function isReminderList(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length >= 1 &&
    value.length <= REMINDER_LIMITS.maxItems &&
    value.every((hours: unknown) =>
      isWholeNumberBetween(
        hours,
        REMINDER_LIMITS.minHours,
        REMINDER_LIMITS.maxHours,
      ),
    ) &&
    new Set(value).size === value.length
  );
}

// 0 đến 1 và ĐÚNG tối đa hai chữ số thập phân: viết lại bằng `toFixed(2)` rồi đọc lại phải ra chính số đó (0.605, 1.005 và 0.30000000000000004 bị loại).
function isWeight(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1 &&
    Number(value.toFixed(2)) === value
  );
}

/** Giá trị có hợp lệ với miền của tham số không (kiểu, cận, mảng nhắc lịch, số chữ số thập phân của trọng số). */
export function isValidConfigValue(key: ConfigKey, value: unknown): boolean {
  const rule = CONFIG_PARAMS[key].rule;
  switch (rule.kind) {
    case 'int':
      return isWholeNumberBetween(value, rule.min, rule.max);
    case 'reminders':
      return isReminderList(value);
    case 'weight':
      return isWeight(value);
  }
}

/** Phần trăm nguyên của một trọng số hợp lệ: so sánh và cộng bằng số nguyên, không cộng số thực. */
export function toHundredths(weight: number): number {
  return Math.round(weight * 100);
}

export function weightsSumToOne(w1: number, w2: number): boolean {
  return toHundredths(w1) + toHundredths(w2) === 100;
}

/** Cặp trọng số trong `values`, hoặc null nếu thiếu một trong hai. */
export function weightsOf(values: ConfigPatch): [number, number] | null {
  const { trongSoW1: w1, trongSoW2: w2 } = values;
  return typeof w1 === 'number' && typeof w2 === 'number' ? [w1, w2] : null;
}

/** Chuẩn hoá nhắc lịch: giảm dần (72, 24, 2), để đổi thứ tự đầu vào không tính là thay đổi. Không sửa mảng gốc. */
export function normalizeReminders(hours: readonly number[]): number[] {
  return [...hours].sort((a, b) => b - a);
}

/** Hai giá trị (đã chuẩn hoá) có bằng nhau không: số so bằng `===`, mảng so từng phần tử theo thứ tự. */
export function sameConfigValue(a: ConfigValue, b: ConfigValue): boolean {
  if (typeof a === 'number' || typeof b === 'number') return a === b;
  return a.length === b.length && a.every((hours, index) => hours === b[index]);
}
