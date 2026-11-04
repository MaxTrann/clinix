// Hợp đồng của API công khai (PLAN search 5.5). Mỗi task thêm kiểu của endpoint mình dùng vào đây.

/** `GET /public/clinic-info`: chưa có dữ liệu thì cả bốn trường là null. */
export interface ClinicInfo {
  tenThuongHieu: string | null;
  diaChiTruSo: string | null;
  duongDayNong: string | null;
  email: string | null;
}
