import { IsOptional, IsString } from 'class-validator';

/**
 * Query của `GET /public/service-groups`: chỉ có `chiNhanhId` (tuỳ chọn). Chỉ kiểm là chuỗi ở đây; dạng id kiểm ở service để
 * trả 400 `BO_LOC_KHONG_HOP_LE` (PLAN 5.8). Tham số lạ bị ValidationPipe từ chối như mọi endpoint.
 */
export class PublicServiceGroupQueryDto {
  @IsOptional()
  @IsString()
  chiNhanhId?: string;
}

/** Query của `GET /public/services`: thêm `nhomDichVuId` (tuỳ chọn). */
export class PublicServiceQueryDto extends PublicServiceGroupQueryDto {
  @IsOptional()
  @IsString()
  nhomDichVuId?: string;
}

/**
 * Một nhóm dịch vụ (TCBS b1). `giaTu` = giá mặc định nhỏ nhất của các dịch vụ đang cung cấp trong nhóm, chuỗi decimal
 * như DB (H4: không đổi sang số thực); nhóm chưa có dịch vụ nào ⇒ `soDichVu: 0`, `giaTu: null`, `sapTrienKhai: true`.
 */
export interface PublicServiceGroupItem {
  nhomDichVuId: string;
  ten: string;
  soDichVu: number;
  giaTu: string | null;
  sapTrienKhai: boolean;
}

/** Một dịch vụ khám đang cung cấp (TCBS b2–b3). Tiền là chuỗi decimal; `mucDatCoc` "0.00" = không cần cọc. */
export interface PublicServiceItem {
  dichVuKhamId: string;
  ten: string;
  nhomDichVu: { id: string; ten: string };
  thoiLuong: number;
  giaMacDinh: string;
  mucDatCoc: string;
  soBacSi: number;
}

export interface PublicItems<T> {
  items: T[];
}
