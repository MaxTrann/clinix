import { PublicQueryDto } from '../common/public-query.dto.js';
import type { WeekdayView } from '../common/weekly-schedule.view.js';

/** Query của `GET /public/branches`: chỉ có `q`, `page`, `pageSize` (tham số lạ ⇒ 400 nhờ forbidNonWhitelisted). */
export class PublicBranchQueryDto extends PublicQueryDto {}

/** Một dòng danh sách chi nhánh. Id và toạ độ là chuỗi (bigint/decimal), toạ độ có thể `null`. */
export interface PublicBranchItem {
  chiNhanhId: string;
  ten: string;
  diaChi: string;
  toaDoLat: string | null;
  toaDoLng: string | null;
}

export interface PublicBranchService {
  dichVuKhamId: string;
  ten: string;
}

/** Chi tiết chi nhánh: giờ nhận khám 7 thứ, dịch vụ đang cung cấp, số bác sĩ công khai (PLAN search 5.5). */
export interface PublicBranchDetail extends PublicBranchItem {
  lichHoatDong: WeekdayView[];
  dichVuKham: PublicBranchService[];
  soBacSi: number;
}
