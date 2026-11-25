import {
  Module,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { NotificationCenterController } from './notification-center.controller.js';
import { NotificationCenterRepository } from './notification-center.repository.js';
import { NotificationCenterService } from './notification-center.service.js';

/**
 * Thông báo là dữ liệu cá nhân: không cho trình duyệt hay proxy lưu (TTB-15, BTB-03). Đặt bằng middleware vì middleware chạy TRƯỚC guard toàn cục,
 * nên cả 401 (guard từ chối, chưa vào controller), 400 (pipe) và 404 đều có header này, không riêng nhánh thành công.
 */
export function noStore(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.setHeader('Cache-Control', 'no-store');
  next();
}

// Trung tâm thông báo (notification B2). Không `imports`: DataSource toàn cục từ DatabaseModule, JwtAuthGuard và RolesGuard là guard toàn cục (nếp PatientModule).
// Không export: chưa module nào khác cần đọc thông báo.
@Module({
  controllers: [NotificationCenterController],
  providers: [NotificationCenterService, NotificationCenterRepository],
})
export class NotificationCenterModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(noStore).forRoutes(NotificationCenterController);
  }
}
