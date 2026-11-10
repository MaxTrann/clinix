import { Module } from '@nestjs/common';
import { BranchHoursReader } from './branch-hours/branch-hours.reader.js';
import { LeaveReader } from './leave/leave.reader.js';
import { ShiftQueries } from './shifts/shift-queries.js';
import { AvailableSlotsReader } from './slots/available-slots.reader.js';
import { SlotGeneratorService } from './slots/slot-generator.js';

// Module dùng chung do `doctor` sở hữu; KHÔNG phụ thuộc appointments/ (H20).
// B5: LeaveReader (D4). B6: AvailableSlotsReader (D3). B7: ShiftQueries (đọc ca dùng chung với admin).
@Module({
  providers: [
    BranchHoursReader,
    SlotGeneratorService,
    LeaveReader,
    AvailableSlotsReader,
    ShiftQueries,
  ],
  exports: [
    BranchHoursReader,
    SlotGeneratorService,
    LeaveReader,
    AvailableSlotsReader,
    ShiftQueries,
  ],
})
export class SchedulingModule {}
