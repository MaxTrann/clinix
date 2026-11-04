import { IsOptional, IsString } from 'class-validator';
import type { Paged } from '../../common/paging/paged.js';
import { PublicQueryDto } from '../common/public-query.dto.js';

/**
 * Query của `GET /public/specialties`: `q`, `page`, `pageSize` + `chiNhanhId` (Q5).
 * `chiNhanhId` chỉ kiểm là chuỗi ở đây; dạng id kiểm ở service để trả 400 `BO_LOC_KHONG_HOP_LE` (PLAN 5.8).
 */
export class PublicSpecialtyQueryDto extends PublicQueryDto {
  @IsOptional()
  @IsString()
  chiNhanhId?: string;
}

/** Query của `GET /public/specialties/:id`. */
export class PublicSpecialtyDetailQueryDto {
  @IsOptional()
  @IsString()
  chiNhanhId?: string;
}

/** Một chuyên khoa công khai (danh sách trắng PLAN 5.5). `soBacSi` đếm bác sĩ công khai (theo chi nhánh nếu có lọc). */
export interface PublicSpecialtyItem {
  chuyenKhoaId: string;
  ten: string;
  moTa: string | null;
  anhDaiDien: string | null;
  soBacSi: number;
}

/** Danh sách + `soCoBacSi`: số chuyên khoa (theo cùng `q`, `chiNhanhId`) có ít nhất một bác sĩ công khai. */
export interface PublicSpecialtyPage extends Paged<PublicSpecialtyItem> {
  soCoBacSi: number;
}

/** Chi tiết chuyên khoa; `giaKhamTu` (Q9) thêm khi B4 xong. */
export type PublicSpecialtyDetail = PublicSpecialtyItem;
