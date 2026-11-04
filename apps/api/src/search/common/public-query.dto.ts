import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { escapeLikePattern } from '../../common/paging/like-pattern.js';
import { PageQueryDto } from '../../common/paging/page-query.dto.js';
import {
  SEARCH_ERROR_CODES,
  SEARCH_QUERY_MAX_LENGTH,
} from '../search.constants.js';

/** Từ khoá `q` (0–100 ký tự sau khi cắt khoảng trắng hai đầu) + phân trang. DTO của từng endpoint kế thừa lớp này. */
export class PublicQueryDto extends PageQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: SEARCH_ERROR_CODES.INVALID_KEYWORD })
  @MaxLength(SEARCH_QUERY_MAX_LENGTH, {
    message: SEARCH_ERROR_CODES.INVALID_KEYWORD,
  })
  q?: string;

  /** Mẫu cho `LIKE ? ESCAPE '!'`; `null` khi không có từ khoá. Luôn truyền bằng tham số, không nối chuỗi SQL. */
  get likePattern(): string | null {
    return this.q ? `%${escapeLikePattern(this.q)}%` : null;
  }
}
