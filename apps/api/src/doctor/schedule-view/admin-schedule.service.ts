import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';
import { BranchHoursReader } from '../../scheduling/branch-hours/branch-hours.reader.js';
import { LeaveReader } from '../../scheduling/leave/leave.reader.js';
import { ShiftQueries } from '../../scheduling/shifts/shift-queries.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';
import { SHIFT_ERROR_CODES } from '../shifts/shift-assignment.constants.js';
import { AdminScheduleRepository } from './admin-schedule.repository.js';
import type {
  AdminDoctorListDto,
  AdminScheduleGridDto,
} from './admin-schedule.dto.js';
import {
  MAX_SCHEDULE_DAYS,
  checkScheduleRange,
} from './schedule-view.rules.js';
import { hoursPairsOf, toShiftView } from './shift-view.js';

/** Quản trị viên xem lịch bác sĩ (PLAN doctor 5.6). Toàn hệ thống: mọi chi nhánh; Chi nhánh: chỉ bác sĩ và ca thuộc chi nhánh mình. */
@Injectable()
export class AdminScheduleService {
  constructor(
    @Inject(AdminScheduleRepository)
    private readonly repository: AdminScheduleRepository,
    @Inject(BranchAccessPolicy) private readonly policy: BranchAccessPolicy,
    @Inject(ShiftQueries) private readonly shifts: ShiftQueries,
    @Inject(LeaveReader) private readonly leaves: LeaveReader,
    @Inject(BranchHoursReader) private readonly branchHours: BranchHoursReader,
  ) {}

  /** Danh sách bác sĩ để chọn. Admin Chi nhánh bị ÉP chi nhánh của mình, `chiNhanhId` gửi lên bị bỏ qua. */
  listDoctors(scope: AdminScope, query: AdminDoctorListDto) {
    return this.repository.listDoctors(
      this.repository.manager,
      {
        chiNhanhId: this.policy.branchFilter(scope, query.chiNhanhId),
        chuyenKhoaId: query.chuyenKhoaId,
        q: query.q,
      },
      query,
    );
  }

  /** Lưới: mỗi bác sĩ của trang kèm các ca trong khoảng (ca lọc theo chi nhánh ngay trong SQL). */
  async getGrid(scope: AdminScope, query: AdminScheduleGridDto) {
    const range = checkScheduleRange(query.tuNgay, query.denNgay);
    if (!range.ok)
      throw new AppException(400, SHIFT_ERROR_CODES.INVALID_DATE_RANGE, {
        thongBao: 'Khoảng ngày không hợp lệ.',
        chiTiet: { toiDaNgay: MAX_SCHEDULE_DAYS },
      });
    const { tuNgay, denNgay } = range;
    const em = this.repository.manager;
    const chiNhanhId = this.policy.branchFilter(scope, query.chiNhanhId);

    // Bác sĩ ngoài phạm vi và không tồn tại cùng 404 (admin Q40), kiểm trước khi áp các bộ lọc khác.
    if (
      query.bacSiId !== undefined &&
      !(await this.repository.existsInScope(
        em,
        query.bacSiId,
        this.policy.branchFilter(scope),
      ))
    )
      throw new AppException(404, COMMON_ERROR_CODES.NOT_FOUND);

    const page = await this.repository.listDoctors(
      em,
      {
        chiNhanhId,
        chuyenKhoaId: query.chuyenKhoaId,
        bacSiId: query.bacSiId,
        q: query.q,
      },
      query,
    );
    const bacSiIds = page.items.map((doctor) => doctor.bacSiId);
    const shifts = (
      await this.shifts.listShiftsOfDoctors(em, {
        bacSiIds,
        tuNgay,
        denNgay,
        chiNhanhId,
      })
    ).filter((shift) => !query.ca || shift.ca === query.ca);
    // Admin chỉ thấy nghỉ ChoDuyet/DaDuyet; TuChoi chỉ dành cho chính Bác sĩ (Q16).
    const leaves = await this.leaves.listBlocking(em, {
      bacSiIds,
      tuNgay,
      denNgay,
    });
    const hours = await this.branchHours.loadMany(em, hoursPairsOf(shifts));

    return {
      tuNgay,
      denNgay,
      ...page,
      items: page.items.map((doctor) => {
        const myLeaves = leaves.filter(
          (leave) => leave.bacSiId === doctor.bacSiId,
        );
        return {
          ...doctor,
          ca: shifts
            .filter((shift) => shift.bacSiId === doctor.bacSiId)
            .map((shift) => toShiftView(shift, { leaves: myLeaves, hours })),
        };
      }),
    };
  }
}
