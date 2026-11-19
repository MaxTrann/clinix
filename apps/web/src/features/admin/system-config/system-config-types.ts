// Kiểu dữ liệu của màn "Cài đặt hệ thống" (admin F5). Hình dạng khớp `GET/PUT /admin/system-config` (B5) và `GET …/history` (B6),
// xem TRACKING admin 9A.1 mục 2.1 và 9A.4 mục 2.1.

// Thứ tự khoá GIỐNG `CONFIG_KEYS` của API (apps/api/src/admin/system-config/system-config-params.ts); test CHF5-01 so hai bản.
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

// Chưa có dòng cấu hình: `chuaCauHinh = true` và cả 12 giá trị là null (không có giá trị ngầm).
export type SystemConfig = { chuaCauHinh: boolean } & Record<
  ConfigKey,
  ConfigValue | null
>;

// Phần muốn đổi: vắng khoá = không đổi tham số đó.
export type ConfigPatch = Partial<Record<ConfigKey, ConfigValue>>;

export type UpdateSystemConfigBody = ConfigPatch & { lyDo: string };

export interface ConfigChange {
  // Khoá camelCase giống GET/PUT; API có thể thêm khoá mới sau này nên kiểu là chuỗi
  khoa: string;
  // null = lần tạo đầu tiên
  truoc: ConfigValue | null;
  sau: ConfigValue;
}

export interface HistoryItem {
  id: string;
  // ISO 8601 UTC
  thoiDiem: string;
  nguoiThucHien: string;
  lyDo: string;
  thayDoi: ConfigChange[];
}

export interface HistoryPage {
  items: HistoryItem[];
  total: number;
  page: number;
  pageSize: number;
}
