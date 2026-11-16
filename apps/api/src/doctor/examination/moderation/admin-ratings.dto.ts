import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { Paged } from '../../../common/paging/paged.js';
import {
  ID_PATTERN,
  normalizeQ,
} from '../../schedule-view/doctor-list-query.dto.js';
import {
  ADMIN_RATING_Q_MAX_LENGTH,
  ADMIN_RATING_STATUSES,
  EXAM_LIST_DEFAULT_PAGE_SIZE,
  EXAM_LIST_MAX_PAGE_SIZE,
  RATING_MAX,
  RATING_MIN,
} from '../examination.constants.js';
import type {
  AdminRatingCounts,
  AdminRatingStatus,
} from './admin-ratings.rules.js';

// Query và hình dạng trả về của `GET /admin/doctor-ratings` và `GET /admin/doctor-ratings/:id` (doctor-exam B7; PLAN 5.8; KDD-01…KDD-03, KDD-19, KDD-20). Mọi tham số TUỲ CHỌN.

/** Chuỗi của query ⇒ số; mảng (`x=1&x=2`, `x[]=1`) và kiểu khác giữ nguyên để `IsInt` từ chối (`@Type(() => Number)` đổi `['1']` thành 1). */
const toNumber = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? Number(value) : value;

/** `q`: bỏ khoảng trắng đầu cuối và chuẩn hoá NFC; chuỗi rỗng sau đó ⇒ vắng (như không có `q`, không phải lỗi). */
const toSearchText = ({ value }: { value: unknown }): unknown => {
  const text = normalizeQ({ value });
  return text === '' ? undefined : text;
};

/**
 * Query. Không kế thừa `PageQueryDto` (cho `pageSize` tới 100; PLAN 5.8 ghi tối đa 50). `chiNhanhId` chỉ có tác dụng với Toàn hệ thống: Admin Chi nhánh bị ÉP chi nhánh của mình ở service.
 * Khoá lạ (`benhNhanId`, `biAn`, `lyDoAn`…) và khoá lặp là 400 do `forbidNonWhitelisted` và các ràng buộc của pipe toàn cục.
 */
export class AdminRatingsQueryDto {
  @IsOptional()
  @IsIn(ADMIN_RATING_STATUSES)
  trangThai?: AdminRatingStatus;

  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(RATING_MIN)
  @Max(RATING_MAX)
  soSao?: number;

  @IsOptional()
  @Matches(ID_PATTERN)
  bacSiId?: string;

  @IsOptional()
  @Matches(ID_PATTERN)
  chiNhanhId?: string;

  @IsOptional()
  @Transform(toSearchText)
  @IsString()
  @MaxLength(ADMIN_RATING_Q_MAX_LENGTH)
  q?: string;

  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(1)
  @Max(EXAM_LIST_MAX_PAGE_SIZE)
  pageSize: number = EXAM_LIST_DEFAULT_PAGE_SIZE;

  get offset(): number {
    return (this.page - 1) * this.pageSize;
  }
}

/** Đầu vào của service: giá trị lấy từ DTO (getter `offset` mất khi chuyển đối tượng thường nên controller lấy ra). */
export interface AdminRatingsQuery {
  trangThai?: AdminRatingStatus;
  soSao?: number;
  bacSiId?: string;
  chiNhanhId?: string;
  q?: string;
  page: number;
  pageSize: number;
  offset: number;
}

/**
 * Một dòng danh sách: ĐÚNG tám khoá (danh sách trắng). `danhGiaId`, `bacSiId`, `chiNhanhId` là BIGINT dạng chuỗi; `nguoiDanhGia` là tên NGƯỜI ĐẶT (Q8); `nhanXet` đã cắt (≤ 200 đơn vị UTF-16) hay `null`.
 * KHÔNG `lyDoAn`, `maLichHen`, SĐT, email, `ly_do_kham`, `benh_nhan_id`. `thoiDiemTao`: ISO 8601 UTC.
 */
export interface AdminRatingItem {
  danhGiaId: string;
  bacSi: { bacSiId: string; hoTen: string };
  chiNhanh: { chiNhanhId: string; ten: string };
  nguoiDanhGia: { hoTen: string };
  soSao: number;
  nhanXet: string | null;
  thoiDiemTao: string;
  biAn: boolean;
}

/** Chi tiết = tám khoá trên (`nhanXet` ĐẦY ĐỦ) + `maLichHen` + `thoiGianKham` (ISO UTC) + `lyDoAn` CHỈ khi đã ẩn (khoá vắng khi chưa ẩn). */
export interface AdminRatingDetail extends AdminRatingItem {
  maLichHen: string;
  thoiGianKham: string;
  lyDoAn?: string;
}

export interface AdminRatingsPage extends Paged<AdminRatingItem> {
  /** Áp mọi lọc TRỪ `trangThai` (số trên các tab không đổi khi bấm đổi tab) */
  demTheoTrangThai: AdminRatingCounts;
}
