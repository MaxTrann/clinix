// Hình dạng trả về của `GET /patient/exam-records/:maLichHen` (doctor-exam B5; PLAN 5.6; XHS-06, XHS-10). Chỉ kiểu: không lớp, không decorator (không có DTO query: khoá lạ ở query bị bỏ qua).
// Danh sách trắng: ĐÚNG chín khoá ở gốc, sáu khoá ở `hoSoKham`, ba khoá ở `danhGia`. KHÔNG có `biAn`, `lyDoAn` (đánh giá bị ẩn vẫn hiện nguyên vẹn: Q19) và không id nội bộ nào.

/** Hồ sơ khám của bác sĩ; chữ NGUYÊN VĂN (không cắt, không escape). Ba cột chữ NULL trong DB ra chuỗi rỗng (XHS-14). */
export interface ExamDetailRecord {
  trieuChung: string;
  chanDoanSoBo: string;
  huongXuLy: string;
  /** `YYYY-MM-DD` hoặc `null` (không hẹn tái khám) */
  ngayTaiKhamDuKien: string | null;
  /** ISO 8601 UTC */
  capNhatLanCuoi: string;
  /** Họ tên bác sĩ của lịch: SUY RA từ `lich_hen.bac_si_id`, không có cột nào lưu người sửa (TECH_DEBT: đúng chừng nào chỉ bác sĩ phụ trách ghi hồ sơ) */
  capNhatBoi: string;
}

/** Đánh giá của chính Bệnh nhân (kể cả khi đã bị ẩn, Q19). */
export interface ExamDetailRating {
  soSao: number;
  /** `null` khi không có nhận xét (nhận xét tuỳ chọn: Q7) */
  nhanXet: string | null;
  /** ISO 8601 UTC */
  thoiDiemTao: string;
}

export interface PatientExamDetail {
  maLichHen: string;
  /** ISO 8601 UTC */
  thoiGian: string;
  /** Theo bác sĩ HIỆN TẠI (như danh sách và booking) */
  chuyenKhoa: string;
  /** Tên chi nhánh theo SNAPSHOT của lịch (chi nhánh lúc đặt), không theo chi nhánh hiện tại của bác sĩ */
  chiNhanh: string;
  bacSi: { hoTen: string; chucDanh: string };
  /** `quanHe` là `null` khi khám cho bản thân */
  nguoiKham: { hoTen: string; quanHe: string | null };
  /** `null` khi bác sĩ chưa ghi hồ sơ (Q6: hồ sơ độc lập với Hoàn thành), không nội dung giả */
  hoSoKham: ExamDetailRecord | null;
  /** `null` khi chưa đánh giá */
  danhGia: ExamDetailRating | null;
  /** `danhGia === null`, tính từ chính đối tượng đã dựng (không cờ độc lập) */
  coTheDanhGia: boolean;
}
