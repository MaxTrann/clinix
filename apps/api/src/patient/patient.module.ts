import { Module } from '@nestjs/common';
import { ProfileController } from './profile/profile.controller.js';
import { ProfileRepository } from './profile/profile.repository.js';
import { ProfileService } from './profile/profile.service.js';
import { PatientLookupController } from './reception-lookup/patient-lookup.controller.js';
import { PatientLookupRepository } from './reception-lookup/patient-lookup.repository.js';
import { PatientLookupService } from './reception-lookup/patient-lookup.service.js';
import { RelativesController } from './relatives/relatives.controller.js';
import { RelativesRepository } from './relatives/relatives.repository.js';
import { RelativesService } from './relatives/relatives.service.js';

// Module patient (PLAN patient mục 5.1): hồ sơ cá nhân, hồ sơ người thân, tra cứu hồ sơ bệnh nhân.
// Không `imports`: DataSource có sẵn toàn cục từ DatabaseModule (như SearchModule), các repository dùng EntityManager với câu SQL thô nên không cần
// TypeOrmModule.forFeature, và JwtAuthGuard/RolesGuard đã là guard toàn cục nên không cần AuthModule (TRACKING B1-B). Task sau (B6 tra cứu…)
// thêm `imports` chỉ khi có provider cần tới. B1 thêm GET /profile; B3 thêm GET và POST /patient/relatives (RelativesRepository do B7 inject lại, cùng module nên không export);
// B6 thêm GET /reception/patients (PatientLookupRepository cũng do B7 dùng lại).
@Module({
  controllers: [
    ProfileController,
    RelativesController,
    PatientLookupController,
  ],
  providers: [
    ProfileService,
    ProfileRepository,
    RelativesService,
    RelativesRepository,
    PatientLookupService,
    PatientLookupRepository,
  ],
})
export class PatientModule {}
