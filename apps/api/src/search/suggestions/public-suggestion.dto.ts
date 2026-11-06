import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import type { ChucDanhBacSi } from '../../admin/entities/enums.js';
import { escapeLikePattern } from '../../common/paging/like-pattern.js';
import {
  SEARCH_ERROR_CODES,
  SEARCH_QUERY_MAX_LENGTH,
} from '../search.constants.js';

/** Query của `GET /public/suggestions`: chỉ có `q` (0–100 ký tự sau khi cắt khoảng trắng); không phân trang. Tham số lạ bị ValidationPipe từ chối. */
export class PublicSuggestionQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: SEARCH_ERROR_CODES.INVALID_KEYWORD })
  @MaxLength(SEARCH_QUERY_MAX_LENGTH, {
    message: SEARCH_ERROR_CODES.INVALID_KEYWORD,
  })
  q?: string;

  /** Mẫu cho `LIKE ? ESCAPE '!'`; `null` khi không có từ khoá. Luôn truyền bằng tham số. */
  get likePattern(): string | null {
    return this.q ? `%${escapeLikePattern(this.q)}%` : null;
  }
}

/** Gợi ý ô tìm tổng (PLAN search 5.5, Q20): mỗi nhóm ≤ 5 phần tử, chỉ dữ liệu công khai. */
export interface PublicSuggestions {
  chuyenKhoa: { chuyenKhoaId: string; ten: string }[];
  dichVu: { dichVuKhamId: string; ten: string }[];
  bacSi: { bacSiId: string; hoTen: string; chucDanh: ChucDanhBacSi }[];
}
