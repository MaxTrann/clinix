import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateBy,
  type ValidationArguments,
} from 'class-validator';
import { PageQueryDto } from '../../common/paging/page-query.dto.js';
import {
  isCalendarDate,
  parseCalendarDate,
} from '../../scheduling/calendar-date.js';
import type { CaLamViec } from '../../scheduling/branch-hours/branch-hours.types.js';
import {
  TRANG_THAI_YEU_CAU_NGHI_PHEP,
  type HinhThucNghi,
  type TrangThaiYeuCauNghiPhep,
} from '../entities/enums.js';
import {
  ID_PATTERN,
  normalizeQ,
} from '../schedule-view/doctor-list-query.dto.js';

// Mã lỗi theo trường của bộ lọc ngày gửi (PLAN doctor 5.8, Q38). Dùng lại mã sẵn có của khoảng ngày: `[đề xuất]`, PLAN chưa đặt mã riêng.
const DATE_INVALID = 'NGAY_KHONG_HOP_LE';
const DATE_RANGE_INVALID = 'KHOANG_NGAY_KHONG_HOP_LE';

/** Ngày lịch 'YYYY-MM-DD' có thật (loại 2026-02-30). */
const IsCalendarDate = () =>
  ValidateBy(
    {
      name: 'isCalendarDate',
      validator: { validate: (value: unknown) => isCalendarDate(value) },
    },
    { message: DATE_INVALID },
  );

/** `denNgayGui` không được trước `tuNgayGui`; chỉ so khi cả hai là ngày hợp lệ (ngày sai dạng đã bị `IsCalendarDate` báo). */
const IsNotBeforeTuNgayGui = () =>
  ValidateBy(
    {
      name: 'isNotBeforeTuNgayGui',
      validator: {
        validate: (value: unknown, args?: ValidationArguments) => {
          const from = (args?.object as { tuNgayGui?: unknown } | undefined)
            ?.tuNgayGui;
          if (typeof from !== 'string' || typeof value !== 'string')
            return true;
          const fromDay = parseCalendarDate(from);
          const toDay = parseCalendarDate(value);
          return fromDay === null || toDay === null || toDay >= fromDay;
        },
      },
    },
    { message: DATE_RANGE_INVALID },
  );

/**
 * Query của `GET /admin/leave-requests` (B13; PLAN doctor 5.8, Q38). Kế thừa `page`/`pageSize`. Mọi tham số tuỳ chọn; khoá lạ ⇒ 400.
 * `chiNhanhId` chỉ có tác dụng với Toàn hệ thống: Admin Chi nhánh bị ÉP chi nhánh của mình, giá trị gửi lên bị bỏ qua (như admin/doctor-shifts).
 */
export class AdminLeaveListDto extends PageQueryDto {
  @IsOptional()
  @IsIn(TRANG_THAI_YEU_CAU_NGHI_PHEP)
  trangThai?: TrangThaiYeuCauNghiPhep;

  @IsOptional()
  @Matches(ID_PATTERN)
  bacSiId?: string;

  @IsOptional()
  @Matches(ID_PATTERN)
  chiNhanhId?: string;

  /** Ngày GỬI yêu cầu (`thoi_diem_tao`), theo giờ Việt Nam; gồm cả hai đầu. */
  @IsOptional()
  @IsCalendarDate()
  tuNgayGui?: string;

  @IsOptional()
  @IsCalendarDate()
  @IsNotBeforeTuNgayGui()
  denNgayGui?: string;

  // Q38: 2–100 ký tự sau khi cắt khoảng trắng và chuẩn hoá NFC; tìm theo tên bác sĩ hoặc chuyên khoa.
  @IsOptional()
  @Transform(normalizeQ)
  @IsString()
  @Length(2, 100)
  q?: string;
}

/** Số yêu cầu theo trạng thái, tính với CÙNG bộ lọc trừ `trangThai` (PD-21): thẻ thống kê không đổi khi bấm đổi tab trạng thái. */
export interface LeaveStats {
  choDuyet: number;
  daDuyet: number;
  tuChoi: number;
  tong: number;
}

/**
 * Một dòng danh sách. Danh sách trắng: tên bác sĩ, chuyên khoa, chi nhánh HIỆN TẠI của bác sĩ (Q28); KHÔNG có `lyDo` (thuộc chi tiết),
 * `nguoi_xu_ly_id`, email hay SĐT. Cột "lịch hẹn bị ảnh hưởng" ẩn tới khi booking B11 có (nối ở B17, Q26): không trả 0 giả.
 * `thoiDiemTao`, `thoiDiemXuLy`: ISO 8601 UTC.
 */
export interface AdminLeaveItem {
  yeuCauNghiPhepId: string;
  trangThai: TrangThaiYeuCauNghiPhep;
  hinhThuc: HinhThucNghi;
  tuNgay: string;
  denNgay: string;
  ca: CaLamViec | null;
  thoiDiemTao: string;
  thoiDiemXuLy: string | null;
  bacSi: { bacSiId: string; hoTen: string };
  chuyenKhoa: { ten: string };
  chiNhanh: { chiNhanhId: string; ten: string };
}

/** Chi tiết = dòng danh sách + lý do của Bác sĩ (Admin cần để quyết định). Mục "lịch hẹn bị ảnh hưởng" thêm ở B17 (D13). */
export interface AdminLeaveDetail extends AdminLeaveItem {
  lyDo: string;
}

export interface AdminLeavePage {
  items: AdminLeaveItem[];
  total: number;
  page: number;
  pageSize: number;
  thongKe: LeaveStats;
}
