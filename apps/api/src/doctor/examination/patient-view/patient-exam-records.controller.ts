import { Controller, Get, Header, Inject, Query } from '@nestjs/common';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../../auth/decorators/roles.decorator.js';
// Import GIÁ TRỊ (không `import type`) cho PatientExamRecordsQueryDto: ValidationPipe cần metadata của lớp lúc chạy, nếu không query không được kiểm
import {
  PatientExamRecordsQueryDto,
  type PatientExamRecordsPage,
} from './patient-exam-records.dto.js';
import { PatientExamRecordsService } from './patient-exam-records.service.js';

// `GET /patient/exam-records` (doctor-exam B4; PLAN 5.6, 5.11; Q21). Controller chỉ nhận/trả; logic ở `PatientExamRecordsService`.
//  - `@Roles('BenhNhan')` GHI TRÊN route (AR-02, QHK-09): Bác sĩ, Lễ tân, Quản trị viên nhận 403 `KHONG_DU_QUYEN`. Guard chạy TRƯỚC pipe nên người sai vai trò gửi query sai vẫn nhận 403, không phải 400.
//  - Chủ sở hữu CHỈ lấy từ access token (`user.accountId`); query không có `benhNhanId` (gửi lên, hay khoá lạ nào, là 400 `TRUONG_KHONG_DUOC_PHEP`: XHS-12, QHK-03).
//  - `@Header('Cache-Control', 'no-store')`: áp SAU guard và TRƯỚC pipe nên 400 do query cũng có (QHK-12). Danh sách là dữ liệu SỨC KHOẺ của người dùng.
//  - Không `OriginGuard`: xác thực bằng header Authorization, không cookie nên không có CSRF. B5 thêm `GET :maLichHen` cùng tiền tố sau.
@Controller('patient/exam-records')
export class PatientExamRecordsController {
  constructor(
    @Inject(PatientExamRecordsService)
    private readonly service: PatientExamRecordsService,
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
}
