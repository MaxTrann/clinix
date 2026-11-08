import { Controller, Get, Inject, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../../auth/decorators/roles.decorator.js';
// Import GIÁ TRỊ (không `import type`) cho SearchPatientsQueryDto: ValidationPipe cần metadata của lớp lúc chạy, nếu không query không được kiểm
import { ParseRelativeIdPipe } from '../relatives/relative-id.pipe.js';
import {
  SearchPatientsQueryDto,
  type PatientDetail,
  type PatientLookupPage,
} from './patient-lookup.dto.js';
import { PatientLookupService } from './patient-lookup.service.js';

// Tra cứu hồ sơ bệnh nhân của Lễ tân (task B6 danh sách, B7 chi tiết; PLAN patient 5.4, 5.7; TRACKING B6-F, B7-E). Controller chỉ nhận/trả; logic ở PatientLookupService.
//  - `@Roles('LeTan')` DUY NHẤT, ghi trên route (QP-08): Bệnh nhân, Bác sĩ, Quản trị viên (cả hai phạm vi) nhận 403. Guard chạy TRƯỚC pipe nên
//    Bệnh nhân gửi `q` sai vẫn nhận 403, không phải 400.
//  - Không lấy gì từ người gọi: phạm vi toàn hệ thống (Q16), không lọc theo chi nhánh của Lễ tân. Tham số lạ (`?chiNhanhId=…`) là 400 vì query khai DTO.
//  - Chi tiết (B7): `:id` đi qua ParseRelativeIdPipe SAU guard nên người không có quyền không biết id đúng dạng hay không (403/401, không 404). Không khai @Query: query lạ
//    (`?chiNhanhId=…`) bị BỎ QUA, không 400 (khác danh sách vốn có DTO query).
//  - Không RequireAdminScope, không OriginGuard: xác thực bằng header Authorization (trình duyệt không tự gửi), không cookie nên không có CSRF.
@Controller('reception/patients')
export class PatientLookupController {
  constructor(
    @Inject(PatientLookupService)
    private readonly service: PatientLookupService,
  ) {}

  // 200 (mặc định của @Get). Danh sách trắng năm khoá mỗi phần tử; không khớp ai ⇒ `items: []`, không 404.
  @Get()
  @Roles('LeTan')
  async search(
    @Query() query: SearchPatientsQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PatientLookupPage> {
    // Dữ liệu cá nhân: không cho trình duyệt hay proxy lưu lại. Đặt trước khi gọi service để nhánh lỗi cũng có
    res.setHeader('Cache-Control', 'no-store');
    // Chuyển TƯỜNG MINH bốn giá trị; `offset` là getter của DTO nên phải lấy ra tại đây
    return this.service.search({
      q: query.q,
      page: query.page,
      pageSize: query.pageSize,
      offset: query.offset,
    });
  }

  // 200 (mặc định của @Get). Đúng mười khoá; id đã qua pipe nên là chuỗi đúng dạng BIGINT, sai dạng đã là 404 trước khi tới đây.
  // Tên pipe nói về "người thân" vì B4 viết trước; luật là id BIGINT công khai (`parsePublicId`), và comment của pipe đã ghi B7 dùng lại đúng pipe này (TECH_DEBT dòng 71).
  // 404 do pipe KHÔNG có `no-store` (pipe chạy trước handler, chưa có `res`), còn 404 do service thì có: chỉ cho người gọi biết "id của tôi sai dạng", thân giống hệt (TRACKING B7-E).
  @Get(':id')
  @Roles('LeTan')
  async detail(
    @Param('id', ParseRelativeIdPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PatientDetail> {
    // Dữ liệu cá nhân: đặt trước khi gọi service để nhánh lỗi sinh trong handler (404 "không có", 500) cũng có
    res.setHeader('Cache-Control', 'no-store');
    return this.service.getDetail(id);
  }
}
