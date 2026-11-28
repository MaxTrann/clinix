import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { Paged } from '../../common/paging/paged.js';
import { ARTICLE_LIMITS, ARTICLE_PUBLIC } from '../article.constants.js';
import { ARTICLE_FIELD_ERRORS as FIELD } from '../common/article-errors.js';

// DTO của API công khai bài viết (article B2; PLAN article 5.7, MH10). Mã lỗi của từng trường là `message` của ràng buộc (nếp admin và search):
// `loi[{truong, ma}]` mang đúng mã ổn định. Khoá lạ trong query bị `forbidNonWhitelisted` của ValidationPipe toàn cục từ chối (TRUONG_KHONG_DUOC_PHEP).

/** Cắt khoảng trắng hai đầu và chuẩn hoá NFC (tiêu đề đã lưu ở NFC, T7); không phải chuỗi thì giữ nguyên để `@IsString` báo. */
const toKeyword = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().normalize('NFC') : value;

/**
 * Query của `GET /public/articles`: `q` (≤ 100 ký tự, khớp tiêu đề), `the` (MỘT thẻ; hai `the` là mảng nên `@IsString` từ chối), `page`, `pageSize` (mặc định 9, tối đa 30).
 * `the` sai dạng KHÔNG kiểm ở đây mà ở service để trả 400 `BO_LOC_KHONG_HOP_LE` (PLAN 5.7); ở đây chỉ kiểm là một chuỗi.
 */
export class PublicArticleListQueryDto {
  @IsOptional()
  @Transform(toKeyword)
  @IsString({ message: FIELD.INVALID_KEYWORD })
  @MaxLength(ARTICLE_LIMITS.queryMax, { message: FIELD.INVALID_KEYWORD })
  q?: string;

  @IsOptional()
  @IsString({ message: FIELD.INVALID_TAG })
  the?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ARTICLE_PUBLIC.pageSizeMax)
  pageSize: number = ARTICLE_PUBLIC.pageSizeDefault;

  get offset(): number {
    return (this.page - 1) * this.pageSize;
  }
}

/** Một bài ở danh sách công khai (danh sách trắng PLAN 5.7; không `noiDung`, không tác giả). `thoiDiemXuatBan` là chuỗi ISO UTC, null chỉ khi dữ liệu lệch (ABP-12). */
export interface PublicArticleItem {
  baiVietId: string;
  tieuDe: string;
  moTaNgan: string | null;
  anhDaiDien: string | null;
  thoiDiemXuatBan: string | null;
  hashtag: string[];
}

/** Chi tiết: như một phần tử danh sách, thêm `noiDung`. B3 CỘNG thêm `luotThich`, `luotKhongThich` (không đổi khoá cũ). */
export interface PublicArticleDetail extends PublicArticleItem {
  noiDung: string;
}

export type PublicArticlePage = Paged<PublicArticleItem>;

/** Thẻ phổ biến: tên và số bài đã xuất bản gắn thẻ. */
export interface PublicTagItem {
  ten: string;
  soBai: number;
}
