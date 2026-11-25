import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsOptional, ValidateBy } from 'class-validator';
import {
  TRANG_THAI_YEU_CAU_DOI_LICH,
  type TrangThaiYeuCauDoiLich,
} from '../../admin/entities/enums.js';
import { PageQueryDto } from '../../common/paging/page-query.dto.js';
import type { Paged } from '../../common/paging/paged.js';
import {
  APPOINTMENT_CODE_PATTERN,
  normalizeAppointmentCode,
} from '../appointment-code.js';
import {
  IdFilterParam,
  StateListParam,
} from '../lists/list-query.decorators.js';
import type { RescheduleRequestItem } from './reschedule-request-list.types.js';

// Query của danh sách yêu cầu đổi lịch cho nhân sự (reschedule B8; PLAN reschedule 5.7, 5.8). Kế thừa phân trang của `PageQueryDto`. Mọi tham số tuỳ chọn. Khoá lạ là 400 `TRUONG_KHONG_DUOC_PHEP`
// do `forbidNonWhitelisted` (toàn cục). B9 dùng lại hai lớp này nếu cần; body duyệt và từ chối ở file riêng của B9.

/** Mã `loi[].ma` của `q` sai dạng (`[đề xuất]`, PLAN 5.13 không có mã riêng cho trường này). Một mã cho mọi lý do sai, kể cả `q=` rỗng và mảng (`q=a&q=b`). */
export const RESCHEDULE_REQUEST_CODE_FIELD_ERROR = 'MA_LICH_HEN_KHONG_HOP_LE';

/**
 * `q` là MÃ LỊCH HẸN ĐẦY ĐỦ (PLAN 5.7; Đại chọn 25/11/2026): chuẩn hoá như `ParseAppointmentCodePipe` (cắt khoảng trắng, chữ thường ASCII thành chữ hoa) rồi kiểm mẫu `CLX-yyyyMMdd-XXXXX`.
 * Giá trị đã chuẩn hoá thay vào DTO nên service so thẳng bằng `=`. Sai dạng thì GIỮ NGUYÊN giá trị gốc để bước kiểm báo lỗi (không nuốt thành `undefined`).
 */
const AppointmentCodeParam = () =>
  applyDecorators(
    IsOptional(),
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' ? normalizeAppointmentCode(value) : value,
    ),
    ValidateBy({
      name: 'isAppointmentCode',
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && APPOINTMENT_CODE_PATTERN.test(value),
        defaultMessage: () => RESCHEDULE_REQUEST_CODE_FIELD_ERROR,
      },
    }),
  );

/**
 * Query của `GET /reception/reschedule-requests`. KHÔNG có `chiNhanhId`: Lễ tân chỉ có chi nhánh của mình, đọc từ DB mỗi request; gửi `chiNhanhId` là khoá lạ (400, Đại chọn 25/11/2026).
 * `trangThai`: lặp khoá hoặc dấu phẩy, mặc định `ChoDuyet` ở service; tab "Đã xử lý" là `DaDuyet,TuChoi`.
 */
export class ReceptionRescheduleRequestsQueryDto extends PageQueryDto {
  @StateListParam(TRANG_THAI_YEU_CAU_DOI_LICH)
  trangThai?: TrangThaiYeuCauDoiLich[];

  @IdFilterParam()
  bacSiId?: string;

  @AppointmentCodeParam()
  q?: string;
}

/**
 * Query của `GET /admin/reschedule-requests`: thêm `chiNhanhId`. CHỈ Quản trị viên Toàn hệ thống dùng nó làm bộ lọc; Quản trị viên Chi nhánh bị ép theo chi nhánh được gán và giá trị
 * gửi lên bị BỎ QUA (nếp `admin/appointments`, DSV-02; `BranchAccessPolicy.branchFilter`).
 */
export class AdminRescheduleRequestsQueryDto extends ReceptionRescheduleRequestsQueryDto {
  @IdFilterParam()
  chiNhanhId?: string;
}

export type RescheduleRequestPage = Paged<RescheduleRequestItem>;
