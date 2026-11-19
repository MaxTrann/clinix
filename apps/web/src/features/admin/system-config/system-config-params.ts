import type { ConfigKey } from './system-config-types';

// Bảng 12 tham số của màn Cài đặt hệ thống: miền giá trị, đơn vị, nhãn, nhóm hiển thị.
// MIỀN (`rule`, `requiredOnCreate`, `REMINDER_LIMITS`) là bản SAO của `CONFIG_PARAMS` ở API (PLAN admin 5.7, Q34): web không import được từ
// `apps/api`, nên test CHF5-01 đọc file của API và so từng khoá (đổi một bên mà quên bên kia thì test đỏ). NHÃN và NHÓM là `[đề xuất]` (PLAN
// chỉ ghi tên cột, Figma 556:2 đến 558:2 chỉ là bản phác thảo).

export type ParamRule =
  | { kind: 'int'; min: number; max: number }
  | { kind: 'reminders' }
  | { kind: 'weight' };

export interface ParamDef {
  key: ConfigKey;
  label: string;
  unit: string;
  rule: ParamRule;
  // Cột NOT NULL không có DEFAULT ở DB: tạo cấu hình lần đầu (Q35) bắt buộc phải nhập
  requiredOnCreate: boolean;
}

// Nhắc lịch (Q34): 1 đến 5 mốc, mỗi mốc là số giờ nguyên 1 đến 720, không trùng.
export const REMINDER_LIMITS = { maxItems: 5, minHours: 1, maxHours: 720 };

export const PARAMS: Record<ConfigKey, ParamDef> = {
  thoiGianGiuCho: {
    key: 'thoiGianGiuCho',
    label: 'Thời hạn giữ chỗ',
    unit: 'phút',
    rule: { kind: 'int', min: 1, max: 60 },
    requiredOnCreate: false,
  },
  thoiDiemNhacLich: {
    key: 'thoiDiemNhacLich',
    label: 'Mốc nhắc trước giờ hẹn',
    unit: 'giờ',
    rule: { kind: 'reminders' },
    requiredOnCreate: false,
  },
  soLichHenToiDaMoiHoSo: {
    key: 'soLichHenToiDaMoiHoSo',
    label: 'Lịch hẹn đang hoạt động tối đa mỗi hồ sơ',
    unit: 'lịch',
    rule: { kind: 'int', min: 1, max: 20 },
    requiredOnCreate: true,
  },
  soLanTuDoiLichToiDa: {
    key: 'soLanTuDoiLichToiDa',
    label: 'Số lần tự đổi lịch tối đa',
    unit: 'lần',
    rule: { kind: 'int', min: 0, max: 10 },
    requiredOnCreate: true,
  },
  checkInTruocPhut: {
    key: 'checkInTruocPhut',
    label: 'Check-in sớm tối đa',
    unit: 'phút trước giờ hẹn',
    rule: { kind: 'int', min: 0, max: 240 },
    requiredOnCreate: true,
  },
  checkInSauPhut: {
    key: 'checkInSauPhut',
    label: 'Check-in muộn tối đa',
    unit: 'phút sau giờ hẹn',
    rule: { kind: 'int', min: 0, max: 240 },
    requiredOnCreate: true,
  },
  thoiHanPhanHoiLoiMoi: {
    key: 'thoiHanPhanHoiLoiMoi',
    label: 'Hạn phản hồi lời mời từ danh sách chờ',
    unit: 'phút',
    rule: { kind: 'int', min: 1, max: 1440 },
    requiredOnCreate: false,
  },
  soMucChoToiDa: {
    key: 'soMucChoToiDa',
    label: 'Số mục chờ tối đa mỗi bệnh nhân',
    unit: 'mục',
    rule: { kind: 'int', min: 0, max: 10 },
    requiredOnCreate: false,
  },
  nguongNoShow: {
    key: 'nguongNoShow',
    label: 'Ngưỡng no-show khoá đặt lịch',
    unit: 'lần',
    rule: { kind: 'int', min: 1, max: 10 },
    requiredOnCreate: false,
  },
  soNgayBaoTruocDoiGioLam: {
    key: 'soNgayBaoTruocDoiGioLam',
    label: 'Số ngày báo trước khi đổi lịch hoạt động hoặc dịch vụ chi nhánh',
    unit: 'ngày',
    rule: { kind: 'int', min: 1, max: 60 },
    requiredOnCreate: true,
  },
  trongSoW1: {
    key: 'trongSoW1',
    label: 'Trọng số đánh giá bác sĩ (w1)',
    unit: '',
    rule: { kind: 'weight' },
    requiredOnCreate: true,
  },
  trongSoW2: {
    key: 'trongSoW2',
    label: 'Trọng số kinh nghiệm và học vị (w2)',
    unit: '',
    rule: { kind: 'weight' },
    requiredOnCreate: true,
  },
};

export type TabId = 'booking' | 'waitlist' | 'advanced';

export interface ParamGroup {
  title: string;
  keys: ConfigKey[];
}

export interface ParamTab {
  id: TabId;
  label: string;
  groups: ParamGroup[];
}

// Ba tab tham số theo Figma 557:2 và 558:2 (tên tab thứ nhất là `[đề xuất]`); tab thứ tư "Lịch sử thay đổi" (578:2) dựng riêng.
export const PARAM_TABS: ParamTab[] = [
  {
    id: 'booking',
    label: 'Lịch khám & tiếp đón',
    groups: [
      { title: 'Giữ chỗ', keys: ['thoiGianGiuCho'] },
      {
        title: 'Tiếp đón & no-show',
        keys: ['checkInTruocPhut', 'checkInSauPhut', 'nguongNoShow'],
      },
      {
        title: 'Giới hạn đặt & đổi lịch',
        keys: ['soLichHenToiDaMoiHoSo', 'soLanTuDoiLichToiDa'],
      },
    ],
  },
  {
    id: 'waitlist',
    label: 'Danh sách chờ & nhắc lịch',
    groups: [
      {
        title: 'Danh sách chờ',
        keys: ['soMucChoToiDa', 'thoiHanPhanHoiLoiMoi'],
      },
      { title: 'Nhắc lịch', keys: ['thoiDiemNhacLich'] },
    ],
  },
  {
    id: 'advanced',
    label: 'Quy tắc nâng cao',
    groups: [
      { title: 'Quy tắc chi nhánh', keys: ['soNgayBaoTruocDoiGioLam'] },
      { title: 'Gợi ý bác sĩ', keys: ['trongSoW1', 'trongSoW2'] },
    ],
  },
];

// Thứ tự các ô trên màn hình (tab rồi thẻ rồi ô): dùng để chọn "ô lỗi đầu tiên".
export const DISPLAY_ORDER: ConfigKey[] = PARAM_TABS.flatMap((tab) =>
  tab.groups.flatMap((group) => group.keys),
);

export function tabOf(key: ConfigKey): TabId {
  const tab = PARAM_TABS.find((item) =>
    item.groups.some((group) => group.keys.includes(key)),
  );
  // Mọi khoá đều nằm trong một thẻ (test CHF5-02); nhánh này chỉ để thoả kiểu
  return tab ? tab.id : 'booking';
}

export function isConfigKey(name: string): name is ConfigKey {
  return Object.hasOwn(PARAMS, name);
}
