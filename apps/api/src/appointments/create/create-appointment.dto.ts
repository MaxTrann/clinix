import { Transform } from 'class-transformer';
import { IsOptional, ValidateBy } from 'class-validator';
import { BOOKING_FIELD_ERROR_CODES } from '../appointments.constants.js';
import { BookingChecksDto } from './booking-checks.dto.js';
import {
  isValidVisitReason,
  normalizeVisitReason,
} from './visit-reason.rules.js';

// Thân và kết quả của `POST /booking/appointments` (task B8; PLAN booking 5.9, Q9; TRACKING 3.21 B8-G). Hình dạng là `[đề xuất]` đã duyệt ngày 11/11/2026.

/**
 * Thân: `khungGioId` và `hoSoNguoiThanId` THỪA KẾ nguyên ràng buộc của `BookingChecksDto` (một chỗ định nghĩa id BIGINT dạng chuỗi), thêm `lyDoKham` (tuỳ chọn, Q9). Chủ sở hữu lấy từ access token
 * (QB-03, DL-25): `benhNhanId`, `bacSiId`, `chiNhanhId`, `dichVuKhamId`, `trangThai` và mọi khoá lạ là 400 `TRUONG_KHONG_DUOC_PHEP` (`forbidNonWhitelisted`).
 * `lyDoKham` sai ⇒ 400 `DU_LIEU_KHONG_HOP_LE` với `loi[].ma` = `LY_DO_KHAM_KHONG_HOP_LE` (`message` của ràng buộc là mã trường, cùng cách `q` ở `lists/list-query.decorators.ts`).
 */
export class CreateAppointmentDto extends BookingChecksDto {
  /** Vắng, `null`, rỗng hay chỉ khoảng trắng ⇒ `null` sau chuẩn hoá (Q9: không bắt buộc). */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => normalizeVisitReason(value))
  @ValidateBy({
    name: 'isVisitReason',
    validator: {
      validate: (value: unknown) => isValidVisitReason(value),
      defaultMessage: () => BOOKING_FIELD_ERROR_CODES.INVALID_VISIT_REASON,
    },
  })
  lyDoKham?: string | null;
}

/** Kết quả 201: đúng 7 khoá, KHÔNG có `lich_hen_id` hay id nội bộ nào (PLAN 5.9). */
export interface CreatedAppointment {
  maLichHen: string;
  trangThai: 'ChoThanhToan' | 'DaXacNhan';
  /** ISO 8601 UTC khi `ChoThanhToan`; `null` khi `DaXacNhan` (cọc 0đ xác nhận ngay) `[đề xuất]` */
  hanThanhToan: string | null;
  /** Chuỗi decimal: `gia_snapshot` */
  giaApDung: string;
  /** Chuỗi decimal: `tien_coc_snapshot` */
  tienCoc: string;
  /** `true` khi còn phải thanh toán cọc (`ChoThanhToan`) */
  canThanhToan: boolean;
  /** `nowVN().toISOString()` lấy SAU commit, giữ mili giây (như `checks`) */
  thoiGianMayChu: string;
}
