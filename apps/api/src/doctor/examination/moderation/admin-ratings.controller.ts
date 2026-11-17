import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../../auth/decorators/roles.decorator.js';
import type { AdminScope } from '../../../rbac/admin-scope.js';
import { AdminScopeCtx } from '../../../rbac/decorators/admin-scope-ctx.decorator.js';
import { RequireAdminScope } from '../../../rbac/decorators/require-admin-scope.decorator.js';
import { ParseRecordIdPipe } from '../../common/parse-record-id.pipe.js';
// Import GIÁ TRỊ (không `import type`) cho AdminRatingsQueryDto: ValidationPipe cần metadata của lớp lúc chạy, nếu không query không được kiểm
import {
  AdminRatingsQueryDto,
  type AdminRatingDetail,
  type AdminRatingsPage,
} from './admin-ratings.dto.js';
import { AdminRatingsService } from './admin-ratings.service.js';
// Import GIÁ TRỊ (không `import type`) cho HideRatingDto: ValidationPipe cần metadata của lớp lúc chạy, nếu không thân không được kiểm
import { HideRatingDto, type HiddenRatingView } from './rating-hide.dto.js';
import { RatingHideService } from './rating-hide.service.js';

// `GET /admin/doctor-ratings`, `GET /admin/doctor-ratings/:id` (doctor-exam B7; PLAN 5.8, 5.11) và `POST /admin/doctor-ratings/:id/hide` (B8). Controller chỉ nhận/trả; logic ở `AdminRatingsService` (đọc) và
// `RatingHideService` (ẩn). Hai route đọc KHÔNG ghi; ẩn là MỘT chiều: KHÔNG có route hiện lại, `PUT`, `PATCH` hay `DELETE` (Q8, KDD-13).
//  - `@Roles('QuanTriVien')` và `@RequireAdminScope('Any')` GHI TRÊN từng route (AR-02, QHK-09): Bệnh nhân, Bác sĩ, Lễ tân nhận 403 `KHONG_DU_QUYEN`, khách 401. Guard chạy TRƯỚC pipe và DTO nên
//    người sai vai trò gửi id sai dạng hay query sai vẫn nhận 403 (KDD-11). Phạm vi của Admin đọc từ DB mỗi request (`@AdminScopeCtx`), không từ query.
//  - `@Header('Cache-Control', 'no-store')`: áp SAU guard và TRƯỚC pipe nên 400 do query và 404 do id sai dạng cũng có (QHK-12). Có tên người đặt, tên bác sĩ và nhận xét.
//  - Id sai dạng (âm, 0, chữ, vượt BIGINT) ⇒ 404 `KHONG_TIM_THAY` cùng thân với "không có" và "ngoài phạm vi" (`ParseRecordIdPipe`; KDD-12).
//  - `POST :id/hide` (B8): `@HttpCode(200)` (đổi trạng thái của tài nguyên có sẵn, không tạo mới); người ẩn CHỈ lấy từ access token (`@CurrentUser`), đánh giá CHỈ từ đường dẫn; khoá lạ ở thân ⇒ 400
//    `TRUONG_KHONG_DUOC_PHEP`. Không `OriginGuard`: xác thực bằng header Authorization, không cookie.
@Controller('admin/doctor-ratings')
export class AdminRatingsController {
  constructor(
    @Inject(AdminRatingsService) private readonly service: AdminRatingsService,
    @Inject(RatingHideService) private readonly hiding: RatingHideService,
  ) {}

  // 200 (mặc định của @Get). Không dòng nào khớp, hoặc trang vượt cuối ⇒ `items: []`, không 404
  @Get()
  @Roles('QuanTriVien')
  @RequireAdminScope('Any')
  @Header('Cache-Control', 'no-store')
  list(
    @AdminScopeCtx() scope: AdminScope,
    @Query() query: AdminRatingsQueryDto,
  ): Promise<AdminRatingsPage> {
    // Chuyển TƯỜNG MINH từng giá trị; `offset` là getter của DTO nên phải lấy ra tại đây
    return this.service.list(scope, {
      trangThai: query.trangThai,
      soSao: query.soSao,
      bacSiId: query.bacSiId,
      chiNhanhId: query.chiNhanhId,
      q: query.q,
      page: query.page,
      pageSize: query.pageSize,
      offset: query.offset,
    });
  }

  @Get(':id')
  @Roles('QuanTriVien')
  @RequireAdminScope('Any')
  @Header('Cache-Control', 'no-store')
  detail(
    @AdminScopeCtx() scope: AdminScope,
    @Param('id', ParseRecordIdPipe) id: string,
  ): Promise<AdminRatingDetail> {
    return this.service.get(scope, id);
  }

  @Post(':id/hide')
  @HttpCode(200)
  @Roles('QuanTriVien')
  @RequireAdminScope('Any')
  @Header('Cache-Control', 'no-store')
  hide(
    @AdminScopeCtx() scope: AdminScope,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseRecordIdPipe) id: string,
    @Body() body: HideRatingDto,
  ): Promise<HiddenRatingView> {
    return this.hiding.hide(scope, user.accountId, id, body);
  }
}
