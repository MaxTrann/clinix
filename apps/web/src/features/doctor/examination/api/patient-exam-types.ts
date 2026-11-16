// Kiểu của hai API Bệnh nhân đọc hồ sơ khám (doctor-exam F5): `GET /patient/exam-records` (B4, PLAN 5.6) và `GET /patient/exam-records/:maLichHen` (B5). Định nghĩa lại ở web (không import mã `apps/api`).
// `chucDanh` và `quanHe` là NGUYÊN giá trị ENUM của DB; chữ hiển thị do `patient/patient-exam-labels.ts` chọn.

export interface ExamPerson {
  hoTen: string;
  // `null` khi người khám là bản thân
  quanHe: string | null;
}

export interface ExamDoctor {
  hoTen: string;
  chucDanh: string;
}

// Một dòng danh sách: ĐÚNG bảy khoá, KHÔNG nội dung hồ sơ (XHS-02). `daDanhGia` đúng cả khi đánh giá bị ẩn (Q19); F5 chưa dùng (F6 dùng).
export interface ExamListItem {
  maLichHen: string;
  thoiGian: string;
  chuyenKhoa: string;
  bacSi: ExamDoctor;
  nguoiKham: ExamPerson;
  coHoSoKham: boolean;
  daDanhGia: boolean;
}

// Một lựa chọn của bộ lọc người khám: `id` là id hồ sơ người thân dạng chuỗi, `null` là bản thân
export interface ExamineeOption {
  id: string | null;
  hoTen: string;
  quanHe: string | null;
}

export interface ExamListPage {
  items: ExamListItem[];
  total: number;
  page: number;
  pageSize: number;
  // Số lịch `HoanThanh` của 12 tháng (chỉ số 0 là tháng 1), áp người khám và CẢ NĂM, không áp tháng đang lọc
  demTheoThang: readonly number[];
  nguoiKham: ExamineeOption[];
}

export interface ExamListQuery {
  // `BanThan` hoặc id hồ sơ người thân; bỏ trống là mọi người khám
  nguoiKham?: string;
  nam: number;
  thang?: number;
  pageSize: number;
}

// Hồ sơ khám trong chi tiết: ĐÚNG sáu khoá; chữ rỗng khi cột DB là NULL (XHS-14). `capNhatBoi` là họ tên bác sĩ của lịch, SUY RA (TECH_DEBT 159)
export interface ExamDetailNote {
  trieuChung: string;
  chanDoanSoBo: string;
  huongXuLy: string;
  ngayTaiKhamDuKien: string | null;
  capNhatLanCuoi: string;
  capNhatBoi: string;
}

// Miền số sao (PLAN 5.7: nguyên 1 đến 5). Một nơi định nghĩa cho bộ đọc, ô sao và quy tắc
export const RATING_MIN_STARS = 1;
export const RATING_MAX_STARS = 5;

// Đánh giá bác sĩ của một lịch (doctor-exam F6; B5 `danhGia`, B6 201): ĐÚNG ba khoá. `nhanXet` là `null` khi không viết (Q7). Đánh giá bị ẩn vẫn nguyên vẹn và KHÔNG có `biAn`, `lyDoAn` (Q19): web không biết đã ẩn
export interface ExamRating {
  soSao: number;
  nhanXet: string | null;
  thoiDiemTao: string;
}

// Thân của `POST …/rating`: `nhanXet` chỉ có khi có chữ (đã chuẩn hoá); để trống thì BỎ khoá (Q7: tuỳ chọn)
export interface RatingBody {
  soSao: number;
  nhanXet?: string;
}

// Chi tiết một ca, đủ chín khoá của B5. `coTheDanhGia` luôn bằng `danhGia === null` (bộ đọc ép điều này)
export interface ExamDetail {
  maLichHen: string;
  thoiGian: string;
  chuyenKhoa: string;
  chiNhanh: string;
  bacSi: ExamDoctor;
  nguoiKham: ExamPerson;
  hoSoKham: ExamDetailNote | null;
  danhGia: ExamRating | null;
  coTheDanhGia: boolean;
}
