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
  signal?: AbortSignal,
): Promise<ReceptionPaged<ReceptionDoctor>> {
  const data = await request<ReceptionPaged<ReceptionDoctor>>(
    '/reception/doctor-schedules/doctors',
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
  ca?: ShiftCode;
}

export async function getReceptionGrid(
  query: ReceptionGridQuery,
  signal?: AbortSignal,
): Promise<ReceptionGrid> {
  const data = await request<ReceptionGrid>('/reception/doctor-schedules', {
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
