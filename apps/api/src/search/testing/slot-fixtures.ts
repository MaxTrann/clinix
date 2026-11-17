import type { DataSource } from 'typeorm';
import { DoctorFixtures } from '../../doctor/testing/doctor-fixtures.js';
import { BranchHoursReader } from '../../scheduling/branch-hours/branch-hours.reader.js';
import { LeaveReader } from '../../scheduling/leave/leave.reader.js';
import { AvailableSlotsReader } from '../../scheduling/slots/available-slots.reader.js';
import { PublicSlotRepository } from '../slots/public-slot.repository.js';
import { PublicSlotService } from '../slots/public-slot.service.js';
import { SearchFixtures } from './search-fixtures.js';

/** Service khung giờ công khai dựng bằng reader, repository THẬT trên `db` (cùng cách `SearchModule` nối). */
export function buildSlotService(db: DataSource) {
  const reader = new AvailableSlotsReader(
    db,
    new BranchHoursReader(),
    new LeaveReader(),
  );
  const repository = new PublicSlotRepository();
  return {
    service: new PublicSlotService(db, repository, reader),
    repository,
    reader,
  };
}

/**
 * Dữ liệu cho test khung giờ công khai (Search Slots PR-C1): bác sĩ CÔNG KHAI (`SearchFixtures`) cộng ca và khung giờ (`DoctorFixtures`).
 * Chỉ ghi vào DB `*_test`. Không có câu ghi `khung_gio` ở đây: ca nào cần đổi trạng thái ô thì tự ghi ở file `*.int-spec.ts` của nó.
 */
export class SlotFixtures {
  readonly search: SearchFixtures;
  readonly doctors: DoctorFixtures;

  constructor(private readonly db: DataSource) {
    this.search = new SearchFixtures(db);
    this.doctors = new DoctorFixtures(db);
  }

  /** Chi nhánh có lịch đủ 7 thứ (08–12, 13–17). */
  async branch() {
    const branch = await this.search.branchWithCoordinates();
    await this.search.admin.weeklySchedule(branch.chiNhanhId);
    return branch;
  }

  /** Thêm ca (mặc định sáng và chiều, ô 30 phút) cho một bác sĩ đã có; trả id ô theo thứ tự ca rồi giờ. */
  async addShifts(
    doctor: Awaited<ReturnType<SearchFixtures['publicDoctor']>>,
    ngay: string,
    cas: readonly ('CaSang' | 'CaChieu')[] = ['CaSang', 'CaChieu'],
  ) {
    const slotIds: string[] = [];
    for (const ca of cas) {
      const made = await this.doctors.shiftWithSlots(doctor.profile, {
        ngay,
        ca,
      });
      slotIds.push(...made.slotIds);
    }
    return slotIds;
  }

  /** Bác sĩ CÔNG KHAI kèm ca và khung giờ trong `ngay`. */
  async publicDoctorWithShifts(
    branch: Awaited<ReturnType<SlotFixtures['branch']>>,
    ngay: string,
    cas?: readonly ('CaSang' | 'CaChieu')[],
  ) {
    const doctor = await this.search.publicDoctor(branch);
    const slotIds = await this.addShifts(doctor, ngay, cas);
    return { doctor, id: doctor.account.taiKhoanId, slotIds };
  }
}
