import { Module } from '@nestjs/common';
import { BranchHoursReader } from './branch-hours/branch-hours.reader.js';
import { SlotGeneratorService } from './slots/slot-generator.js';

// Module dùng chung do `doctor` sở hữu; KHÔNG phụ thuộc appointments/ (H20). Các provider khác
// (AvailableSlotsReader, LeaveReader, ShiftQueries) được thêm ở B5, B6, B7.
@Module({
  providers: [BranchHoursReader, SlotGeneratorService],
  exports: [BranchHoursReader, SlotGeneratorService],
})
export class SchedulingModule {}
