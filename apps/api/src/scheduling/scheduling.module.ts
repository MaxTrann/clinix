import { Module } from '@nestjs/common';
import { BranchHoursReader } from './branch-hours/branch-hours.reader.js';

// Module dùng chung do `doctor` sở hữu; KHÔNG phụ thuộc appointments/ (H20). Các provider khác
// (SlotGeneratorService, AvailableSlotsReader, LeaveReader, ShiftQueries) được thêm ở B1, B5, B6, B7.
@Module({
  providers: [BranchHoursReader],
  exports: [BranchHoursReader],
})
export class SchedulingModule {}
