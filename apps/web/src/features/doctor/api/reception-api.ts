import { request } from '../../../shared/api/client';
import { UnexpectedResponseError } from '../../../shared/api/errors';
import type { ShiftCode } from '../../../shared/schedule/shift-labels';

// Hợp đồng `GET /reception/doctor-schedules[/doctors]` (PLAN doctor B8) và `GET /profile` (patient F4). Lễ tân chỉ XEM: không có lời gọi ghi nào.
// Phạm vi chi nhánh do server quyết (đọc hồ sơ Lễ tân mỗi lần gọi); web không gửi chi nhánh. Không có `soLichHen` (Q18) và không có lý do nghỉ (Q16).
export type ReceptionLeaveState = 'DaDuyet' | 'ChoDuyet';

export interface ReceptionDoctor {
  bacSiId: string;
  hoTen: string;
  ngungHoatDong: boolean;
  chiNhanh: { chiNhanhId: string; ten: string };
  chuyenKhoa: { chuyenKhoaId: string; ten: string };
}

export interface ReceptionShift {
  lichLamViecId: string;
  // Chi nhánh GHI TRÊN CA (Admin Toàn hệ thống thấy ca ở nhiều chi nhánh)
  chiNhanh?: { chiNhanhId: string; ten: string };
  ngay: string;
  ca: ShiftCode;
  batDau: string | null;
  ketThuc: string | null;
  gioCaKhongCon: boolean;
  // Lễ tân không thấy yêu cầu `TuChoi` (Q16)
  nghiPhep: ReceptionLeaveState | null;
}

export interface ReceptionDoctorRow extends ReceptionDoctor {
  ca: ReceptionShift[];
}

export interface ReceptionPaged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ReceptionGrid extends ReceptionPaged<ReceptionDoctorRow> {
  tuNgay: string;
  denNgay: string;
}

// Lưới của Lễ tân (B8) và của Quản trị viên (B9) cùng hình dạng (cùng lõi `ScheduleGridService` ở server): hai nguồn khác nhau ở đường dẫn,
// phạm vi và mã lỗi, còn giao diện dùng chung (doctor F5, F6).
export type GridSource = 'reception' | 'admin';
const BASE_PATHS: Record<GridSource, string> = {
  reception: '/reception/doctor-schedules',
  admin: '/admin/doctor-shifts',
};

// Danh sách chọn bác sĩ/chuyên khoa lấy một lần (tối đa 100 bác sĩ của chi nhánh); lưới phân trang 50 bác sĩ mỗi trang.
export const DOCTOR_OPTIONS_PAGE_SIZE = 100;
export const GRID_PAGE_SIZE = 50;

function assertPaged(data: unknown): void {
  if (
    typeof data !== 'object' ||
    data === null ||
    !Array.isArray((data as ReceptionPaged<unknown>).items) ||
    typeof (data as ReceptionPaged<unknown>).total !== 'number'
  )
    throw new UnexpectedResponseError(200);
}

export async function listReceptionDoctors(
  source: GridSource,
  signal?: AbortSignal,
): Promise<ReceptionPaged<ReceptionDoctor>> {
  const data = await request<ReceptionPaged<ReceptionDoctor>>(
    `${BASE_PATHS[source]}/doctors`,
    { query: { page: 1, pageSize: DOCTOR_OPTIONS_PAGE_SIZE }, signal },
  );
  assertPaged(data);
  return data;
}

export interface ReceptionGridQuery {
  tuNgay: string;
  denNgay: string;
  page: number;
  bacSiId?: string;
  chuyenKhoaId?: string;
  // Chỉ Quản trị viên Toàn hệ thống: Lễ tân gửi lên là 400; Admin Chi nhánh bị ép chi nhánh của mình ở server
  chiNhanhId?: string;
  ca?: ShiftCode;
}

export async function getReceptionGrid(
  source: GridSource,
  query: ReceptionGridQuery,
  signal?: AbortSignal,
): Promise<ReceptionGrid> {
  const data = await request<ReceptionGrid>(BASE_PATHS[source], {
    query: { ...query, pageSize: GRID_PAGE_SIZE },
    signal,
  });
  assertPaged(data);
  return data;
}

/** Tên chi nhánh của Lễ tân (chip "CLINIX Chi nhánh Quận 3"); lỗi thì không có chip, không chặn trang. */
export async function getReceptionBranchName(
  signal?: AbortSignal,
): Promise<string | null> {
  const profile = await request<{ chiNhanh?: { ten?: string } | null }>(
    '/profile',
    { signal },
  );
  return profile?.chiNhanh?.ten ?? null;
}

/** Số yêu cầu nghỉ đang chờ duyệt trong phạm vi của Quản trị viên (banner "Có N yêu cầu nghỉ chờ duyệt…", Figma `622:2`; WA-14). */
export async function countPendingLeaveRequests(
  signal?: AbortSignal,
): Promise<number> {
  const data = await request<{ total?: number }>('/admin/leave-requests', {
    query: { trangThai: 'ChoDuyet', page: 1, pageSize: 1 },
    signal,
  });
  if (typeof data?.total !== 'number') throw new UnexpectedResponseError(200);
  return data.total;
}
