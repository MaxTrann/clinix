import { IsOptional, IsString } from 'class-validator';

// Thân và kết quả của `POST /admin/doctor-ratings/:id/hide` (doctor-exam B8; PLAN 5.8, 5.11; Q8; KDD-05, KDD-06).

/**
 * Thân: DTO CHỈ ĐÁNH DẤU trường (X1 M9: mã `LY_DO_*` do `validateHideReason` quyết, không phải DTO). `lyDo` vắng hoặc `null` hợp lệ ở DTO để `rules` báo `LY_DO_BAT_BUOC`;
 * không phải chuỗi (số, mảng, đối tượng, `true`) ⇒ 400 mã tự sinh `IS_STRING` (nếp `nhanXet` của B6 và `capNhatLanCuoi` của B2: lỗi lập trình, không phải việc người dùng gõ).
 * Khoá lạ (`biAn`, `bacSiId`, `danhGiaId`, `nhanXet`, `lichHenId`…) bị `forbidNonWhitelisted` từ chối bằng `TRUONG_KHONG_DUOC_PHEP`: người ẩn chỉ lấy từ access token, đánh giá chỉ lấy từ đường dẫn.
 */
export class HideRatingDto {
  @IsOptional()
  @IsString()
  lyDo?: string | null;
}

/** 200: đánh giá vừa ẩn. `danhGiaId` là BIGINT dạng CHUỖI (id từ đường dẫn đã qua `ParseRecordIdPipe`). */
export interface HiddenRatingView {
  danhGiaId: string;
  biAn: true;
}
