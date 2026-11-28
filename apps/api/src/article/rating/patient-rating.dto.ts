import { IsIn } from 'class-validator';
import { ARTICLE_FIELD_ERRORS as FIELD } from '../common/article-errors.js';
import type { RatingTotals } from '../common/rating-counts.js';
import {
  LOAI_DANH_GIA_BAI_VIET,
  type LoaiDanhGiaBaiViet,
} from '../entities/enums.js';

// DTO và kiểu ra của API đánh giá bài viết (article B3; PLAN article 5.7, 5.8). Mã lỗi của trường là `message` của ràng buộc (nếp admin và search):
// `loi[{ truong: 'loai', ma: 'LOAI_DANH_GIA_KHONG_HOP_LE' }]`. Khoá lạ ở thân (nhất là `benhNhanId`) bị `forbidNonWhitelisted` của ValidationPipe toàn cục từ chối:
// chủ phiếu CHỈ lấy từ access token, không từ thân hay query (ABR-01, ABR-06).

/** Thân của `PUT /patient/articles/:id/rating`. `loai` vắng, `null`, không phải chuỗi hay khác hai giá trị (kể cả sai hoa thường) đều là `LOAI_DANH_GIA_KHONG_HOP_LE`. */
export class PutRatingDto {
  @IsIn(LOAI_DANH_GIA_BAI_VIET, { message: FIELD.INVALID_RATING_TYPE })
  loai!: LoaiDanhGiaBaiViet;
}

/** `GET`: phiếu của CHÍNH người gọi (`null` = chưa đánh giá). Đúng một khoá, không lộ ai khác. */
export interface RatingChoice {
  loai: LoaiDanhGiaBaiViet | null;
}

/** `PUT` và `DELETE`: loại phiếu sau khi ghi (`null` sau khi thu hồi) kèm tổng lượt do máy chủ tính. */
export interface RatingResult extends RatingTotals {
  loai: LoaiDanhGiaBaiViet | null;
}
