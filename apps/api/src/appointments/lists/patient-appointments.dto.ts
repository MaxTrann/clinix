import { IsIn, IsOptional } from 'class-validator';
import { TRANG_THAI_LICH_HEN } from '../../admin/entities/enums.js';
import { PageQueryDto } from '../../common/paging/page-query.dto.js';
import type { Paged } from '../../common/paging/paged.js';
import {
  ACTIVE_APPOINTMENT_STATES,
  isActiveAppointmentState,
} from '../active-appointment-states.js';
import type { PaymentView } from '../ports/payment.port.js';
import type { RefundView } from '../ports/wallet.port.js';
import {
  CalendarDayParam,
  IdFilterParam,
  KeywordParam,
  NotBeforeParam,
  StateListParam,
  VisitProfileFilterParam,
} from './list-query.decorators.js';

// Danh sách và lịch sử lịch hẹn của Bệnh nhân (task B1; PLAN booking 5.8, 5.9, Q31, Q35; TRACKING 3.13 B1-B, 3.13.1, 3.13.2).

/** Sáu trạng thái Bệnh nhân được thấy: `DaDoiLich` ẩn khỏi danh sách và khỏi số đếm (Q31, LSH-06). */
export type PatientVisibleState = Exclude<
  (typeof TRANG_THAI_LICH_HEN)[number],
  'DaDoiLich'
>;
export const PATIENT_VISIBLE_STATES: readonly PatientVisibleState[] =
  TRANG_THAI_LICH_HEN.filter(
    (state): state is PatientVisibleState => state !== 'DaDoiLich',
  );

export const NHOM_LICH_HEN = ['SapToi', 'LichSu'] as const;
export type NhomLichHen = (typeof NHOM_LICH_HEN)[number];

/** "Sắp tới" = các trạng thái đang hoạt động (một nguồn: `ACTIVE_APPOINTMENT_STATES`); "Lịch sử" = ba trạng thái đã kết thúc (Q31). */
export const NHOM_STATES: Record<NhomLichHen, readonly PatientVisibleState[]> =
  {
    SapToi: ACTIVE_APPOINTMENT_STATES,
    LichSu: PATIENT_VISIBLE_STATES.filter(
      (state) => !isActiveAppointmentState(state),
    ),
  };

/**
 * Query của `GET /patient/appointments`. Kế thừa phân trang của `PageQueryDto`. Chủ sở hữu KHÔNG có ở đây (chỉ từ access token): `benhNhanId` hay
 * khoá lạ khác là 400 `TRUONG_KHONG_DUOC_PHEP` do `forbidNonWhitelisted`. Mọi tham số tuỳ chọn.
 */
export class PatientAppointmentsQueryDto extends PageQueryDto {
  @StateListParam(PATIENT_VISIBLE_STATES)
  trangThai?: PatientVisibleState[];

  @IsOptional()
  @IsIn(NHOM_LICH_HEN)
  nhom?: NhomLichHen;

  @VisitProfileFilterParam()
  hoSoNguoiThanId?: string;

  @IdFilterParam()
  bacSiId?: string;

  @IdFilterParam()
  chuyenKhoaId?: string;

  @CalendarDayParam()
  tuNgay?: string;

  @CalendarDayParam()
  @NotBeforeParam('tuNgay')
  denNgay?: string;

  @KeywordParam()
  q?: string;
}

/** Đầu vào của service: giá trị lấy từ DTO (getter `offset` mất khi chuyển đối tượng thường nên controller lấy ra). */
export interface PatientAppointmentsQuery {
  trangThai?: readonly PatientVisibleState[];
  nhom?: NhomLichHen;
  hoSoNguoiThanId?: string;
  bacSiId?: string;
  chuyenKhoaId?: string;
  tuNgay?: string;
  denNgay?: string;
  q?: string;
  page: number;
  pageSize: number;
  offset: number;
}

/**
 * Một dòng danh sách: ĐÚNG mười hai khoá (danh sách trắng, Q31). Không `lich_hen_id`, `benh_nhan_id`, `khung_gio_id`, `ho_so_nguoi_than_id`, không email hay SĐT
 * của bác sĩ (LSH-14, H10); `lyDoKham`, `thanhToan`, `hoanTien`, `thoiGianMayChu` thuộc chi tiết (`PatientAppointmentDetail`, B2). `thoiGian`, `hanThanhToan`: ISO 8601 UTC. Tiền: chuỗi decimal.
 */
export interface PatientAppointmentItem {
  maLichHen: string;
  trangThai: PatientVisibleState;
  thoiGian: string;
  bacSi: string;
  chuyenKhoa: string;
  chiNhanh: string;
  dichVu: string;
  nguoiKham: { hoTen: string; laBanThan: boolean };
  giaSnapshot: string;
  tienCoc: string;
  hanThanhToan: string | null;
  choPhepHuy: boolean;
}

/**
 * Chi tiết MỘT lịch hẹn (task B2; PLAN booking 5.8, 5.9, L17; TRACKING 3.15.1): ĐÚNG mười sáu khoá = mười hai khoá của một dòng danh sách (cùng hàm ánh xạ) cộng
 * `lyDoKham` (chuỗi hoặc `null`), `thanhToan` và `hoanTien` (`null` tới khi `payment` và `wallet` có, qua cổng), `thoiGianMayChu` (ISO 8601 UTC, giữ mili giây:
 * để giao diện bù lệch đồng hồ khi đếm ngược theo `hanThanhToan`). Không `lich_hen_id`, `benh_nhan_id`, `khung_gio_id`, `ho_so_nguoi_than_id`, không email hay SĐT
 * của bác sĩ (LSH-14), không `lyDoHuy` (chờ F2, B12 và Figma `691:2` chốt: thêm khoá sau là cộng thêm).
 */
export interface PatientAppointmentDetail extends PatientAppointmentItem {
  lyDoKham: string | null;
  thanhToan: PaymentView | null;
  hoanTien: RefundView | null;
  thoiGianMayChu: string;
}

/** Số lịch theo từng trạng thái hiển thị: đủ sáu khoá, trạng thái không có dòng nào là `0`. */
export type StatusCounts = Record<PatientVisibleState, number>;

export interface PatientAppointmentsPage extends Paged<PatientAppointmentItem> {
  demTheoTrangThai: StatusCounts;
}
