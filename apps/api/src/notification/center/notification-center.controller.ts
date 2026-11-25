import {
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
// Import GIÁ TRỊ cho DTO: ValidationPipe cần metadata của lớp lúc chạy
import {
  NotificationListQueryDto,
  type MarkAllReadResponse,
  type MarkReadResponse,
  type NotificationItem,
  type NotificationListResponse,
  type UnreadCountResponse,
} from './notification-center.dto.js';
import { NotificationCenterService } from './notification-center.service.js';

// API Trung tâm thông báo (notification B2; PLAN notification 5.4). Controller chỉ nhận/trả; logic ở NotificationCenterService.
//  - `@Roles` cả bốn vai trò ghi rõ trên TỪNG route (nếp QP-08 của patient).
//  - Tài khoản chỉ lấy từ token qua `CurrentUser()`; không khai `taiKhoanId` ở đâu cả (QTB-04).
//  - Không RequireAdminScope (dữ liệu của chính mình), không OriginGuard (xác thực bằng header Authorization, nếp `profile`).
//  - `Cache-Control: no-store` do middleware của NotificationCenterModule đặt (chạy trước guard nên cả 401 cũng có).
//  - Route tĩnh (`unread-count`, `read-all`) khai TRƯỚC route `:id` để không bị hiểu nhầm là id.
@Controller('notifications')
export class NotificationCenterController {
  constructor(
    @Inject(NotificationCenterService)
    private readonly service: NotificationCenterService,
  ) {}

  @Get()
  @Roles('BenhNhan', 'BacSi', 'LeTan', 'QuanTriVien')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: NotificationListQueryDto,
  ): Promise<NotificationListResponse> {
    return this.service.list(user.accountId, query);
  }

  @Get('unread-count')
  @Roles('BenhNhan', 'BacSi', 'LeTan', 'QuanTriVien')
  unreadCount(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UnreadCountResponse> {
    return this.service.unreadCount(user.accountId);
  }

  @Post('read-all')
  @HttpCode(200)
  @Roles('BenhNhan', 'BacSi', 'LeTan', 'QuanTriVien')
  markAllRead(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MarkAllReadResponse> {
    return this.service.markAllRead(user.accountId);
  }

  @Get(':id')
  @Roles('BenhNhan', 'BacSi', 'LeTan', 'QuanTriVien')
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<NotificationItem> {
    return this.service.detail(user.accountId, id);
  }

  @Post(':id/read')
  @HttpCode(200)
  @Roles('BenhNhan', 'BacSi', 'LeTan', 'QuanTriVien')
  markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<MarkReadResponse> {
    return this.service.markRead(user.accountId, id);
  }
}
