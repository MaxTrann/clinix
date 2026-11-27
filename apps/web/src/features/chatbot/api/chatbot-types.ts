// Hợp đồng `POST /chatbot/messages` (PLAN chatbot 5.12). Tên trường đúng như API; id BIGINT là chuỗi.
// F1 viết theo hợp đồng này khi API thật (chatbot B3) chưa có; test dùng lớp giả ở `testing/`.

// Giới hạn đúng DTO của máy chủ (PLAN 5.12, MH3): đếm theo ĐIỂM MÃ, không theo đơn vị UTF-16.
export const MAX_QUESTION_LENGTH = 500;
export const MAX_HISTORY_TURNS = 6;
export const MAX_TURN_LENGTH = 800;

export const KET_QUA = [
  'TraLoi',
  'GoiY',
  'NgoaiPhamVi',
  'KhanCap',
  'TaiKhoan',
  'KhongKhopDuLieu',
  'KhongCoChuyenKhoa',
  'DuPhong',
] as const;
export type KetQua = (typeof KET_QUA)[number];

// Mã đích của liên kết: web tự dựng đường dẫn, máy chủ không trả URL.
export const LIEN_KET_MA = [
  'TraCuuBacSi',
  'NhanTinLeTan',
  'LichHenCuaToi',
  'ViCuaToi',
  'GoiCapCuu',
] as const;
export type LienKetMa = (typeof LIEN_KET_MA)[number];

// `doiTuong` lạ vẫn được giữ (hiện chữ thường): máy chủ thêm loại mới không làm vỡ khung chat.
export type Doan =
  | { kieu: 'chu'; chu: string }
  | { kieu: 'thucThe'; doiTuong: string; id: string; chu: string };

export interface ChuyenKhoaGoiY {
  chuyenKhoaId: string;
  ten: string;
}

export interface ChatbotReply {
  ketQua: KetQua;
  doan: Doan[];
  // F1 chỉ giữ lại; thẻ gợi ý là của F2
  chuyenKhoaGoiY: ChuyenKhoaGoiY[];
  lienKet: LienKetMa[];
  coTheGuiLai: boolean;
  tinhVaoLichSu: boolean;
}

export interface HistoryTurn {
  vai: 'NguoiDung' | 'TroLy';
  noiDung: string;
}

export interface ChatbotRequest {
  cauHoi: string;
  lichSu?: HistoryTurn[];
  chiNhanhId?: string;
}

// Hợp đồng `GET /chatbot/suggestions` (chatbot B4; PLAN 5.11, 5.12; mã thật ở `apps/api/src/chatbot/suggest/suggestion.dto.ts`).
// Mọi id là chuỗi; `batDau` là ISO 8601 UTC; `giaKham` là chuỗi tiền đã cộng phụ phí. Web chỉ nhận danh sách trắng dưới đây:
// KHÔNG có học vị, số năm kinh nghiệm, điểm xếp hạng (những thứ đó chỉ dùng phía máy chủ để xếp hạng).
export const SHIFT_CODES = ['CaSang', 'CaChieu', 'CaToi'] as const;
export type SuggestShift = (typeof SHIFT_CODES)[number];

export const EMPTY_REASONS = ['KhongCoKhungGio', 'KhongCoBacSi'] as const;
export type EmptyReason = (typeof EMPTY_REASONS)[number];

// `chiNhanhId` vắng nghĩa là "Toàn quốc" hay chưa chọn chi nhánh. `ngay` (YYYY-MM-DD, giờ Việt Nam) và `ca` vắng nghĩa là để máy chủ chọn ngày sớm nhất.
export interface SuggestParams {
  chuyenKhoaId: string;
  chiNhanhId?: string;
  ngay?: string;
  ca?: SuggestShift;
}

export interface SuggestedSlot {
  khungGioId: string;
  batDau: string;
  ca: SuggestShift;
}

export interface SuggestedDoctor {
  bacSiId: string;
  hoTen: string;
  // Mã thô (`BS`, `BS_CKI`, `TS_BS`…); mã lạ vẫn được giữ và hiện nguyên mã
  chucDanh: string;
  chiNhanh: { chiNhanhId: string; ten: string; diaChi: string };
  giaKham: string;
  danhGia: { diemTrungBinh: string | null; soDanhGia: number };
  khungGio: SuggestedSlot[];
}

export interface Suggestion {
  chuyenKhoa: { chuyenKhoaId: string; ten: string };
  // `null`: không có ngày nào có ô trống (hay chuyên khoa chưa có bác sĩ)
  ngay: string | null;
  bacSi: SuggestedDoctor[];
  // Chỉ có khi `bacSi` rỗng
  lyDoRong?: EmptyReason;
}

// Một dòng của danh sách chuyên khoa công khai (`GET /public/specialties`); chỉ giữ id và tên
export interface SpecialtyOption {
  chuyenKhoaId: string;
  ten: string;
}
