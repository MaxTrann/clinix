import { IsOptional, IsString } from 'class-validator';
import type { ChucDanhBacSi } from '../../admin/entities/enums.js';
import type { CaLamViec } from '../../scheduling/branch-hours/branch-hours.types.js';
import type { EMPTY_REASONS } from './suggestion.constants.js';

/**
 * Query của `GET /chatbot/suggestions` (PLAN chatbot 5.12). Ở đây chỉ kiểm "là chuỗi" (tham số lặp thành mảng bị từ chối, trường lạ bị
 * `ValidationPipe` toàn cục từ chối). Kiểu và miền của từng trường kiểm ở `parseSuggestionQuery` để trả 400 `BO_LOC_KHONG_HOP_LE`
 * kèm `loi[]`, kể cả khi thiếu `chuyenKhoaId` (nên ở đây trường đó cũng `@IsOptional`).
 */
export class SuggestionQueryDto {
  @IsOptional() @IsString() chuyenKhoaId?: string;
  @IsOptional() @IsString() chiNhanhId?: string;
  @IsOptional() @IsString() ngay?: string;
  @IsOptional() @IsString() ca?: string;
}

export type EmptyReason = (typeof EMPTY_REASONS)[number];

/** Một ô giờ trống. `batDau` là ISO 8601 UTC như `GET /public/doctor-slots`; luôn là ô `ConTrong` nên không có trạng thái. */
export interface SuggestedSlot {
  khungGioId: string;
  batDau: string;
  ca: CaLamViec;
}

/**
 * Một bác sĩ được gợi ý. Danh sách trắng: KHÔNG học vị, số năm kinh nghiệm, điểm xếp hạng, email, số điện thoại, ngày sinh, địa chỉ cá nhân.
 * `danhGia` là điểm RIÊNG của bác sĩ (đã công khai ở search), không phải điểm xếp hạng. `giaKham` là chuỗi tiền đã cộng phụ phí.
 */
export interface SuggestedDoctor {
  bacSiId: string;
  hoTen: string;
  chucDanh: ChucDanhBacSi;
  chiNhanh: { chiNhanhId: string; ten: string; diaChi: string };
  giaKham: string;
  danhGia: { diemTrungBinh: string | null; soDanhGia: number };
  khungGio: SuggestedSlot[];
}

/** Thân 200. `ngay` là `null` khi không truyền ngày mà 7 ngày đều không có ô, hoặc khi chuyên khoa chưa có bác sĩ. `lyDoRong` chỉ có khi `bacSi` rỗng. */
export interface SuggestionResponse {
  chuyenKhoa: { chuyenKhoaId: string; ten: string };
  ngay: string | null;
  bacSi: SuggestedDoctor[];
  lyDoRong?: EmptyReason;
}
