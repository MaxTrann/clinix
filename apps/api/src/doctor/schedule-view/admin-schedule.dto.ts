import { IsOptional, Matches } from 'class-validator';
import {
  DoctorSearchQueryDto,
  ID_PATTERN,
  ScheduleGridQueryDto,
} from './doctor-list-query.dto.js';

/** Danh sách bác sĩ để chọn: `GET /admin/doctor-shifts/doctors`. Toàn hệ thống được lọc theo chi nhánh; Chi nhánh bị ép chi nhánh của mình. */
export class AdminDoctorListDto extends DoctorSearchQueryDto {
  @IsOptional()
  @Matches(ID_PATTERN)
  chiNhanhId?: string;
}

/** Lưới lịch: `GET /admin/doctor-shifts`. `bacSiId` sai dạng ⇒ 400 (id để lọc trong query, khác id đường dẫn). */
export class AdminScheduleGridDto extends ScheduleGridQueryDto {
  @IsOptional()
  @Matches(ID_PATTERN)
  chiNhanhId?: string;

  @IsOptional()
  @Matches(ID_PATTERN)
  bacSiId?: string;
}
