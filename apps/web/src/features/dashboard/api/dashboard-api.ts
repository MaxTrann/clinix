import { request } from '../../../shared/api/client';
import { UnexpectedResponseError } from '../../../shared/api/errors';
import type { DashboardFilter } from '../admin/filter';

// Lời gọi API của dashboard (dashboard F1; PLAN dashboard 5.7). Chỉ dùng client chung `request`, không tự gọi `fetch`.
// Tiền là CHUỖI decimal, phần trăm do MÁY CHỦ tính (T5): web chỉ định dạng, không tự tính lại.

export interface Ratio {
  tuSo: number;
  mauSo: number;
  /** Một chữ số thập phân; `null` khi mẫu số 0 ("Chưa đủ dữ liệu") */
  phanTram: number | null;
}

export interface MoneyTotal {
  soKhoan: number;
  tongTien: string;
}

export interface TrendPoint {
  tuNgay: string;
  denNgay: string;
  soLuong: number;
}

/** Phản hồi của `GET /admin/dashboard`: đúng 11 khoá của hợp đồng 5.7. */
export interface AdminDashboard {
  boLoc: { tuNgay: string; denNgay: string; chiNhanhId: string | null };
  capNhatLuc: string;
  homNay: { ngay: string; lichKham: number; hoanThanh: number };
  trongKhoang: { lichKham: number; hoanThanh: number };
  vangMat: Ratio;
  khungGio: Ratio;
  tienCoc: MoneyTotal;
  hoanTien: MoneyTotal & { soKhoanDangLoi: number };
  xuHuong: { donVi: 'Ngay' | 'Tuan'; diem: TrendPoint[] };
  choDuyet: {
    nghiPhep: number;
    doiLich: number;
    thayDoiChiNhanh: number;
    /** `null` với Quản trị viên Chi nhánh (rút tiền chỉ Toàn hệ thống duyệt) */
    rutTien: number | null;
  };
  coDuLieu: boolean;
}

export interface BranchOption {
  chiNhanhId: string;
  ten: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** Kiểm phần trang này đọc: thân khác hình dạng (proxy trả trang lỗi, API cũ) thì báo lỗi thay vì làm vỡ trang. */
function isAdminDashboard(value: unknown): value is AdminDashboard {
  if (!isRecord(value)) return false;
  const keys = [
    'boLoc',
    'homNay',
    'trongKhoang',
    'vangMat',
    'khungGio',
    'tienCoc',
    'hoanTien',
    'choDuyet',
  ];
  return (
    keys.every((key) => isRecord(value[key])) &&
    // Biểu đồ (F2) duyệt `xuHuong.diem`: thiếu mảng thì báo lỗi thay vì làm vỡ trang
    isRecord(value.xuHuong) &&
    Array.isArray(value.xuHuong.diem) &&
    typeof value.coDuLieu === 'boolean'
  );
}

/** Tổng quan theo bộ lọc. Không gửi ngày khi URL không có: máy chủ dùng 30 ngày kết thúc ở hôm nay theo đồng hồ của máy chủ. */
export async function getAdminDashboard(
  filter: DashboardFilter,
  signal: AbortSignal,
): Promise<AdminDashboard> {
  const body = await request<unknown>('/admin/dashboard', {
    query: {
      tuNgay: filter.tuNgay,
      denNgay: filter.denNgay,
      chiNhanhId: filter.chiNhanhId,
    },
    signal,
  });
  if (!isAdminDashboard(body)) throw new UnexpectedResponseError(200);
  return body;
}

/** Danh sách chi nhánh cho ô lọc của Quản trị viên Toàn hệ thống (trang đầu, tối đa 100: cỡ đồ án). */
export async function listBranchOptions(
  signal: AbortSignal,
): Promise<BranchOption[]> {
  const body = await request<{ items?: unknown }>('/admin/branches', {
    query: { page: 1, pageSize: 100 },
    signal,
  });
  if (!Array.isArray(body.items)) return [];
  return body.items
    .filter(isRecord)
    .filter(
      (item): item is Record<string, unknown> & BranchOption =>
        typeof item.chiNhanhId === 'string' && typeof item.ten === 'string',
    )
    .map((item) => ({ chiNhanhId: item.chiNhanhId, ten: item.ten }));
}
