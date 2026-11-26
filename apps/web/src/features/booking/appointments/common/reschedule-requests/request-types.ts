// Kiểu của danh sách và chi tiết yêu cầu đổi lịch ngoài chính sách (reschedule F4; PLAN reschedule 5.7, 5.8; hợp đồng THẬT của B8, TRACKING mục 7 khối B8). Thư mục này KHÔNG biết vai trò hay
// đường dẫn: Lễ tân (F4) và Quản trị viên (F5) cùng dùng, mỗi vai trò chỉ khác `RescheduleRequestsApi` và các đường dẫn truyền vào. Id BIGINT luôn là CHUỖI (không bao giờ `Number`).

export const REQUEST_STATUSES = ['ChoDuyet', 'DaDuyet', 'TuChoi'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

// Trạng thái khung giờ MONG MUỐN lúc đọc (máy chủ tính: hết hạn giữ chỗ ra `ConTrong`, quá giờ ra `HetHan`); chỉ là thông tin, quyết định thật ở lúc duyệt
export const SLOT_STATES = [
  'ConTrong',
  'DangGiuCho',
  'DaDat',
  'HetHan',
] as const;
export type SlotState = (typeof SLOT_STATES)[number];

// MỘT dòng danh sách: ĐÚNG mười khoá (không SĐT, email, lý do khám, giá, id lịch)
export interface RequestRow {
  yeuCauId: string;
  trangThai: RequestStatus;
  // ISO 8601 UTC giữ mili giây
  thoiDiemTao: string;
  maLichHen: string;
  nguoiKham: { hoTen: string; laNguoiThan: boolean };
  bacSi: { hoTen: string };
  chiNhanh: { id: string; ten: string };
  thoiGianCu: string;
  thoiGianMongMuon: string;
  soLanDaTuDoi: number;
}

// Chi tiết: mười khoá của dòng cộng chín khoá (mười chín khoá)
export interface RequestDetail extends RequestRow {
  // `null` khi chưa có `cau_hinh_he_thong`
  soLanToiDa: number | null;
  // Chữ tự do của Bệnh nhân: luôn hiển thị dạng chữ thuần
  lyDoYeuCau: string;
  // Mọi trạng thái lịch, kể cả `DaDoiLich` (nhãn lạ ⇒ "Chưa xác định")
  trangThaiLichGoc: string;
  coTheDuyet: boolean;
  // `null` khi `coTheDuyet`; ngược lại một `maLoi` (web chọn câu theo mã)
  lyDoKhongDuyet: string | null;
  khungGioMongMuon: { khungGioId: string; trangThai: SlotState };
  // Ba khoá xử lý: `null` cả ba khi còn `ChoDuyet`
  ghiChuXuLy: string | null;
  thoiDiemXuLy: string | null;
  nguoiXuLy: { hoTen: string } | null;
}

export interface RequestPage {
  items: RequestRow[];
  total: number;
  page: number;
  pageSize: number;
}

// Hai tab của trang: Chờ duyệt (mặc định) và Đã xử lý (chỉ đọc; Q11)
export const REQUEST_TABS = ['cho-duyet', 'da-xu-ly'] as const;
export type RequestTab = (typeof REQUEST_TABS)[number];

// Truy vấn đã chuẩn hoá mà hook gửi cho API: `bacSiId` và `q` rỗng nghĩa là không lọc
export interface RequestQuery {
  tab: RequestTab;
  page: number;
  bacSiId: string;
  q: string;
}

// Hàm gọi API của MỘT vai trò (Lễ tân: `reception/reschedule-requests`; Quản trị viên: `admin/reschedule-requests`). Thành phần dùng chung chỉ biết giao diện này.
export interface RescheduleRequestsApi {
  list: (query: RequestQuery, signal?: AbortSignal) => Promise<RequestPage>;
  get: (yeuCauId: string, signal?: AbortSignal) => Promise<RequestDetail>;
  // Id bác sĩ của lịch gốc, để vẽ lưới khung giờ THAY THẾ khi duyệt (Pha B2; chi tiết B8 không có id này). VẮNG ⇒ hộp Duyệt không có nút "Chọn khung giờ khác" (Quản trị viên ở F5 chưa có nguồn).
  resolveDoctorId?: (
    detail: RequestDetail,
    signal?: AbortSignal,
  ) => Promise<string>;
}
