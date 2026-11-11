import { TRANG_THAI_LICH_HEN } from '../../admin/entities/enums.js';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import { PageQueryDto } from '../../common/paging/page-query.dto.js';
import type { Paged } from '../../common/paging/paged.js';
import type { ItemCore } from './list-item.mapper.js';
import {
  CalendarDayParam,
  IdFilterParam,
  KeywordParam,
  NotBeforeParam,
  StateListParam,
} from './list-query.decorators.js';

// Danh sách và chi tiết lịch hẹn cho Lễ tân (B3) và Quản trị viên (B4): CÙNG truy vấn, KHÁC phạm vi (PLAN booking 5.8, 5.9, Q31, Q32, Q35; TRACKING 3.17 B3-D, 3.17.1).

/**
 * Tập trạng thái MẶC ĐỊNH khi không có `trangThai[]`: sáu trạng thái hiển thị, loại `DaDoiLich` (câu (j) của B3: PLAN chỉ nói "hiện khi lọc đúng trạng thái đó"). Có `trangThai=DaDoiLich`
 * thì hiện đúng những dòng đó (DSV-12).
 */
export const OPERATIONS_DEFAULT_STATES: readonly TrangThaiLichHen[] =
  TRANG_THAI_LICH_HEN.filter((state) => state !== 'DaDoiLich');

/**
 * Query của `GET /reception/appointments` (B3) và `GET /admin/appointments` (B4). Kế thừa phân trang của `PageQueryDto`. Mọi tham số tuỳ chọn. Khoá lạ (`benhNhanId`, `nhom`, `thanhToan`…)
 * là 400 `TRUONG_KHONG_DUOC_PHEP` do `forbidNonWhitelisted`. `chiNhanhId` KHÔNG phải quyền: Lễ tân và Quản trị viên Chi nhánh bị ép theo phạm vi (giá trị gửi lên bị bỏ qua, DSV-01),
 * chỉ Quản trị viên Toàn hệ thống dùng nó làm bộ lọc (B4); phạm vi nằm trong SQL (`BranchAccessPolicy.branchFilter`).
 */
export class OperationsAppointmentsQueryDto extends PageQueryDto {
  @StateListParam(TRANG_THAI_LICH_HEN)
  trangThai?: TrangThaiLichHen[];

  @IdFilterParam()
  chiNhanhId?: string;

  @IdFilterParam()
  chuyenKhoaId?: string;

  @IdFilterParam()
  bacSiId?: string;

  @IdFilterParam()
  dichVuKhamId?: string;

  @CalendarDayParam()
  tuNgay?: string;

  @CalendarDayParam()
  @NotBeforeParam('tuNgay')
  denNgay?: string;

  @KeywordParam()
  q?: string;
}

/** Đầu vào của service: giá trị lấy từ DTO (getter `offset` mất khi chuyển đối tượng thường nên controller lấy ra). */
export interface OperationsAppointmentsQuery {
  trangThai?: readonly TrangThaiLichHen[];
  chiNhanhId?: string;
  chuyenKhoaId?: string;
  bacSiId?: string;
  dichVuKhamId?: string;
  tuNgay?: string;
  denNgay?: string;
  q?: string;
  page: number;
  pageSize: number;
  offset: number;
}

/**
 * Một dòng danh sách: ĐÚNG mười một khoá (danh sách trắng, Q32): mười khoá chung của `ItemCore` cộng `nguoiDat` (tài khoản của `benh_nhan_id`, kèm SĐT). Không email, ngày sinh, địa chỉ,
 * `lich_hen_id`, `benh_nhan_id`, `khung_gio_id`, `ho_so_nguoi_than_id`, băm, SĐT bác sĩ hay SĐT hồ sơ người thân (DSV-08, H10).
 */
export interface OperationsAppointmentItem extends ItemCore {
  nguoiDat: { hoTen: string; soDienThoai: string };
}

/** Phần chi tiết DÙNG CHUNG cho Lễ tân và Quản trị viên: mười một khoá của dòng cộng ba khoá (Q32). `lyDoHuy` là chữ tự do của Lễ tân hay Quản trị viên (Q27: chỉ nhân sự được thấy). */
export interface OperationsAppointmentDetail extends OperationsAppointmentItem {
  lyDoKham: string | null;
  lyDoHuy: string | null;
  /** ISO 8601 UTC */
  hanThanhToan: string | null;
}

/**
 * Chi tiết cho Lễ tân: ĐÚNG 16 khoá = chi tiết dùng chung cộng `chuyenDuoc` (các trạng thái Lễ tân được chuyển tới, từ ma trận P1) và `conPhaiThu` (chuỗi decimal, CHỈ ở `DaXacNhan`;
 * trạng thái khác là `null`).
 */
export interface ReceptionAppointmentDetail extends OperationsAppointmentDetail {
  chuyenDuoc: TrangThaiLichHen[];
  conPhaiThu: string | null;
}

export type OperationsAppointmentsPage = Paged<OperationsAppointmentItem>;
