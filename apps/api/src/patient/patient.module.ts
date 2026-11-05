import { Module } from '@nestjs/common';
import { ProfileController } from './profile/profile.controller.js';
import { ProfileRepository } from './profile/profile.repository.js';
import { ProfileService } from './profile/profile.service.js';

// Module patient (PLAN patient mục 5.1): hồ sơ cá nhân, hồ sơ người thân, tra cứu hồ sơ bệnh nhân.
// Không `imports`: DataSource có sẵn toàn cục từ DatabaseModule (như SearchModule), các repository dùng EntityManager với câu SQL thô nên không cần
// TypeOrmModule.forFeature, và JwtAuthGuard/RolesGuard đã là guard toàn cục nên không cần AuthModule (TRACKING B1-B). Task sau (B3 người thân, B6 tra cứu…)
// thêm `imports` chỉ khi có provider cần tới. B1 thêm GET /profile.
@Module({
  controllers: [ProfileController],
  providers: [ProfileService, ProfileRepository],
})
export class PatientModule {}
