import { IsOptional, IsString } from 'class-validator';
import { ScheduleGridQueryDto } from './doctor-list-query.dto.js';

/**
 * Lưới lịch của Lễ tân: `GET /reception/doctor-schedules`. Không có `chiNhanhId`: phạm vi luôn là chi nhánh của Lễ tân, gửi lên là 400.
 * `bacSiId` chỉ kiểm là chuỗi ở đây; service gọi `parsePublicId` nên sai dạng ⇒ 404 `KHONG_TIM_THAY` cùng thân với "không có" (XL-11).
 */
export class ReceptionScheduleGridDto extends ScheduleGridQueryDto {
  @IsOptional()
  @IsString()
  bacSiId?: string;
}
