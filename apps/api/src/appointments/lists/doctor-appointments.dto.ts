import { IsIn, IsOptional } from 'class-validator';
import {
  CA_LAM_VIEC,
  type CaLamViec,
  type MoiQuanHeNguoiThan,
} from '../../admin/entities/enums.js';
import { PageQueryDto } from '../../common/paging/page-query.dto.js';
import type { Paged } from '../../common/paging/paged.js';
import {
  CalendarDayParam,
  IdFilterParam,
  KeywordParam,
  NotBeforeParam,
  StateListParam,
} from './list-query.decorators.js';
import type { ListOrder } from './list-query.sql.js';
import type { VISIT_PROFILE_SELF } from './list-query.rules.js';
import {
  PATIENT_VISIBLE_STATES,
  type PatientVisibleState,
} from './patient-appointments.dto.js';

// Danh sách và chi tiết lịch hẹn của chính BÁC SĨ (task B5, use case XDSPC; PLAN booking 5.8, 5.9, Q31, Q33, Q35; TRACKING 3.20, 3.20.1).

/** Sáu trạng thái Bác sĩ được thấy: CÙNG tập với Bệnh nhân (Q31: `DaDoiLich` ẩn, lịch bị thay đã có dòng mới); một nguồn để hai vai trò không lệch nhau (TRACKING 3.20 câu (c)). */
export type DoctorVisibleState = PatientVisibleState;
export const DOCTOR_VISIBLE_STATES: readonly DoctorVisibleState[] =
  PATIENT_VISIBLE_STATES;

/** `sapXep` của Q33: mặc định "Mới nhất trước". Chỉ ánh xạ sang `ListOrder` có sẵn, không viết SQL sắp xếp mới. */
export const SAP_XEP = ['MoiNhat', 'CuNhat'] as const;
export type SapXep = (typeof SAP_XEP)[number];
export const SAP_XEP_ORDER: Record<SapXep, ListOrder> = {
  MoiNhat: 'DESC',
  CuNhat: 'ASC',
};

/**
 * Query của `GET /doctor/appointments`. Kế thừa phân trang của `PageQueryDto`. Mọi tham số tuỳ chọn. Bác sĩ KHÔNG có đường nào từ client: phạm vi chỉ từ access token. `bacSiId` được khai
 * (đúng dạng thì qua, sai dạng 400 `IS_BIGINT_ID`) nhưng KHÔNG đi tiếp vào service (DSB-01, QB-03: bị bỏ qua); khoá lạ khác (`chuyenKhoaId`, `chiNhanhId`, `benhNhanId`, `nhom`…) là 400
 * `TRUONG_KHONG_DUOC_PHEP` do `forbidNonWhitelisted`. `ca` MỘT giá trị (mảng bị `IsIn` từ chối).
 */
export class DoctorAppointmentsQueryDto extends PageQueryDto {
  @StateListParam(DOCTOR_VISIBLE_STATES)
  trangThai?: DoctorVisibleState[];

  @IsOptional()
  @IsIn(CA_LAM_VIEC)
  ca?: CaLamViec;

  @CalendarDayParam()
  tuNgay?: string;

  @CalendarDayParam()
  @NotBeforeParam('tuNgay')
  denNgay?: string;

  @KeywordParam()
  q?: string;

  @IsOptional()
  @IsIn(SAP_XEP)
  sapXep?: SapXep;

  @IdFilterParam()
  bacSiId?: string;
}

/**
 * Đầu vào của service: giá trị lấy từ DTO (getter `offset` mất khi chuyển đối tượng thường nên controller lấy ra). CỐ Ý không có `bacSiId`: giá trị đó của query không bao giờ tới
 * service, nên không thể đi vào SQL (DSB-01).
 */
export interface DoctorAppointmentsQuery {
  trangThai?: readonly DoctorVisibleState[];
  ca?: CaLamViec;
  tuNgay?: string;
  denNgay?: string;
  q?: string;
  sapXep?: SapXep;
  page: number;
  pageSize: number;
  offset: number;
}

/**
 * Người khám của MỘT lịch (Q33): `quanHe` là `BanThan` khi khám cho chính mình, còn lại là `moi_quan_he` của hồ sơ người thân (giá trị thô, giao diện đặt nhãn). `gioiTinh`, `ngaySinh`,
 * `soDienThoai` là của NGƯỜI KHÁM (tài khoản khi khám cho chính mình, hồ sơ người thân khi khám cho người thân; không bao giờ của người đặt); `null` khi chưa nhập. `ngaySinh`: `YYYY-MM-DD`.
 */
export interface DoctorExaminee {
  hoTen: string;
  quanHe: MoiQuanHeNguoiThan | typeof VISIT_PROFILE_SELF;
  gioiTinh: string | null;
  ngaySinh: string | null;
  soDienThoai: string | null;
}

/**
 * Một dòng danh sách: ĐÚNG tám khoá (danh sách trắng, Q33). Không giá, cọc, thanh toán, email, `lich_hen_id`, `benh_nhan_id`, `khung_gio_id`, `ho_so_nguoi_than_id`, người đặt, tên chính bác sĩ
 * (H10). `thoiGian`: ISO 8601 UTC.
 */
export interface DoctorAppointmentItem {
  maLichHen: string;
  thoiGian: string;
  ca: CaLamViec;
  trangThai: DoctorVisibleState;
  nguoiKham: DoctorExaminee;
  dichVu: string;
  chuyenKhoa: string;
  lyDoKham: string | null;
}

/**
 * Chi tiết MỘT lịch: ĐÚNG mười một khoá = tám khoá của dòng cộng `ghiChuKham` (LUÔN `null` tới khi module `doctor` có bảng `ho_so_kham`, TRACKING 3.20 B5-B), `chiNhanh` (chuỗi) và `ngayDat`
 * (ISO 8601 UTC, từ `thoi_diem_tao`). KHÔNG `lyDoHuy` (Figma `692:2` không hiện lý do huỷ; Q27).
 */
export interface DoctorAppointmentDetail extends DoctorAppointmentItem {
  ghiChuKham: null;
  chiNhanh: string;
  ngayDat: string;
}

/** Số lịch theo từng trạng thái hiển thị: đủ sáu khoá, trạng thái không có dòng nào là `0`. */
export type DoctorStatusCounts = Record<DoctorVisibleState, number>;

export interface DoctorAppointmentsPage extends Paged<DoctorAppointmentItem> {
  demTheoTrangThai: DoctorStatusCounts;
}
