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

/** Một chuyên khoa ở `GET /public/specialties`; `soBacSi` đếm bác sĩ công khai (theo chi nhánh nếu có lọc). */
export interface SpecialtySummary {
  chuyenKhoaId: string;
  ten: string;
  moTa: string | null;
  anhDaiDien: string | null;
  soBacSi: number;
}

/** `soCoBacSi`: số chuyên khoa (theo cùng bộ lọc) đã có ít nhất một bác sĩ công khai. */
export interface SpecialtyPage extends Paged<SpecialtySummary> {
  soCoBacSi: number;
}

/** `GET /public/specialties/:id`. `giaKhamTu` thêm khi API có B4 (Q9): trường tuỳ chọn để FE chạy được cả hai bản. */
export interface SpecialtyDetail extends SpecialtySummary {
  giaKhamTu?: { giaKham: number; mucDatCoc: number } | null;
}
