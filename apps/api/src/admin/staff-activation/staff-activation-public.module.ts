import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { ActivationLinkRepository } from './activation-link.repository.js';
import { StaffActivationController } from './staff-activation.controller.js';
import { StaffActivationRepository } from './staff-activation.repository.js';
import { StaffActivationService } from './staff-activation.service.js';

// Kích hoạt tài khoản nhân sự CÔNG KHAI (task B16): hai route `POST /staff-activation/validate` và `/complete`.
// Tách khỏi StaffActivationModule (B14) có chủ đích: module đó chỉ xuất ActivationLinkService cho B15, B20 và test NSB14-24 khẳng định điều đó với hạ tầng giả;
// nhập AuthModule (cần PasswordHasher) vào đó sẽ kéo AuthModule vào đồ thị của B15, B20. Module này được AppModule nhập trực tiếp.
// ActivationLinkRepository là lớp không phụ thuộc gì (chỉ cần `lockAccount`), đăng ký lại ở đây thay vì sao chép câu lệnh.
// DataSource là toàn cục (TypeOrmModule.forRoot); PasswordHasher do AuthModule xuất.
@Module({
  imports: [AuthModule],
  controllers: [StaffActivationController],
  providers: [
    ActivationLinkRepository,
    StaffActivationRepository,
    StaffActivationService,
  ],
})
export class StaffActivationPublicModule {}
