import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';
import { PageQueryDto } from '../../common/paging/page-query.dto.js';

/** Id bigint dương dạng chuỗi (dùng để LỌC trong query: sai dạng ⇒ 400 DU_LIEU_KHONG_HOP_LE). */
export const ID_PATTERN = /^[1-9]\d{0,18}$/;

// Q38: `q` 2–100 ký tự sau khi bỏ khoảng trắng đầu/cuối và chuẩn hoá NFC (tên tiếng Việt gõ dạng tổ hợp vẫn khớp).
export const normalizeQ = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().normalize('NFC') : value;

/** Phần chung của mọi danh sách bác sĩ trong module (Admin B9, Lễ tân B8): tìm theo tên/chuyên khoa, lọc chuyên khoa, phân trang. */
export class DoctorSearchQueryDto extends PageQueryDto {
  @IsOptional()
  @Transform(normalizeQ)
  @IsString()
  @Length(2, 100)
  q?: string;

  @IsOptional()
  @Matches(ID_PATTERN)
  chuyenKhoaId?: string;
}

/**
 * Phần chung của lưới lịch. `tuNgay`/`denNgay` chỉ kiểm là chuỗi: sai định dạng, thiếu, đảo ngược, quá 42 ngày đều là MỘT lỗi
 * `KHOANG_NGAY_KHONG_HOP_LE` do `checkScheduleRange` quyết (PC-30). `bacSiId` do từng vai trò khai riêng vì cách báo lỗi khác nhau.
 */
export class ScheduleGridQueryDto extends DoctorSearchQueryDto {
  @IsOptional()
  @IsString()
  tuNgay?: string;

  @IsOptional()
  @IsString()
  denNgay?: string;

  @IsOptional()
  @IsIn(['CaSang', 'CaChieu'])
  ca?: 'CaSang' | 'CaChieu';
}
