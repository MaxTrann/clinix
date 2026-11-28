import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateBy,
  ValidateIf,
} from 'class-validator';
import { PageQueryDto } from '../../common/paging/page-query.dto.js';
import { ARTICLE_LIMITS } from '../article.constants.js';
import {
  contentIssue,
  isValidTitle,
  normalizeContent,
  normalizeSummary,
  normalizeTitle,
  summaryIssue,
} from '../common/article-content.rules.js';
import { ARTICLE_FIELD_ERRORS as FIELD } from '../common/article-errors.js';
import {
  normalizeHashtag,
  normalizeHashtagList,
} from '../common/hashtag-name.js';
import {
  TRANG_THAI_BAI_VIET,
  type TrangThaiBaiViet,
} from '../entities/enums.js';

// DTO của API quản trị bài viết (PLAN article 5.7, 5.8). Mã lỗi của từng trường là `message` của ràng buộc (nếp admin) nên `loi[{truong, ma}]` mang đúng mã ổn định.
// Tiêu đề, mô tả, nội dung được CHUẨN HOÁ ở `@Transform` (chạy trước ràng buộc) rồi mới kiểm; thẻ chỉ kiểm ở đây, service chuẩn hoá lại để dùng.

/** Ràng buộc tự viết trên một hàm thuần; `message` là mã lỗi ổn định. */
const rule = (
  name: string,
  message: string,
  test: (value: unknown) => boolean,
): PropertyDecorator =>
  ValidateBy({
    name,
    validator: { validate: test, defaultMessage: () => message },
  });

const present = (_object: unknown, value: unknown): boolean =>
  value !== undefined;

const toTitle = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? normalizeTitle(value) : value;
const toSummary = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? normalizeSummary(value) : value;
const toContent = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? normalizeContent(value) : value;

const validTitle = (value: unknown): boolean =>
  typeof value === 'string' && isValidTitle(value);
const summaryNotInvalid = (value: unknown): boolean =>
  typeof value === 'string' && summaryIssue(value) !== FIELD.INVALID_SUMMARY;
const summaryNotTooLong = (value: unknown): boolean =>
  typeof value !== 'string' || summaryIssue(value) !== FIELD.SUMMARY_TOO_LONG;
const contentNotInvalid = (value: unknown): boolean =>
  typeof value === 'string' && contentIssue(value) !== FIELD.INVALID_CONTENT;
const contentNotTooLong = (value: unknown): boolean =>
  typeof value !== 'string' || contentIssue(value) !== FIELD.CONTENT_TOO_LONG;
const validStatus = (value: unknown): boolean =>
  typeof value === 'string' &&
  (TRANG_THAI_BAI_VIET as readonly string[]).includes(value);
/** Mảng thẻ hợp lệ: là mảng, mỗi phần tử là chuỗi chuẩn hoá được. */
const tagsValid = (value: unknown): boolean =>
  Array.isArray(value) &&
  value.every(
    (item: unknown) =>
      typeof item === 'string' && normalizeHashtag(item) !== null,
  );
/** Trần thô của mảng gửi lên (chặn mảng khổng lồ); bản đếm theo thẻ KHÁC NHAU nằm ở `tagsCountOk`. */
const tagsRawCountOk = (value: unknown): boolean =>
  !Array.isArray(value) || value.length <= ARTICLE_LIMITS.hashtagsRawMax;
/** Tối đa 10 thẻ khác nhau SAU khi bỏ trùng (Ho và ho là một). Phần tử sai để ràng buộc `tagsValid` báo. */
const tagsCountOk = (value: unknown): boolean => {
  if (!Array.isArray(value)) return true;
  const result = normalizeHashtagList(value as string[]);
  return result.ok || result.error !== FIELD.TOO_MANY_TAGS;
};

/** Id bài viết: số nguyên dương trong khoảng BIGINT, viết dạng chuỗi (sai dạng ⇒ 400, không tồn tại ⇒ 404; nếp `specialties`). */
const validBigintId = (value: unknown): boolean =>
  typeof value === 'string' &&
  /^[1-9]\d{0,18}$/.test(value) &&
  BigInt(value) <= 9223372036854775807n;

export class ArticleIdDto {
  @rule('isArticleId', FIELD.INVALID_ARTICLE_ID, validBigintId)
  id!: string;
}

export class CreateArticleDto {
  @Transform(toTitle)
  @rule('isArticleTitle', FIELD.INVALID_TITLE, validTitle)
  tieuDe!: string;

  /** Rỗng hay `null` thành NULL. */
  @IsOptional()
  @Transform(toSummary)
  @rule('isSummaryClean', FIELD.INVALID_SUMMARY, summaryNotInvalid)
  @rule('isSummaryShort', FIELD.SUMMARY_TOO_LONG, summaryNotTooLong)
  moTaNgan?: string | null;

  @Transform(toContent)
  @rule('isContentClean', FIELD.INVALID_CONTENT, contentNotInvalid)
  @rule('isContentShort', FIELD.CONTENT_TOO_LONG, contentNotTooLong)
  noiDung!: string;

  @rule('isHashtagList', FIELD.INVALID_TAG, tagsValid)
  @rule('isHashtagRawCount', FIELD.TOO_MANY_TAGS, tagsRawCountOk)
  @rule('isHashtagCount', FIELD.TOO_MANY_TAGS, tagsCountOk)
  hashtag!: string[];

  /** Tạo thẳng `LuuTruAn` bị service từ chối bằng 400 `TRANG_THAI_KHONG_HOP_LE` (MH1). */
  @rule('isArticleStatus', FIELD.INVALID_STATUS, validStatus)
  trangThai!: TrangThaiBaiViet;
}

/** `PATCH`: khoá vắng = giữ nguyên; `hashtag` có mặt = thay toàn bộ; `moTaNgan` rỗng hay `null` = xoá mô tả. Thân rỗng bị service từ chối. */
export class UpdateArticleDto {
  @ValidateIf(present)
  @Transform(toTitle)
  @rule('isArticleTitle', FIELD.INVALID_TITLE, validTitle)
  tieuDe?: string;

  @IsOptional()
  @Transform(toSummary)
  @rule('isSummaryClean', FIELD.INVALID_SUMMARY, summaryNotInvalid)
  @rule('isSummaryShort', FIELD.SUMMARY_TOO_LONG, summaryNotTooLong)
  moTaNgan?: string | null;

  @ValidateIf(present)
  @Transform(toContent)
  @rule('isContentClean', FIELD.INVALID_CONTENT, contentNotInvalid)
  @rule('isContentShort', FIELD.CONTENT_TOO_LONG, contentNotTooLong)
  noiDung?: string;

  @ValidateIf(present)
  @rule('isHashtagList', FIELD.INVALID_TAG, tagsValid)
  @rule('isHashtagRawCount', FIELD.TOO_MANY_TAGS, tagsRawCountOk)
  @rule('isHashtagCount', FIELD.TOO_MANY_TAGS, tagsCountOk)
  hashtag?: string[];

  @ValidateIf(present)
  @rule('isArticleStatus', FIELD.INVALID_STATUS, validStatus)
  trangThai?: TrangThaiBaiViet;
}

const trimQuery = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Danh sách quản trị: `q` khớp tiêu đề, `trangThai`, `the` (một thẻ), phân trang mặc định 20, tối đa 100. */
export class ArticleListQueryDto extends PageQueryDto {
  @IsOptional()
  @Transform(trimQuery)
  @IsString({ message: FIELD.INVALID_KEYWORD })
  @MaxLength(ARTICLE_LIMITS.queryMax, { message: FIELD.INVALID_KEYWORD })
  q?: string;

  @ValidateIf(present)
  @IsIn(TRANG_THAI_BAI_VIET, { message: FIELD.INVALID_STATUS })
  trangThai?: TrangThaiBaiViet;

  @ValidateIf(present)
  @rule(
    'isHashtagFilter',
    FIELD.INVALID_TAG,
    (value) => typeof value === 'string' && normalizeHashtag(value) !== null,
  )
  the?: string;
}

/** Gợi ý thẻ khi gõ: `q` là tiền tố (tuỳ chọn), `limit` 1 đến 10 (mặc định 10). */
export class HashtagSuggestQueryDto {
  @IsOptional()
  @Transform(trimQuery)
  @IsString({ message: FIELD.INVALID_KEYWORD })
  @MaxLength(ARTICLE_LIMITS.queryMax, { message: FIELD.INVALID_KEYWORD })
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ARTICLE_LIMITS.suggestMax)
  limit: number = ARTICLE_LIMITS.suggestMax;
}
