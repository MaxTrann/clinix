import { request } from '../../../shared/api/client';
import { UnexpectedResponseError } from '../../../shared/api/errors';
import type { ShiftCode } from '../../../shared/schedule/shift-labels';
import type { LeaveKind, LeaveStatus } from './leave-api';

// Hợp đồng `GET /admin/leave-requests[/:id]` và `POST /admin/leave-requests/:id/reject` (PLAN doctor B13, B14). Chỉ Quản trị viên.
// KHÔNG có hàm duyệt: nút Duyệt do F9 thêm sau khi B15 merge (Q26, WA-16).

/** Một dòng danh sách. Không có `lyDo` (thuộc chi tiết) và chưa có số lịch hẹn bị ảnh hưởng (booking B11, nối ở B17). */
export interface AdminLeaveItem {
  yeuCauNghiPhepId: string;
  trangThai: LeaveStatus;
  hinhThuc: LeaveKind;
  tuNgay: string;
  denNgay: string;
  ca: ShiftCode | null;
  // ISO 8601 UTC
  thoiDiemTao: string;
  thoiDiemXuLy: string | null;
  bacSi: { bacSiId: string; hoTen: string };
  chuyenKhoa: { ten: string };
  // Chi nhánh HIỆN TẠI của bác sĩ (Q28)
  chiNhanh: { chiNhanhId: string; ten: string };
}

export interface AdminLeaveDetail extends AdminLeaveItem {
  lyDo: string;
}

// Số yêu cầu theo trạng thái, tính với cùng bộ lọc trừ `trangThai`: không đổi khi bấm đổi trạng thái (PD-21)
export interface AdminLeaveStats {
  choDuyet: number;
  daDuyet: number;
  tuChoi: number;
  tong: number;
}

export interface AdminLeavePage {
  items: AdminLeaveItem[];
  total: number;
  page: number;
  pageSize: number;
  thongKe: AdminLeaveStats;
}

export interface AdminLeaveQuery {
  page: number;
  pageSize: number;
  trangThai?: LeaveStatus;
  // 2–100 ký tự (Q38); nơi gọi chỉ gửi khi đủ dài
  q?: string;
  tuNgayGui?: string;
  denNgayGui?: string;
  // Chỉ có tác dụng với Toàn hệ thống: server ép chi nhánh của Admin Chi nhánh
  chiNhanhId?: string;
}

export const ADMIN_LEAVE_PAGE_SIZE = 10;
// Giới hạn lý do từ chối của server (Q27c; admin-leave.constants.ts): đổi ở server thì đổi ở đây
export const REJECT_REASON_MAX = 255;

export async function listAdminLeaveRequests(
  query: AdminLeaveQuery,
  signal?: AbortSignal,
): Promise<AdminLeavePage> {
  const data = await request<AdminLeavePage>('/admin/leave-requests', {
    query: { ...query },
    signal,
  });
  if (
    typeof data !== 'object' ||
    data === null ||
    !Array.isArray(data.items) ||
    typeof data.total !== 'number' ||
    typeof data.thongKe !== 'object' ||
    data.thongKe === null
  )
    throw new UnexpectedResponseError(200);
  return data;
}

export async function getAdminLeaveRequest(
  id: string,
  signal?: AbortSignal,
): Promise<AdminLeaveDetail> {
  const data = await request<AdminLeaveDetail>(
    `/admin/leave-requests/${encodeURIComponent(id)}`,
    { signal },
  );
  if (typeof data?.yeuCauNghiPhepId !== 'string')
    throw new UnexpectedResponseError(200);
  return data;
}

/** Từ chối một yêu cầu `ChoDuyet`; `lyDo` bắt buộc 1–255 ký tự (Q27c). 200 khi thành công; 409 `YEU_CAU_DA_XU_LY` nếu Admin khác xử lý trước. */
export function rejectAdminLeaveRequest(
  id: string,
  lyDo: string,
): Promise<{ yeuCauNghiPhepId: string; trangThai: LeaveStatus }> {
  return request(`/admin/leave-requests/${encodeURIComponent(id)}/reject`, {
    method: 'POST',
    json: { lyDo },
  });
}
