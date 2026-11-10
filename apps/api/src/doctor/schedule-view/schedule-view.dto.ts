import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

// `tuNgay`/`denNgay` chỉ kiểm là chuỗi: sai định dạng, thiếu, đảo ngược, quá 42 ngày đều là MỘT lỗi
// `KHOANG_NGAY_KHONG_HOP_LE` do `checkScheduleRange` quyết (XL-07). `bacSiId` hay tham số lạ bị `forbidNonWhitelisted` chặn (XL-06).
export class ScheduleQueryDto {
  @IsOptional()
  @IsString()
  tuNgay?: string;

  @IsOptional()
  @IsString()
  denNgay?: string;

  @IsOptional()
  @IsIn(['CaSang', 'CaChieu'])
  ca?: 'CaSang' | 'CaChieu';

  @IsOptional()
  @Matches(/^[1-9]\d{0,18}$/)
  chiNhanhId?: string;
}
