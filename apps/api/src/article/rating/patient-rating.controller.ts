import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Put,
} from '@nestjs/common';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
// Import GIÁ TRỊ (không `import type`) cho PutRatingDto: ValidationPipe cần metadata của lớp lúc chạy, nếu không thân không được kiểm
import {
  PutRatingDto,
  type RatingChoice,
  type RatingResult,
} from './patient-rating.dto.js';
import { PatientRatingService } from './patient-rating.service.js';

// Đánh giá Thích / Không thích bài viết của Bệnh nhân (article B3; PLAN article 5.4, 5.7, T11, T12). Controller chỉ nhận và trả; logic ở `PatientRatingService`.
//  - `@Roles('BenhNhan')` GHI TRÊN TỪNG route (nếp patient-cancel, doctor-exam rating; ABR-01): Bác sĩ, Lễ tân, Quản trị viên nhận 403 `KHONG_DU_QUYEN`, khách 401. `RolesGuard` cho qua route không có `@Roles`,
//    nên dòng này là thứ duy nhất chặn các vai khác; guard chạy TRƯỚC pipe nên người sai vai trò gửi id hay thân sai vẫn nhận 403.
//  - Chủ phiếu CHỈ lấy từ access token (`user.accountId`); thân và query không nhận mã Bệnh nhân (khoá lạ ở thân là 400 `TRUONG_KHONG_DUOC_PHEP`). Không route nào lộ phiếu của người khác (5.9).
//  - `PUT` và `DELETE` idempotent, trả 200 (mặc định của Nest cho cả hai). Id lấy chuỗi thô: sai dạng cũng là 404 cùng thân với "không có", do service quyết định.
//  - `Cache-Control: no-store` đặt ở `ArticleModule.configure` (middleware, cả 200, 400, 401, 403, 404): phiếu là dữ liệu của tài khoản (T10).
@Controller('patient/articles/:id/rating')
export class PatientRatingController {
  constructor(
    @Inject(PatientRatingService)
    private readonly service: PatientRatingService,
  ) {}

  @Get()
  @Roles('BenhNhan')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<RatingChoice> {
    return this.service.get(user.accountId, id);
  }

  @Put()
  @Roles('BenhNhan')
  put(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: PutRatingDto,
  ): Promise<RatingResult> {
    return this.service.put(user.accountId, id, body.loai);
  }

  @Delete()
  @Roles('BenhNhan')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<RatingResult> {
    return this.service.remove(user.accountId, id);
  }
}
