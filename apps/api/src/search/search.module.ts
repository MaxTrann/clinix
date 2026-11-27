import { Module } from '@nestjs/common';
import { PublicBranchController } from './branches/public-branch.controller.js';
import { PublicBranchRepository } from './branches/public-branch.repository.js';
import { PublicBranchService } from './branches/public-branch.service.js';
import { PublicServiceController } from './services/public-service.controller.js';
import { PublicServiceRepository } from './services/public-service.repository.js';
import { PublicServiceService } from './services/public-service.service.js';
import { PublicDoctorController } from './doctors/public-doctor.controller.js';
import { PublicDoctorRepository } from './doctors/public-doctor.repository.js';
import { PublicDoctorService } from './doctors/public-doctor.service.js';
import { ExamPriceReader } from '../pricing/exam-price.reader.js';
import { DoctorRatingReader } from './ratings/doctor-rating.reader.js';
import { PublicSpecialtyController } from './specialties/public-specialty.controller.js';
import { PublicSpecialtyRepository } from './specialties/public-specialty.repository.js';
import { PublicSpecialtyService } from './specialties/public-specialty.service.js';
import { PublicSuggestionController } from './suggestions/public-suggestion.controller.js';
import { PublicSuggestionRepository } from './suggestions/public-suggestion.repository.js';
import { PublicSuggestionService } from './suggestions/public-suggestion.service.js';
import { PublicClinicInfoRepository } from './site/public-clinic-info.repository.js';
import { PublicClinicInfoService } from './site/public-clinic-info.service.js';
import { PublicOverviewRepository } from './site/public-overview.repository.js';
import { PublicOverviewService } from './site/public-overview.service.js';
import { PublicSiteController } from './site/public-site.controller.js';
import { SchedulingModule } from '../scheduling/scheduling.module.js';
import { PublicSlotController } from './slots/public-slot.controller.js';
import { PublicSlotRepository } from './slots/public-slot.repository.js';
import { PublicSlotService } from './slots/public-slot.service.js';

// Module tra cứu công khai (chỉ đọc). Các task B2–B9 thêm controller/provider vào đây.
// Không import module admin: chúng không export gì; DataSource có sẵn toàn cục từ DatabaseModule.
// Search Slots PR-C1: import SchedulingModule (do `doctor` sở hữu, đã xuất AvailableSlotsReader) để đọc khung giờ trống; không import appointments/doctor.
@Module({
  imports: [SchedulingModule],
  controllers: [
    PublicSiteController,
    PublicBranchController,
    PublicSpecialtyController,
    PublicServiceController,
    PublicDoctorController,
    PublicSuggestionController,
    PublicSlotController,
  ],
  providers: [
    PublicClinicInfoService,
    PublicClinicInfoRepository,
    PublicOverviewService,
    PublicOverviewRepository,
    PublicBranchService,
    PublicBranchRepository,
    PublicSpecialtyService,
    PublicSpecialtyRepository,
    PublicServiceService,
    PublicServiceRepository,
    PublicDoctorService,
    PublicDoctorRepository,
    PublicSuggestionService,
    PublicSuggestionRepository,
    PublicSlotService,
    PublicSlotRepository,
    ExamPriceReader,
    DoctorRatingReader,
  ],
  // chatbot B2 (T7): chỉ xuất `PublicDoctorService` để module `chatbot` lấy danh sách bác sĩ công khai (danh sách trắng như tra cứu); không xuất repository.
  exports: [PublicDoctorService],
})
export class SearchModule {}
