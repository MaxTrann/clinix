import { IsOptional } from 'class-validator';

/**
 * Thân của `POST /admin/leave-requests/:id/reject`. Chỉ có `lyDo`; khoá lạ (như `trangThai`, `nguoiXuLyId`) là 400 `TRUONG_KHONG_DUOC_PHEP`.
 * Kiểu và độ dài của lý do KHÔNG kiểm ở đây: thiếu, sai kiểu, rỗng, quá 255 hay có ký tự điều khiển đều là MỘT mã `LY_DO_TU_CHOI_KHONG_HOP_LE`
 * do `normalizeRejectReason` quyết (PLAN 5.14, PD-04). `@IsOptional` chỉ để `forbidNonWhitelisted` nhận ra trường này.
 */
export class RejectLeaveRequestDto {
  @IsOptional()
  lyDo?: unknown;
}
