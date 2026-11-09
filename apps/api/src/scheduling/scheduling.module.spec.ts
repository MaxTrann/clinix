import { Test } from '@nestjs/testing';
import { BranchHoursReader } from './branch-hours/branch-hours.reader.js';
import { LeaveReader } from './leave/leave.reader.js';
import { SchedulingModule } from './scheduling.module.js';

// Doctor P2 — SchedulingModule dựng được độc lập (không kéo module khác) và xuất BranchHoursReader cho booking/search.
describe('SchedulingModule', () => {
  it('tự dựng được và cung cấp BranchHoursReader, LeaveReader', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [SchedulingModule],
    }).compile();
    expect(moduleRef.get(BranchHoursReader)).toBeInstanceOf(BranchHoursReader);
    expect(moduleRef.get(LeaveReader)).toBeInstanceOf(LeaveReader);
  });
});
