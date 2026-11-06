import { IsOptional, IsString } from 'class-validator';
import type { ChucDanhBacSi } from '../../admin/entities/enums.js';
import { PublicQueryDto } from '../common/public-query.dto.js';

/**
 * Query của `GET /public/doctors` (PLAN search 5.5). Ở đây chỉ kiểm "là chuỗi"; dạng của id/giá/điểm/sắp xếp kiểm ở
 * `parseDoctorFilters` để trả 400 `BO_LOC_KHONG_HOP_LE` kèm danh sách `loi[]` (PLAN 5.8). Tham số lạ bị ValidationPipe từ chối.
 */
export class PublicDoctorQueryDto extends PublicQueryDto {
  @IsOptional() @IsString() dichVuKhamId?: string;
  @IsOptional() @IsString() chuyenKhoaId?: string;
  @IsOptional() @IsString() chiNhanhId?: string;
  @IsOptional() @IsString() giaTu?: string;
  @IsOptional() @IsString() giaDen?: string;
  @IsOptional() @IsString() diemTu?: string;
  @IsOptional() @IsString() sapXep?: string;
}

/** Một bác sĩ trong danh sách công khai — danh sách trắng (Q14): không email, SĐT, ngày sinh, giới tính, địa chỉ, trạng thái, học vị, ảnh. */
export interface PublicDoctorItem {
  bacSiId: string;
  hoTen: string;
  chucDanh: ChucDanhBacSi;
  soNamKinhNghiem: number;
  chuyenKhoa: { chuyenKhoaId: string; ten: string };
  chiNhanh: { chiNhanhId: string; ten: string; diaChi: string };
  dichVu: { dichVuKhamId: string; ten: string; thoiLuong: number };
  /** Tiền là chuỗi decimal (H4). `giaKham` = `giaMacDinh` + `phuPhi`, tính bằng hàm chung của `pricing/`. */
  gia: {
    giaMacDinh: string;
    phuPhi: string;
    giaKham: string;
    mucDatCoc: string;
  };
  danhGia: { diemTrungBinh: string | null; soDanhGia: number };
}
