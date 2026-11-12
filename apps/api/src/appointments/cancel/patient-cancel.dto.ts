import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import {
  CANCEL_REASON_MAX_LENGTH,
  type BOOKING_ERROR_CODES,
} from '../appointments.constants.js';
import type { RefundAmount } from './cancel.types.js';

// Thân và kết quả của hai route huỷ của Bệnh nhân (task B10; PLAN booking 5.6, 5.9, Q18, Q27; TRACKING 3.23 B10-G). Hình dạng `mocApDung` và `lyDoKhongHuy` là `[đề xuất]`, `[cần điền]`: F2 và Figma 421:2 chốt.

/**
 * Thân của `POST /patient/appointments/:maLichHen/cancel`. CHỈ `lyDo`, tuỳ chọn (Q27: giao diện không có ô nhập, nên thường vắng): cắt khoảng trắng hai đầu, rỗng sau khi cắt coi như VẮNG (dùng chữ hằng),
 * dài tối đa 255. Chủ sở hữu chỉ từ access token: `benhNhanId`, `trangThai`… hay khoá lạ khác là 400 `TRUONG_KHONG_DUOC_PHEP` (`forbidNonWhitelisted`).
 */
export class PatientCancelDto {
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const text = value.trim();
    return text === '' ? undefined : text;
  })
  @IsOptional()
  @IsString()
  @MaxLength(CANCEL_REASON_MAX_LENGTH)
  lyDo?: string;
}

/** Số hoàn DỰ KIẾN của `cancel-preview`: `RefundAmount` cộng mốc đã áp dụng (`so_gio_truoc_toi_thieu`, `null` khi không mốc nào hay đã quá giờ hẹn). */
export interface RefundPreview extends RefundAmount {
  mocApDung: number | null;
}

/**
 * `choPhepHuy = false` ⇒ có `lyDoKhongHuy` và `hoanCoc` là `null`. `choPhepHuy = true` ⇒ không có `lyDoKhongHuy`; `hoanCoc` là `null` khi chưa thu đồng nào (cọc 0đ, hay `ChoThanhToan` chưa thanh toán,
 * Q45: "Không hoàn"). Số này là "dự kiến" (Q18): số thực tế tính lại lúc xác nhận.
 */
export interface CancelPreview {
  choPhepHuy: boolean;
  lyDoKhongHuy?: typeof BOOKING_ERROR_CODES.NOT_CANCELLABLE;
  hoanCoc: RefundPreview | null;
}

/** Kết quả của `POST …/cancel`: đúng ba khoá. `hoanCoc` là số THỰC TẾ (Q18), `null` khi chưa thu đồng nào. */
export interface PatientCancelResult {
  maLichHen: string;
  trangThai: 'DaHuy';
  hoanCoc: RefundAmount | null;
}
