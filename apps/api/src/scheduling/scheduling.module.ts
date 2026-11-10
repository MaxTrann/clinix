import { Module } from '@nestjs/common';
import { BranchHoursReader } from './branch-hours/branch-hours.reader.js';
import { LeaveReader } from './leave/leave.reader.js';
import { AvailableSlotsReader } from './slots/available-slots.reader.js';
import { SlotGeneratorService } from './slots/slot-generator.js';

// Module dùng chung do `doctor` sở hữu; KHÔNG phụ thuộc appointments/ (H20). ShiftQueries được thêm ở B7.
// B5: LeaveReader (D4). B6: AvailableSlotsReader (D3).
@Module({
  providers: [
    BranchHoursReader,
    SlotGeneratorService,
    LeaveReader,
    AvailableSlotsReader,
  ],
  exports: [
    BranchHoursReader,
    SlotGeneratorService,
    LeaveReader,
    AvailableSlotsReader,
  ],
})
export class SchedulingModule {}
