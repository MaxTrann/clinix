import { IsOptional, IsString } from 'class-validator';
import type { CaLamViec } from '../../scheduling/branch-hours/branch-hours.types.js';
import type { StoredSlotStatus } from '../../scheduling/slots/slot-status.rules.js';

/**
 * Query của `GET /public/doctor-slots` (PLAN search 5.6). Ở đây chỉ kiểm "là chuỗi" (mảng do lặp tham số bị từ chối);
 * dạng và miền của `bacSiIds`, `ngay` kiểm ở `parseSlotQuery` để trả 400 `BO_LOC_KHONG_HOP_LE` kèm `loi[]`. Tham số lạ bị ValidationPipe từ chối.
 */
export class PublicSlotQueryDto {
  @IsOptional() @IsString() bacSiIds?: string;
  @IsOptional() @IsString() ngay?: string;
}

/** Trạng thái ngày công khai: `NghiPhep` của reader được gộp vào `KhongCoLich` (Đại chọn 17/11/2026: không lộ việc xin nghỉ phép). */
export type PublicDayStatus = 'CoLich' | 'KhongCoLich' | 'ChiNhanhNghi';

/** Một khung giờ công khai — danh sách trắng: không `giuChoDen`, không id lịch hẹn hay người đặt. `batDau`, `ketThuc` là ISO 8601 UTC. */
export interface PublicSlot {
  khungGioId: string;
  batDau: string;
  ketThuc: string;
  ca: CaLamViec;
  trangThai: StoredSlotStatus;
}

/** Khung giờ của MỘT bác sĩ trong ngày. `thuNghi` (thứ ISO 1 đến 7) chỉ có khi `ChiNhanhNghi`. */
export interface PublicDoctorSlots {
  bacSiId: string;
  trangThaiNgay: PublicDayStatus;
  thuNghi?: number;
  khungGio: PublicSlot[];
}

/** Thân 200: MỘT ngày, `items` đúng thứ tự `bacSiIds` đã bỏ trùng, mỗi id đúng một phần tử. */
export interface PublicSlotsResponse {
  ngay: string;
  items: PublicDoctorSlots[];
}
