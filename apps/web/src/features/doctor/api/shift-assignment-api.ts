import { request } from '../../../shared/api/client';
import { UnexpectedResponseError } from '../../../shared/api/errors';
import type { ShiftCode } from '../../../shared/schedule/shift-labels';

// Hợp đồng `POST /admin/doctor-shifts[/preview]` và `DELETE /admin/doctor-shifts/:id` (PLAN doctor B2, B3, B4). Chỉ Quản trị viên.
// Quy tắc lặp: nhiều bác sĩ × khoảng ngày × thứ trong tuần × ca. Không có "ghi chú" (Q10).
export interface ShiftRule {
  bacSiIds: string[];
  tuNgay: string;
  denNgay: string;
  // 1 = thứ Hai … 7 = Chủ nhật
  thuTrongTuan: number[];
  cas: ShiftCode[];
}

// Chi tiết của MỘT vi phạm (tuỳ mã): `thuTrongTuan` có với mọi mã của luật giờ ca; `khoang` chỉ có với CA_KHONG_TON_TAI.
export interface ViolationDetail {
  thuTrongTuan?: number;
  khoang?: {
    sang: { tu: string; den: string } | null;
    chieu: { tu: string; den: string } | null;
  };
}

export interface ShiftViolation {
  bacSiId: string;
  ngay: string;
  ca: ShiftCode;
  maLoi: string;
  chiTiet?: ViolationDetail;
}

export interface ShiftPreview {
  soCa: number;
  soKhungGio: number;
  // Tổng số vi phạm; `viPham` chỉ liệt kê tối đa 50 cái đầu
  tongSoViPham: number;
  viPham: ShiftViolation[];
}

export interface ShiftAssignmentResult {
  soCa: number;
  soKhungGio: number;
  theoBacSi: { bacSiId: string; soCa: number }[];
}

// Giới hạn của DTO phía server (PLAN 5.3 bước 1); chép sang đây để chặn sớm, server vẫn là nơi quyết định cuối.
export const MAX_DOCTORS_PER_RULE = 20;
export const MAX_RULE_RANGE_DAYS = 92;

export async function previewShiftRule(
  rule: ShiftRule,
  signal?: AbortSignal,
): Promise<ShiftPreview> {
  const data = await request<ShiftPreview>('/admin/doctor-shifts/preview', {
    method: 'POST',
    json: rule,
    signal,
  });
  if (
    typeof data !== 'object' ||
    data === null ||
    typeof data.soCa !== 'number' ||
    !Array.isArray(data.viPham)
  )
    throw new UnexpectedResponseError(200);
  return data;
}

export function assignShiftRule(
  rule: ShiftRule,
): Promise<ShiftAssignmentResult> {
  return request<ShiftAssignmentResult>('/admin/doctor-shifts', {
    method: 'POST',
    json: rule,
  });
}

/** Gỡ MỘT ca và mọi khung giờ của nó (Q8); 204. */
export function removeShift(lichLamViecId: string): Promise<void> {
  return request<void>(`/admin/doctor-shifts/${lichLamViecId}`, {
    method: 'DELETE',
  });
}
