import { Module } from '@nestjs/common';
import { UploadModule } from '../../common/upload/upload.module.js';
import { RbacModule } from '../../rbac/rbac.module.js';
import {
  SpecialtyController,
  SpecialtyOptionsController,
} from './specialty.controller.js';
import { SpecialtyRepository } from './specialty.repository.js';
import { SpecialtyService } from './specialty.service.js';

@Module({
  imports: [RbacModule, UploadModule],
  controllers: [SpecialtyController, SpecialtyOptionsController],
  providers: [SpecialtyRepository, SpecialtyService],
})
export class SpecialtyModule {}
