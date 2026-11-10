import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';
import { PageQueryDto } from '../../common/paging/page-query.dto.js';

const ID_PATTERN = /^[1-9]\d{0,18}$/;

// Q38: `q` 2–100 ký tự sau khi bỏ khoảng trắng đầu/cuối và chuẩn hoá NFC (tên tiếng Việt gõ dạng tổ hợp vẫn khớp).
const normalizeQ = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().normalize('NFC') : value;

/** Danh sách bác sĩ để chọn: `GET /admin/doctor-shifts/doctors`. */
export class AdminDoctorListDto extends PageQueryDto {
  @IsOptional()
  @Transform(normalizeQ)
  @IsString()
  @Length(2, 100)
  q?: string;

  @IsOptional()
  @Matches(ID_PATTERN)
  chiNhanhId?: string;

  @IsOptional()
  @Matches(ID_PATTERN)
  chuyenKhoaId?: string;
}

/**
 * Lưới lịch: `GET /admin/doctor-shifts`. `tuNgay`/`denNgay` chỉ kiểm là chuỗi, khoảng sai là MỘT lỗi
 * `KHOANG_NGAY_KHONG_HOP_LE` do `checkScheduleRange` quyết (như xem lịch Bác sĩ, PC-30).
 */
export class AdminScheduleGridDto extends AdminDoctorListDto {
  @IsOptional()
  @IsString()
  tuNgay?: string;

  @IsOptional()
  @IsString()
  denNgay?: string;

  @IsOptional()
  @Matches(ID_PATTERN)
  bacSiId?: string;

  @IsOptional()
  @IsIn(['CaSang', 'CaChieu'])
  ca?: 'CaSang' | 'CaChieu';
}
