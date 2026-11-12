// Các lựa chọn của bộ lọc Bác sĩ và Chuyên khoa (booking F1 viết, chuyển lên common/ ở F8; Lễ tân dùng lại). Id là chuỗi (BIGINT). Danh sách lấy một trang tối
// đa 100 mục: `truncated` = còn mục chưa lấy được (`total` lớn hơn số mục nhận), để giao diện ghi "danh sách rút gọn" thay vì cắt âm thầm.
export interface SpecialtyOption {
  chuyenKhoaId: string;
  ten: string;
}

export interface DoctorOption {
  bacSiId: string;
  hoTen: string;
}

export interface OptionList<T> {
  options: T[];
  truncated: boolean;
}
