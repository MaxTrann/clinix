import { Allow, IsOptional, IsString } from 'class-validator';
import type { ExamDetailRating } from '../patient-view/patient-exam-detail.dto.js';

// Thân và kết quả của `POST /patient/exam-records/:maLichHen/rating` (doctor-exam B6; PLAN 5.7, 5.11; Q7; DGB-02, DGB-10).

/**
 * Thân: DTO CHỈ ĐÁNH DẤU trường (X1 M9: `ValidationPipe` không phân biệt vắng với sai nên không dùng `@IsInt`/`@Min`: `"3"` hay `3.5` phải ra `SO_SAO_KHONG_HOP_LE`, không phải mã tự sinh).
 * Mọi quy tắc của `soSao` và `nhanXet` ở `validateRatingInput` (`rating.rules.ts`), TRƯỚC khi chạm DB. Khoá lạ (`bacSiId`, `biAn`, `lyDoAn`, `lichHenId`, `thoiDiemTao`, `benhNhanId`…) bị
 * `forbidNonWhitelisted` từ chối bằng `TRUONG_KHONG_DUOC_PHEP`: chủ sở hữu chỉ lấy từ access token, lịch chỉ lấy từ mã trên đường dẫn.
 */
export class RatingDto {
  /** `@Allow()` giữ trường qua `whitelist` mà không kiểm gì; kiểu `unknown` vì kiểu và miền ở `rules` */
  @Allow()
  soSao?: unknown;

  /** Tuỳ chọn: vắng hoặc `null` hợp lệ. Không phải chuỗi ⇒ 400 mã tự sinh `IS_STRING` (nếp `capNhatLanCuoi` của B2) */
  @IsOptional()
  @IsString()
  nhanXet?: string | null;
}

/** 201: đúng ba khoá của `danhGia` ở chi tiết của Bệnh nhân (B5): `soSao`, `nhanXet` (`null` khi bỏ trống), `thoiDiemTao` (ISO UTC). */
export type RatingView = ExamDetailRating;
