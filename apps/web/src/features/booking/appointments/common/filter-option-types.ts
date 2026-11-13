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

// F10: hai ô lọc của Quản trị viên (`Chi nhánh` chỉ với Toàn hệ thống; `Loại dịch vụ`)
export interface BranchOption {
  chiNhanhId: string;
  ten: string;
}

export interface ServiceOption {
  dichVuKhamId: string;
  ten: string;
}

export interface OptionList<T> {
  options: T[];
  truncated: boolean;
}
