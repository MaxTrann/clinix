import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateBy,
} from 'class-validator';
import { PATIENT_FIELD_ERROR_CODES } from '../../patient/patient.constants.js';
import {
  isValidKeyword,
  normalizeKeyword,
} from '../../patient/validation/keyword-policy.js';
import type { ListFilterValue } from '../read/conversation-read.service.js';

// Dữ liệu vào của API đọc chat (chat B2; PLAN chat 5.6, T8). Không DTO nào có `taiKhoanId`, `chiNhanhId`: tài khoản lấy từ token, chi nhánh Lễ tân đọc ở DB;
// gửi trường lạ là 400 `TRUONG_KHONG_DUOC_PHEP` do `forbidNonWhitelisted` của ValidationPipe toàn cục.

/** Id BIGINT dạng chuỗi số dương (con trỏ, id tin). Sai dạng ở query hay thân là 400 (khác id trên đường dẫn: 404). */
const ID_PATTERN = /^[1-9]\d{0,18}$/;

export const LIST_FILTERS = [
  'tat-ca',
  'chua-doc',
  'bac-si',
  'le-tan',
] as const satisfies readonly ListFilterValue[];

/** Trang 20 hội thoại, tối đa 50; trang 30 tin, tối đa 100 (T8, PLAN 5.6). */
export const CONVERSATION_PAGE_DEFAULT = 20;
export const CONVERSATION_PAGE_MAX = 50;
export const MESSAGE_PAGE_DEFAULT = 30;
export const MESSAGE_PAGE_MAX = 100;

/** `GET /chat/conversations?loc=&q=&truoc=&limit=`. `bac-si`, `le-tan` chỉ cho Bệnh nhân; `q` chỉ cho Bác sĩ, Lễ tân (service kiểm theo vai trò). */
export class ConversationListQueryDto {
  @IsOptional()
  @IsIn(LIST_FILTERS)
  loc: ListFilterValue = 'tat-ca';

  // Cùng luật từ khoá với tra cứu hồ sơ (patient B6): chuẩn hoá trước khi kiểm; MỌI lỗi của `q` ra đúng một `{ truong: 'q', ma: 'TU_KHOA_KHONG_HOP_LE' }`
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeKeyword(value) : value,
  )
  @ValidateBy({
    name: 'isLookupKeyword',
    validator: {
      validate: (value: unknown) =>
        typeof value === 'string' && isValidKeyword(value),
      defaultMessage: () => PATIENT_FIELD_ERROR_CODES.INVALID_KEYWORD,
    },
  })
  q?: string;

  @IsOptional()
  @Matches(ID_PATTERN)
  truoc?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(CONVERSATION_PAGE_MAX)
  limit: number = CONVERSATION_PAGE_DEFAULT;
}

/** `GET /chat/conversations/:id/messages?truoc=&sau=&limit=`; `truoc` và `sau` không dùng cùng lúc (service kiểm). */
export class MessagesQueryDto {
  @IsOptional()
  @Matches(ID_PATTERN)
  truoc?: string;

  @IsOptional()
  @Matches(ID_PATTERN)
  sau?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MESSAGE_PAGE_MAX)
  limit: number = MESSAGE_PAGE_DEFAULT;
}

/** Thân của `POST /chat/conversations/:id/read`: id tin là CHUỖI (BIGINT có thể lớn hơn 2^53). */
export class MarkReadDto {
  @IsString()
  @Matches(ID_PATTERN)
  tinNhanId!: string;
}
