import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import type { Doan, SuggestedSpecialty } from '../answer/answer.types.js';
import type { LinkCode } from '../safety/canned-answers.js';
import {
  HISTORY_MAX_TURNS,
  type HistoryRole,
} from '../safety/question-normalizer.js';
import { FIELD_CODES } from './ask.constants.js';

// Hình dạng vào và ra của `POST /chatbot/messages` (chatbot B3; PLAN chatbot 5.12, 5.16). DTO CHỈ kiểm kiểu và số lượng, mỗi ràng buộc mang `message` = MÃ ổn định
// để `validationExceptionFactory` dùng nguyên mã làm `loi[].ma`. Độ dài chữ (1 đến 500 điểm mã, mỗi lượt 1 đến 800) kiểm ở `normalizeQuestion`, `normalizeHistory` của B1
// SAU khi cắt trắng và bỏ ký tự điều khiển (bước 2 của 5.4). Trường lạ bị `ValidationPipe` toàn cục từ chối như mọi route.

const HISTORY_ROLES: readonly HistoryRole[] = ['NguoiDung', 'TroLy'];
const HISTORY_INVALID = { message: FIELD_CODES.historyInvalid };

export class AskHistoryTurnDto {
  @IsIn(HISTORY_ROLES, HISTORY_INVALID) vai!: HistoryRole;
  @IsString(HISTORY_INVALID) noiDung!: string;
}

export class AskMessageDto {
  @IsString({ message: FIELD_CODES.questionEmpty }) cauHoi!: string;

  @IsOptional()
  @IsArray(HISTORY_INVALID)
  @ArrayMaxSize(HISTORY_MAX_TURNS, HISTORY_INVALID)
  @ValidateNested({ each: true, ...HISTORY_INVALID })
  @Type(() => AskHistoryTurnDto)
  lichSu?: AskHistoryTurnDto[];

  /** Chỉ cần là chuỗi; dạng không phải id BIGINT thì bị bỏ qua như chưa chọn (D7), không có mã lỗi riêng. */
  @IsOptional()
  @IsString()
  chiNhanhId?: string;
}

/** Tám giá trị của `ketQua` (PLAN 5.12). */
export type AskOutcome =
  | 'TraLoi'
  | 'GoiY'
  | 'NgoaiPhamVi'
  | 'KhanCap'
  | 'TaiKhoan'
  | 'KhongKhopDuLieu'
  | 'KhongCoChuyenKhoa'
  | 'DuPhong';

/** Thân 200. Không có tên lớp đã dùng, id nội bộ khác hay chữ của mô hình khi bị thay (5.12). Id BIGINT là chuỗi. */
export interface AskResponse {
  ketQua: AskOutcome;
  doan: Doan[];
  chuyenKhoaGoiY: SuggestedSpecialty[];
  lienKet: LinkCode[];
  coTheGuiLai: boolean;
  tinhVaoLichSu: boolean;
}
