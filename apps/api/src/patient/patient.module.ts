import { Module } from '@nestjs/common';

// Module patient (PLAN patient mục 5.1): hồ sơ cá nhân, hồ sơ người thân, tra cứu hồ sơ bệnh nhân. Task P1 chỉ dựng khung,
// chưa có controller, provider hay repository nào. Task sau (B1 GET /profile, B3 người thân, B6 tra cứu…) tự thêm `imports`
// (AuthModule, TypeOrmModule.forFeature của entity mình dùng), `controllers` và `providers` khi cần.
@Module({})
export class PatientModule {}
