import { IsIn, IsOptional } from 'class-validator';
import { PageQueryDto } from '../../common/paging/page-query.dto.js';
import type { CaLamViec } from '../../scheduling/branch-hours/branch-hours.types.js';
import {
  TRANG_THAI_YEU_CAU_NGHI_PHEP,
  type HinhThucNghi,
  type TrangThaiYeuCauNghiPhep,
} from '../entities/enums.js';

/**
 * Query của `GET /doctor/leave-requests` (B12; PLAN doctor 5.7, YN-15). Kế thừa `page`/`pageSize`. Chủ sở hữu KHÔNG có ở đây:
 * `bacSiId` hay khoá lạ khác là 400 `TRUONG_KHONG_DUOC_PHEP` (forbidNonWhitelisted), bác sĩ chỉ thấy yêu cầu của chính mình.
 */
export class LeaveHistoryQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn(TRANG_THAI_YEU_CAU_NGHI_PHEP)
  trangThai?: TrangThaiYeuCauNghiPhep;
}

/**
 * Một yêu cầu nghỉ, dùng chung cho dòng danh sách và chi tiết. Danh sách trắng: KHÔNG có `bac_si_id` (đã biết là của mình) và
 * KHÔNG có `nguoi_xu_ly_id` (không lộ Quản trị viên nào xử lý, YN-16). Lý do từ chối của Admin không có cột nên chưa hiện (Q27c, TECH_DEBT).
 * `thoiDiemTao`, `thoiDiemXuLy`: ISO 8601 UTC.
 */
export interface LeaveRequestView {
  yeuCauNghiPhepId: string;
  trangThai: TrangThaiYeuCauNghiPhep;
  hinhThuc: HinhThucNghi;
  tuNgay: string;
  denNgay: string;
  ca: CaLamViec | null;
  lyDo: string;
  thoiDiemTao: string;
  thoiDiemXuLy: string | null;
  /** Chỉ ở CHI TIẾT và chỉ yêu cầu ChoDuyet/DaDuyet (Q22, D14, B17): số lịch hẹn đang có trong các ca (từ hôm nay) mà yêu cầu phủ. Vắng khi `TuChoi` hay không đọc được `booking`. */
  soLichHenDangCo?: number;
}
