// Kiểu của hai API Quản trị viên đọc đánh giá bác sĩ (doctor-exam F7): `GET /admin/doctor-ratings` và `GET /admin/doctor-ratings/:id` (B7, PLAN 5.8). Định nghĩa lại ở web (không import mã `apps/api`).
// `danhGiaId`, `bacSiId`, `chiNhanhId` là BIGINT dạng CHUỖI chữ số (KHÔNG đọc bằng `Number`: id lớn hơn 2^53 sẽ mất chữ số). `nguoiDanhGia` là tên NGƯỜI ĐẶT lịch (Q8).

// Trạng thái lọc của API (`trangThai`); khoá của `demTheoTrangThai` cũng là hai giá trị này
export type AdminReviewStatus = 'HienThi' | 'DaAn';

// Một dòng danh sách: ĐÚNG tám khoá. `nhanXet` đã bị máy chủ cắt (≤ 200 đơn vị UTF-16, không "…", không cờ "bị cắt"); `null` khi người đánh giá không viết nhận xét.
export interface AdminReviewItem {
  danhGiaId: string;
  bacSi: { bacSiId: string; hoTen: string };
  chiNhanh: { chiNhanhId: string; ten: string };
  nguoiDanhGia: { hoTen: string };
  soSao: number;
  nhanXet: string | null;
  thoiDiemTao: string;
  biAn: boolean;
}

// Chi tiết = tám khoá trên (`nhanXet` ĐẦY ĐỦ) + `maLichHen` + `thoiGianKham` (ISO UTC) + `lyDoAn` (`null` khi vắng: chưa ẩn, hoặc đã ẩn mà không có lý do lưu).
export interface AdminReviewDetail extends AdminReviewItem {
  maLichHen: string;
  thoiGianKham: string;
  lyDoAn: string | null;
}

// Đếm theo trạng thái, áp mọi bộ lọc TRỪ `trangThai` (số không đổi khi đổi lựa chọn Trạng thái)
export interface AdminReviewCounts {
  HienThi: number;
  DaAn: number;
}

export interface AdminReviewPage {
  items: AdminReviewItem[];
  total: number;
  page: number;
  pageSize: number;
  demTheoTrangThai: AdminReviewCounts;
}

// Tham số của danh sách; khoá `undefined` không được gửi. `chiNhanhId` chỉ có tác dụng với Toàn hệ thống (Admin Chi nhánh bị máy chủ ép), nên web không gửi khi là Admin Chi nhánh.
export interface AdminReviewQuery {
  trangThai?: AdminReviewStatus;
  soSao?: number;
  bacSiId?: string;
  chiNhanhId?: string;
  q?: string;
  page: number;
  pageSize: number;
}

// Mặc định của máy chủ là 20, tối đa 50; `q` tối đa 100 đơn vị UTF-16 (dài hơn là 400)
export const ADMIN_REVIEW_PAGE_SIZE = 20;
export const ADMIN_REVIEW_Q_MAX = 100;
