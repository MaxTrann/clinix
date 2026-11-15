import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { VisitProfileFilterParam } from '../../../appointments/lists/list-query.decorators.js';
import type { Paged } from '../../../common/paging/paged.js';
import {
  EXAM_LIST_DEFAULT_PAGE_SIZE,
  EXAM_LIST_MAX_PAGE_SIZE,
  EXAM_LIST_YEAR_MAX,
  EXAM_LIST_YEAR_MIN,
} from '../examination.constants.js';
import { MONTHS_PER_YEAR } from './patient-exam-records.rules.js';

// Query và hình dạng trả về của `GET /patient/exam-records` (doctor-exam B4; PLAN 5.6; XHS-12, XHS-13, QHK-03). Mọi tham số TUỲ CHỌN.

/**
 * Query. KHÔNG có `benhNhanId` (chủ sở hữu chỉ từ access token): gửi lên, hay khoá lạ nào, là 400 `TRUONG_KHONG_DUOC_PHEP` do `forbidNonWhitelisted` của pipe toàn cục.
 * Không kế thừa `PageQueryDto` vì nó cho `pageSize` tới 100 mà PLAN 5.6 ghi tối đa 50. `nguoiKham` là `BanThan` hoặc id hồ sơ người thân (cùng luật với `hoSoNguoiThanId` của booking).
 */
export class PatientExamRecordsQueryDto {
  @VisitProfileFilterParam()
  nguoiKham?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(EXAM_LIST_YEAR_MIN)
  @Max(EXAM_LIST_YEAR_MAX)
  nam?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MONTHS_PER_YEAR)
  thang?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(EXAM_LIST_MAX_PAGE_SIZE)
  pageSize: number = EXAM_LIST_DEFAULT_PAGE_SIZE;

  get offset(): number {
    return (this.page - 1) * this.pageSize;
  }
}

/** Đầu vào của service: giá trị lấy từ DTO (getter `offset` mất khi chuyển đối tượng thường nên controller lấy ra). */
export interface PatientExamRecordsQuery {
  nguoiKham?: string;
  nam?: number;
  thang?: number;
  page: number;
  pageSize: number;
  offset: number;
}

/** Một dòng danh sách: ĐÚNG bảy khoá (danh sách trắng). KHÔNG nội dung hồ sơ, `lich_hen_id`, `benh_nhan_id`, `ho_so_nguoi_than_id`, `biAn`, `lyDoAn`, SĐT hay email. `thoiGian`: ISO 8601 UTC. */
export interface PatientExamRecordItem {
  maLichHen: string;
  thoiGian: string;
  chuyenKhoa: string;
  bacSi: { hoTen: string; chucDanh: string };
  /** `quanHe`: giá trị ENUM của `ho_so_nguoi_than.moi_quan_he`; `null` khi người khám là bản thân */
  nguoiKham: { hoTen: string; quanHe: string | null };
  coHoSoKham: boolean;
  /** Có dòng đánh giá, kể cả đánh giá đã bị ẩn (Q19) */
  daDanhGia: boolean;
}

/** Một lựa chọn của bộ lọc người khám: `id` là id hồ sơ người thân dạng chuỗi, `null` = bản thân. */
export interface ExamineeOption {
  id: string | null;
  hoTen: string;
  quanHe: string | null;
}

/** Số lịch `HoanThanh` theo tháng: đủ 12 khoá `"1"` đến `"12"`. */
export type MonthCounts = Record<string, number>;

export interface PatientExamRecordsPage extends Paged<PatientExamRecordItem> {
  demTheoThang: MonthCounts;
  nguoiKham: ExamineeOption[];
}
