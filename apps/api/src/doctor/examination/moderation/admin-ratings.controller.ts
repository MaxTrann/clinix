import { Controller, Get, Header, Inject, Param, Query } from '@nestjs/common';
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

// `GET /admin/doctor-ratings` và `GET /admin/doctor-ratings/:id` (doctor-exam B7; PLAN 5.8, 5.11). Controller chỉ nhận/trả; logic ở `AdminRatingsService`. Chỉ ĐỌC: ẩn đánh giá là B8.
//  - `@Roles('QuanTriVien')` và `@RequireAdminScope('Any')` GHI TRÊN từng route (AR-02, QHK-09): Bệnh nhân, Bác sĩ, Lễ tân nhận 403 `KHONG_DU_QUYEN`, khách 401. Guard chạy TRƯỚC pipe và DTO nên
//    người sai vai trò gửi id sai dạng hay query sai vẫn nhận 403 (KDD-11). Phạm vi của Admin đọc từ DB mỗi request (`@AdminScopeCtx`), không từ query.
//  - `@Header('Cache-Control', 'no-store')`: áp SAU guard và TRƯỚC pipe nên 400 do query và 404 do id sai dạng cũng có (QHK-12). Có tên người đặt, tên bác sĩ và nhận xét.
//  - Id sai dạng (âm, 0, chữ, vượt BIGINT) ⇒ 404 `KHONG_TIM_THAY` cùng thân với "không có" và "ngoài phạm vi" (`ParseRecordIdPipe`; KDD-12).
@Controller('admin/doctor-ratings')
export class AdminRatingsController {
  constructor(
    @Inject(AdminRatingsService) private readonly service: AdminRatingsService,
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
}
