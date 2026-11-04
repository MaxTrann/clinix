// Hợp đồng của API công khai (PLAN search 5.5). Mỗi task thêm kiểu của endpoint mình dùng vào đây.

/** `GET /public/clinic-info`: chưa có dữ liệu thì cả bốn trường là null. */
export interface ClinicInfo {
  tenThuongHieu: string | null;
  diaChiTruSo: string | null;
  duongDayNong: string | null;
  email: string | null;
}

/** Khung phân trang chung của API công khai. */
export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Một dòng `GET /public/branches`: id và toạ độ là chuỗi, toạ độ có thể null. */
export interface BranchSummary {
  chiNhanhId: string;
  ten: string;
  diaChi: string;
  toaDoLat: string | null;
  toaDoLng: string | null;
}

export interface TimeRange {
  tu: string;
  den: string;
}

/** Một thứ trong tuần (1 = Thứ Hai … 7 = Chủ Nhật); `hoatDong: null` = nghỉ hoặc chưa khai báo (Q4). */
export interface WeekdayHours {
  thuTrongTuan: number;
  hoatDong: { sang: TimeRange | null; chieu: TimeRange | null } | null;
}

/** `GET /public/branches/:id` */
export interface BranchDetail extends BranchSummary {
  lichHoatDong: WeekdayHours[];
  dichVuKham: { dichVuKhamId: string; ten: string }[];
  soBacSi: number;
}
