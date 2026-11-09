import { Module } from '@nestjs/common';
import { BranchHoursReader } from './branch-hours/branch-hours.reader.js';
import { LeaveReader } from './leave/leave.reader.js';
import { SlotGeneratorService } from './slots/slot-generator.js';

// Module dùng chung do `doctor` sở hữu; KHÔNG phụ thuộc appointments/ (H20). Các provider khác
// (AvailableSlotsReader, ShiftQueries) được thêm ở B6, B7. B5: LeaveReader (D4).
@Module({
  providers: [BranchHoursReader, SlotGeneratorService, LeaveReader],
  exports: [BranchHoursReader, SlotGeneratorService, LeaveReader],
})
export class SchedulingModule {}
