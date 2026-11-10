import { IsIn, IsOptional, IsString, ValidateBy } from 'class-validator';
import { isCalendarDate } from '../../scheduling/calendar-date.js';
import { LEAVE_FIELD_ERRORS } from './leave-request.constants.js';

/** Ngày lịch 'YYYY-MM-DD' có thật (loại 2026-02-30). */
const IsCalendarDate = () =>
  ValidateBy(
    {
      name: 'isCalendarDate',
      validator: { validate: (value: unknown) => isCalendarDate(value) },
    },
    { message: LEAVE_FIELD_ERRORS.DATE },
  );

// DTO chỉ kiểm KIỂU từng trường. Các luật chéo trường (TheoCa cần ca, một ngày...) và lý do (Q25) nằm ở `validateLeaveShape`
// để một nơi duy nhất quyết định. Cố ý KHÔNG có `bacSiId`: trường lạ bị `forbidNonWhitelisted` chặn bằng 400 TRUONG_KHONG_DUOC_PHEP,
// chủ sở hữu luôn lấy từ token (YN-12).
export class CreateLeaveRequestDto {
  @IsIn(['CaNgay', 'TheoCa'], { message: LEAVE_FIELD_ERRORS.KIND })
  hinhThuc!: 'CaNgay' | 'TheoCa';

  @IsCalendarDate()
  tuNgay!: string;

  @IsCalendarDate()
  denNgay!: string;

  // `null` hoặc vắng đều là "không chọn ca"; giá trị lạ ("CaToi", "abc") do `validateLeaveShape` báo CA_KHONG_HOP_LE.
  @IsOptional()
  @IsString({ message: LEAVE_FIELD_ERRORS.SHIFT_INVALID })
  ca?: string | null;

  @IsString({ message: LEAVE_FIELD_ERRORS.REASON_REQUIRED })
  lyDo!: string;
}
