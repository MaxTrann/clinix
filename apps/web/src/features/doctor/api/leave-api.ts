import { request } from '../../../shared/api/client';
import { UnexpectedResponseError } from '../../../shared/api/errors';
import type { ShiftCode } from '../../../shared/schedule/shift-labels';

// Hợp đồng `POST/GET /doctor/leave-requests` (PLAN doctor B11, B12). Bác sĩ chỉ thấy yêu cầu của chính mình; không có route huỷ (Q23).
export type LeaveKind = 'CaNgay' | 'TheoCa';
export type LeaveStatus = 'ChoDuyet' | 'DaDuyet' | 'TuChoi';

export interface CreateLeaveInput {
  hinhThuc: LeaveKind;
  tuNgay: string;
  denNgay: string;
  // Chỉ gửi khi `TheoCa`; `CaNgay` mà có `ca` là 400 `CA_KHONG_DUOC_CHON`
  ca?: ShiftCode;
  lyDo: string;
}

export interface CreatedLeave {
  yeuCauNghiPhepId: string;
  trangThai: LeaveStatus;
  hinhThuc: LeaveKind;
  tuNgay: string;
  denNgay: string;
  ca: ShiftCode | null;
  soCaBiAnhHuong: number;
}

// Một yêu cầu ở danh sách và chi tiết (cùng hình dạng). Không có người xử lý và không có lý do từ chối (Q27, TECH_DEBT).
export interface LeaveRequest {
  yeuCauNghiPhepId: string;
  trangThai: LeaveStatus;
  hinhThuc: LeaveKind;
  tuNgay: string;
  denNgay: string;
  ca: ShiftCode | null;
  lyDo: string;
  // ISO 8601 UTC
  thoiDiemTao: string;
  thoiDiemXuLy: string | null;
}

export interface LeavePage {
  items: LeaveRequest[];
  total: number;
  page: number;
  pageSize: number;
}

export const LEAVE_PAGE_SIZE = 5;

export function createLeaveRequest(
  input: CreateLeaveInput,
): Promise<CreatedLeave> {
  return request<CreatedLeave>('/doctor/leave-requests', {
    method: 'POST',
    json: input,
  });
}

export async function listLeaveRequests(
  query: { trangThai?: LeaveStatus; page: number },
  signal?: AbortSignal,
): Promise<LeavePage> {
  const data = await request<LeavePage>('/doctor/leave-requests', {
    query: {
      trangThai: query.trangThai,
      page: query.page,
      pageSize: LEAVE_PAGE_SIZE,
    },
    signal,
  });
  // Phản hồi 2xx sai hình dạng: báo lỗi chung thay vì để giao diện vỡ giữa chừng
  if (
    typeof data !== 'object' ||
    data === null ||
    !Array.isArray(data.items) ||
    typeof data.total !== 'number'
  )
    throw new UnexpectedResponseError(200);
  return data;
}
