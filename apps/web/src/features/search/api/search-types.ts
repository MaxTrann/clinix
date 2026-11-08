// Hợp đồng của API công khai (PLAN search 5.5). Mỗi task thêm kiểu của endpoint mình dùng vào đây.

/** `GET /public/clinic-info`: chưa có dữ liệu thì cả bốn trường là null. */
export interface ClinicInfo {
  tenThuongHieu: string | null;
  diaChiTruSo: string | null;
  duongDayNong: string | null;
  email: string | null;
}

/** Ba số đếm toàn hệ thống; không lọc theo chi nhánh (B9). */
export interface PublicOverview {
  soChuyenKhoa: number;
  soBacSi: number;
  soDichVu: number;
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

/** Một nhóm ở `GET /public/service-groups` (TCBS b1). `giaTu` là chuỗi decimal; nhóm chưa có dịch vụ ⇒ `sapTrienKhai`. */
export interface ServiceGroupItem {
  nhomDichVuId: string;
  ten: string;
  soDichVu: number;
  giaTu: string | null;
  sapTrienKhai: boolean;
}

/** Một dịch vụ ở `GET /public/services` (TCBS b2). Tiền là chuỗi decimal; `mucDatCoc` "0.00" = không cần cọc. */
export interface ServiceItem {
  dichVuKhamId: string;
  ten: string;
  nhomDichVu: { id: string; ten: string };
  thoiLuong: number;
  giaMacDinh: string;
  mucDatCoc: string;
  soBacSi: number;
}

export interface Items<T> {
  items: T[];
}

export type DoctorTitle =
  'BS' | 'BS_CKI' | 'BS_CKII' | 'ThS_BS' | 'TS_BS' | 'PGS_TS_BS' | 'GS_TS_BS';

export type DoctorSort = 'kinhNghiem' | 'giaTangDan' | 'danhGiaCao';

/** Một bác sĩ ở `GET /public/doctors` (danh sách trắng, Q14). Tiền và điểm là chuỗi decimal. */
export interface DoctorItem {
  bacSiId: string;
  hoTen: string;
  chucDanh: DoctorTitle;
  soNamKinhNghiem: number;
  chuyenKhoa: { chuyenKhoaId: string; ten: string };
  chiNhanh: { chiNhanhId: string; ten: string; diaChi: string };
  dichVu: { dichVuKhamId: string; ten: string; thoiLuong: number };
  gia: {
    giaMacDinh: string;
    phuPhi: string;
    giaKham: string;
    mucDatCoc: string;
  };
  danhGia: { diemTrungBinh: string | null; soDanhGia: number };
}

/** `GET /public/doctors/:id`: như một phần tử danh sách + mô tả chuyên môn (có thể null) và giờ nhận khám 7 thứ của chi nhánh. */
export interface DoctorDetail extends Omit<DoctorItem, 'chiNhanh'> {
  moTaChuyenMon: string | null;
  chiNhanh: DoctorItem['chiNhanh'] & { lichHoatDong: WeekdayHours[] };
}

/** Tham số lọc của `GET /public/doctors`; thiếu/rỗng = không lọc. */
export interface DoctorQuery {
  dichVuKhamId?: string;
  chuyenKhoaId?: string;
  chiNhanhId?: string;
  q?: string;
  giaTu?: string;
  giaDen?: string;
  diemTu?: string;
  sapXep?: DoctorSort;
  page?: number;
  pageSize?: number;
}
