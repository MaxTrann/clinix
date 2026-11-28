import type { Trend } from '../filter/trend-buckets.rules.js';
import type { MoneyTotal } from '../queries/money.query.js';
import type { Ratio } from './ratio.rules.js';

// Phản hồi của `GET /admin/dashboard` (PLAN dashboard 5.7). B1: `boLoc`, `capNhatLuc`, `homNay`, `trongKhoang`, `vangMat`, `khungGio`;
// B2: `tienCoc`, `hoanTien`, `xuHuong`, `choDuyet`, `coDuLieu`.
// CHỈ số tổng hợp, ngày và id chi nhánh: không họ tên, SĐT, email, mã lịch, id tài khoản (5.9, DRG-04). Id BIGINT và tiền là chuỗi.

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
  /** Cọc ví thành công theo ngày giao dịch (Q3) */
  tienCoc: MoneyTotal;
  /** Đã hoàn vào ví theo ngày hoàn; `soKhoanDangLoi` tại thời điểm xem, không theo bộ lọc ngày (Q3, T7) */
  hoanTien: MoneyTotal & { soKhoanDangLoi: number };
  /** Lịch đặt mới theo ngày đặt; đủ điểm kể cả 0 (Q5, T8) */
  xuHuong: Trend;
  /** Yêu cầu đang chờ duyệt, mọi thời điểm; `rutTien` là `null` với Quản trị viên Chi nhánh (Q6) */
  choDuyet: {
    nghiPhep: number;
    doiLich: number;
    thayDoiChiNhanh: number;
    rutTien: number | null;
  };
  /** `false` khi trong khoảng không có lịch khám, lịch đặt mới, khoản cọc hay khoản hoàn nào (A1, MH2) */
  coDuLieu: boolean;
}

/** Khoá của phản hồi (sắp theo bảng chữ cái), để test so danh sách trắng (DRG-04). */
export const ADMIN_DASHBOARD_KEYS = [
  'boLoc',
  'capNhatLuc',
  'choDuyet',
  'coDuLieu',
  'hoanTien',
  'homNay',
  'khungGio',
  'tienCoc',
  'trongKhoang',
  'vangMat',
  'xuHuong',
] as const;
