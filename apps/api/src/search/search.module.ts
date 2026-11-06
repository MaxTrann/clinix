import { Module } from '@nestjs/common';
import { PublicBranchController } from './branches/public-branch.controller.js';
import { PublicBranchRepository } from './branches/public-branch.repository.js';
import { PublicBranchService } from './branches/public-branch.service.js';
import { PublicServiceController } from './services/public-service.controller.js';
import { PublicServiceRepository } from './services/public-service.repository.js';
import { PublicServiceService } from './services/public-service.service.js';
import { ExamPriceReader } from './pricing/exam-price.reader.js';
import { DoctorRatingReader } from './ratings/doctor-rating.reader.js';
import { PublicSpecialtyController } from './specialties/public-specialty.controller.js';
import { PublicSpecialtyRepository } from './specialties/public-specialty.repository.js';
import { PublicSpecialtyService } from './specialties/public-specialty.service.js';
import { PublicClinicInfoRepository } from './site/public-clinic-info.repository.js';
import { PublicClinicInfoService } from './site/public-clinic-info.service.js';
import { PublicSiteController } from './site/public-site.controller.js';

// Module tra cứu công khai (chỉ đọc). Các task B2–B9 thêm controller/provider vào đây.
// Không import module admin: chúng không export gì; DataSource có sẵn toàn cục từ DatabaseModule.
@Module({
  controllers: [
    PublicSiteController,
    PublicBranchController,
    PublicSpecialtyController,
    PublicServiceController,
  ],
  providers: [
    PublicClinicInfoService,
    PublicClinicInfoRepository,
    PublicBranchService,
    PublicBranchRepository,
    PublicSpecialtyService,
    PublicSpecialtyRepository,
    PublicServiceService,
    PublicServiceRepository,
    ExamPriceReader,
    DoctorRatingReader,
  ],
})
export class SearchModule {}
