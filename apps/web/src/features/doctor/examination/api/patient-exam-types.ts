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

// Chi tiết một ca: F5 đọc bảy trong chín khoá; `danhGia` và `coTheDanhGia` do F6 đọc khi cần
export interface ExamDetail {
  maLichHen: string;
  thoiGian: string;
  chuyenKhoa: string;
  chiNhanh: string;
  bacSi: ExamDoctor;
  nguoiKham: ExamPerson;
  hoSoKham: ExamDetailNote | null;
}
