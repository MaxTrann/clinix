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
