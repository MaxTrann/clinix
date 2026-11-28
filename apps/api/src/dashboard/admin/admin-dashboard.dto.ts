import type { Ratio } from './ratio.rules.js';

// Phản hồi của `GET /admin/dashboard` (PLAN dashboard 5.7). B1 trả sáu khoá dưới đây; B2 thêm `tienCoc`, `hoanTien`, `xuHuong`, `choDuyet`, `coDuLieu`.
// CHỈ số tổng hợp, ngày và id chi nhánh: không họ tên, SĐT, email, mã lịch, id tài khoản (5.9, DRG-04). Id BIGINT là chuỗi.

export interface AdminDashboard {
  /** Bộ lọc ĐÃ ÁP DỤNG (sau mặc định và phạm vi): Quản trị viên Chi nhánh luôn thấy chi nhánh được gán; `null` = mọi chi nhánh */
  boLoc: { tuNgay: string; denNgay: string; chiNhanhId: string | null };
  /** Thời điểm tính số (ISO 8601 UTC), cũng là "bây giờ" dùng cho ngày hôm nay */
  capNhatLuc: string;
  /** Hôm nay theo giờ Việt Nam: KHÔNG theo bộ lọc ngày, CÓ theo chi nhánh (Q4) */
  homNay: { ngay: string; lichKham: number; hoanThanh: number };
  trongKhoang: { lichKham: number; hoanThanh: number };
  /** Vắng mặt trên lịch đã có kết quả (Q1) */
  vangMat: Ratio;
  /** Khung đã đặt trên khung đã phát ra, trừ nghỉ phép đã duyệt (Q2) */
  khungGio: Ratio;
}

/** Khoá của phản hồi (sắp theo bảng chữ cái), để test so danh sách trắng (DRG-04). */
export const ADMIN_DASHBOARD_KEYS = [
  'boLoc',
  'capNhatLuc',
  'homNay',
  'khungGio',
  'trongKhoang',
  'vangMat',
] as const;
