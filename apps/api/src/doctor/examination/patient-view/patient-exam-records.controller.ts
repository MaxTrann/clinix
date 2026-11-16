import { Controller, Get, Header, Inject, Param, Query } from '@nestjs/common';
import { ParseAppointmentCodePipe } from '../../../appointments/appointment-code.pipe.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../../auth/decorators/roles.decorator.js';
import type { PatientExamDetail } from './patient-exam-detail.dto.js';
import { PatientExamDetailService } from './patient-exam-detail.service.js';
// Import GIÁ TRỊ (không `import type`) cho PatientExamRecordsQueryDto: ValidationPipe cần metadata của lớp lúc chạy, nếu không query không được kiểm
import {
  PatientExamRecordsQueryDto,
  type PatientExamRecordsPage,
} from './patient-exam-records.dto.js';
import { PatientExamRecordsService } from './patient-exam-records.service.js';

// `GET /patient/exam-records` (doctor-exam B4; PLAN 5.6, 5.11; Q21) và `GET /patient/exam-records/:maLichHen` (B5). Controller chỉ nhận/trả; logic ở `PatientExamRecordsService`, `PatientExamDetailService`.
//  - `@Roles('BenhNhan')` GHI TRÊN từng route (AR-02, QHK-09): Bác sĩ, Lễ tân, Quản trị viên nhận 403 `KHONG_DU_QUYEN`. Guard chạy TRƯỚC pipe nên người sai vai trò gửi query hay mã sai vẫn nhận 403, không phải 400 hay 404.
//  - Chủ sở hữu CHỈ lấy từ access token (`user.accountId`); query của danh sách không có `benhNhanId` (gửi lên, hay khoá lạ nào, là 400 `TRUONG_KHONG_DUOC_PHEP`: XHS-12, QHK-03).
//    Chi tiết không có DTO query: khoá lạ ở query bị BỎ QUA (như `GET /patient/appointments/:maLichHen`), chủ sở hữu vẫn chỉ từ token (khác QHK-03 của route danh sách).
//  - `@Header('Cache-Control', 'no-store')`: áp SAU guard và TRƯỚC pipe nên 400 do query và 404 do mã sai dạng cũng có (QHK-12). Là dữ liệu SỨC KHOẺ của người dùng; đặt trong thân hàm thì 404 do pipe mất header.
//  - Không `OriginGuard`: xác thực bằng header Authorization, không cookie nên không có CSRF.
@Controller('patient/exam-records')
export class PatientExamRecordsController {
  constructor(
    @Inject(PatientExamRecordsService)
    private readonly service: PatientExamRecordsService,
    @Inject(PatientExamDetailService)
    private readonly detailService: PatientExamDetailService,
  ) {}

  // 200 (mặc định của @Get). Không lịch nào khớp, hoặc trang vượt cuối ⇒ `items: []`, không 404 (XHS-03, XHS-05)
  @Get()
  @Roles('BenhNhan')
  @Header('Cache-Control', 'no-store')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PatientExamRecordsQueryDto,
  ): Promise<PatientExamRecordsPage> {
    // Chuyển TƯỜNG MINH từng giá trị; `offset` là getter của DTO nên phải lấy ra tại đây
    return this.service.list(user.accountId, {
      nguoiKham: query.nguoiKham,
      nam: query.nam,
      thang: query.thang,
      page: query.page,
      pageSize: query.pageSize,
      offset: query.offset,
    });
  }

  // 200 (mặc định của @Get). Mã sai dạng ⇒ 404 ngay ở pipe; lịch của người khác, chưa HoanThanh, không có ⇒ cùng 404 `KHONG_TIM_THAY` ở service (XHS-07)
  @Get(':maLichHen')
  @Roles('BenhNhan')
  @Header('Cache-Control', 'no-store')
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('maLichHen', ParseAppointmentCodePipe) maLichHen: string,
  ): Promise<PatientExamDetail> {
    return this.detailService.detail(user.accountId, maLichHen);
  }
}
