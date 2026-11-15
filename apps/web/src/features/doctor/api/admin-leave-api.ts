import { request } from '../../../shared/api/client';
import { UnexpectedResponseError } from '../../../shared/api/errors';
import type { ShiftCode } from '../../../shared/schedule/shift-labels';
import type { LeaveKind, LeaveStatus } from './leave-api';

// Hợp đồng `GET /admin/leave-requests[/:id]`, `POST …/reject`, `POST …/approve`, `POST …/retry-cancellations` (PLAN doctor B13–B17). Chỉ Quản trị viên.

/** Một dòng danh sách. Không có `lyDo` (thuộc chi tiết). `soLichHenBiAnhHuong` (B17): `null` với yêu cầu `TuChoi`. */
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
  soLichHenBiAnhHuong: number | null;
}

/** Một lịch hẹn bị ảnh hưởng (danh sách trắng của server: không SĐT, email, lý do khám). */
export interface AffectedAppointment {
  maLichHen: string;
  // ISO 8601 UTC
  thoiGian: string;
  trangThai: 'ChoThanhToan' | 'DaXacNhan';
  nguoiKham: { hoTen: string };
  // Chuỗi decimal; "0.00" = chưa đặt cọc
  tienCocSnapshot: string;
}

/** Hộp xác nhận Duyệt (Q32): `tong`, `soBenhNhan`, `soCoCoc` là số thật; `items` chỉ có tối đa 20 lịch đầu, `conNua` báo còn lịch chưa liệt kê. */
export interface AffectedAppointments {
  tong: number;
  soBenhNhan: number;
  soCoCoc: number;
  conNua: boolean;
  items: AffectedAppointment[];
}

export interface AdminLeaveDetail extends AdminLeaveItem {
  lyDo: string;
  // `null` với yêu cầu `TuChoi`
  lichHenBiAnhHuong: AffectedAppointments | null;
}

/** Kết quả bước huỷ lịch hẹn sau khi Duyệt hoặc Xử lý lại (B15, B16). */
export interface CancellationResult {
  // `false` = còn lịch chưa xử lý xong (lỗi bất ngờ): hiện "Xử lý lại"
  hoanTat: boolean;
  daHuy: number;
  daHuyTruocDo: number;
  khongHuyDuoc: { maLichHen: string; trangThai: string }[];
}

export interface ApprovalOutcome {
  yeuCauNghiPhepId: string;
  trangThai: 'DaDuyet';
  huyLichHen: CancellationResult;
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

function parseOutcome(data: ApprovalOutcome): ApprovalOutcome {
  if (
    typeof data?.huyLichHen !== 'object' ||
    data.huyLichHen === null ||
    typeof data.huyLichHen.daHuy !== 'number' ||
    !Array.isArray(data.huyLichHen.khongHuyDuoc)
  )
    throw new UnexpectedResponseError(200);
  return data;
}

/** Duyệt một yêu cầu `ChoDuyet`; không có thân. 200 kèm kết quả huỷ lịch hẹn (`hoanTat: false` vẫn là đã duyệt). 409 `YEU_CAU_DA_XU_LY` hoặc `YEU_CAU_NGHI_DA_QUA_HAN`. */
export async function approveAdminLeaveRequest(
  id: string,
): Promise<ApprovalOutcome> {
  const data = await request<ApprovalOutcome>(
    `/admin/leave-requests/${encodeURIComponent(id)}/approve`,
    { method: 'POST' },
  );
  return parseOutcome(data);
}

/** "Xử lý lại": chạy lại bước huỷ lịch hẹn của yêu cầu đã duyệt (idempotent). */
export async function retryAdminLeaveCancellations(
  id: string,
): Promise<ApprovalOutcome> {
  const data = await request<ApprovalOutcome>(
    `/admin/leave-requests/${encodeURIComponent(id)}/retry-cancellations`,
    { method: 'POST' },
  );
  return parseOutcome(data);
}
