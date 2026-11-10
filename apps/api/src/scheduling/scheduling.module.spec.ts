import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AvailableSlotsReader } from './slots/available-slots.reader.js';
import { BranchHoursReader } from './branch-hours/branch-hours.reader.js';
import { LeaveReader } from './leave/leave.reader.js';
import { SchedulingModule } from './scheduling.module.js';

// Doctor P2 — SchedulingModule dựng được độc lập (không kéo module khác) và xuất BranchHoursReader cho booking/search.
describe('SchedulingModule', () => {
  it('tự dựng được và cung cấp BranchHoursReader, LeaveReader', async () => {
    // AvailableSlotsReader cần DataSource (do AppModule/TypeOrmModule cấp); ở đây giả để dựng module độc lập.
    const moduleRef = await Test.createTestingModule({
      imports: [SchedulingModule],
    })
      .useMocker((token) => (token === DataSource ? {} : undefined))
      .compile();
    expect(moduleRef.get(AvailableSlotsReader)).toBeInstanceOf(
      AvailableSlotsReader,
    );
    expect(moduleRef.get(BranchHoursReader)).toBeInstanceOf(BranchHoursReader);
    expect(moduleRef.get(LeaveReader)).toBeInstanceOf(LeaveReader);
  });
});
