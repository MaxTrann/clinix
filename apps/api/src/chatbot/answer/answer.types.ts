import type { RuleId } from './output-verifier.js';

// Kiểu của đoạn trả lời và kết quả đối chiếu (chatbot B2; PLAN chatbot 5.7, 5.12). Chỉ KIỂU: không có giá trị lúc chạy.

/** Đối tượng mà web dựng liên kết từ `doiTuong` và `id` (bác sĩ, chuyên khoa, chi nhánh, dịch vụ); các giá trị khác (giá, giờ, địa chỉ…) là đoạn chữ. */
export type DoiTuong = 'BacSi' | 'ChuyenKhoa' | 'ChiNhanh' | 'DichVu';

/** Không HTML, không markdown: web in bằng văn bản thường (React tự thoát ký tự), nên `<` và `&` giữ nguyên là chữ (DCR-12). */
export type Doan =
  | { readonly kieu: 'chu'; readonly chu: string }
  | {
      readonly kieu: 'thucThe';
      readonly doiTuong: DoiTuong;
      readonly id: string;
      readonly chu: string;
    };

/** Giá trị máy chủ dựng cho MỘT chỗ giữ sau khi đọc lại DB. Có `entity` thì thành đoạn `thucThe`, không thì đoạn `chu`. */
export interface ResolvedValue {
  readonly chu: string;
  readonly entity?: { readonly doiTuong: DoiTuong; readonly id: string };
}

export interface SuggestedSpecialty {
  readonly chuyenKhoaId: string;
  readonly ten: string;
}

/** Kết quả của bước 12 đến 14 của 5.4. Chatbot B3 đổi thành thân API 5.12. */
export type ReconcileResult =
  | {
      readonly ketQua: 'TraLoi' | 'GoiY';
      readonly doan: Doan[];
      readonly chuyenKhoaGoiY: SuggestedSpecialty[];
    }
  /** 2.4.7 A4: `goiYDatLich` mà mọi id bị loại. Không đối chiếu tiếp. */
  | {
      readonly ketQua: 'KhongCoChuyenKhoa';
      readonly chuyenKhoaGoiY: SuggestedSpecialty[];
    }
  /** 2.4.7 A2: vi phạm V2 đến V9. GIỮ thẻ chuyên khoa đã lọc (do máy chủ dựng, 5.4 bước 13); bỏ toàn bộ chữ của mô hình. Chỉ mang MÃ LUẬT. */
  | {
      readonly ketQua: 'KhongKhopDuLieu';
      readonly ruleId: RuleId;
      readonly chuyenKhoaGoiY: SuggestedSpecialty[];
    }
  /** Mô hình gắn `khanCap` hay `ngoaiPhamVi`: chatbot B3 dùng câu dựng sẵn, bỏ chữ của mô hình (5.4 bước 11). */
  | { readonly ketQua: 'KhanCap' | 'NgoaiPhamVi' };
