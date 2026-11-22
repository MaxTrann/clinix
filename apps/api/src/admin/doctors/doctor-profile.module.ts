import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module.js';
import { ExamPriceReader } from '../../pricing/exam-price.reader.js';
import { RbacModule } from '../../rbac/rbac.module.js';
import { DoctorController } from './doctor.controller.js';
import { DoctorRepository } from './doctor.repository.js';
import { DoctorService } from './doctor.service.js';
import { DoctorUpdateRepository } from './doctor-update.repository.js';
import { DoctorUpdateService } from './doctor-update.service.js';

// Hồ sơ bác sĩ trong trang quản trị (admin B12 đọc, B13 sửa; B13 ghi audit `DoiChiNhanhBacSi` nên import `AuditModule`). Tên `DoctorProfileModule` để khỏi trùng `DoctorModule` của module `doctor/`.
// `ExamPriceReader` không có module riêng: khai provider như `appointments.module.ts` (chỉ cần `DataSource` toàn cục).
@Module({
  imports: [RbacModule, AuditModule],
  controllers: [DoctorController],
  providers: [
    DoctorRepository,
    DoctorService,
    ExamPriceReader,
    DoctorUpdateRepository,
    DoctorUpdateService,
  ],
})
export class DoctorProfileModule {}
