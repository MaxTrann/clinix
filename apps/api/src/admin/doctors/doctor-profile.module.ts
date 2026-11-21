import { Module } from '@nestjs/common';
import { ExamPriceReader } from '../../pricing/exam-price.reader.js';
import { RbacModule } from '../../rbac/rbac.module.js';
import { DoctorController } from './doctor.controller.js';
import { DoctorRepository } from './doctor.repository.js';
import { DoctorService } from './doctor.service.js';

// Hồ sơ bác sĩ trong trang quản trị (admin B12, B13 sau). Tên `DoctorProfileModule` để khỏi trùng `DoctorModule` của module `doctor/`.
// `ExamPriceReader` không có module riêng: khai provider như `appointments.module.ts` (chỉ cần `DataSource` toàn cục).
@Module({
  imports: [RbacModule],
  controllers: [DoctorController],
  providers: [DoctorRepository, DoctorService, ExamPriceReader],
})
export class DoctorProfileModule {}
