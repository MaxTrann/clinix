import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { BranchHoursReader } from '../../scheduling/branch-hours/branch-hours.reader.js';
import { LeaveReader } from '../../scheduling/leave/leave.reader.js';
import { ShiftQueries } from '../../scheduling/shifts/shift-queries.js';
import { SHIFT_ERROR_CODES } from '../shifts/shift-assignment.constants.js';
import {
  AdminScheduleRepository,
  type DoctorFilter,
} from './admin-schedule.repository.js';
import {
  MAX_SCHEDULE_DAYS,
  checkScheduleRange,
} from './schedule-view.rules.js';
import { hoursPairsOf, toShiftView } from './shift-view.js';

interface Paging {
  page: number;
  pageSize: number;
  offset: number;
}

export interface GridQuery extends Paging {
  tuNgay?: string;
  denNgay?: string;
  bacSiId?: string;
  chuyenKhoaId?: string;
  ca?: 'CaSang' | 'CaChieu';
  q?: string;
}

export interface GridScope {
  /** Chi nhánh dùng để kiểm `bacSiId` có thuộc phạm vi không; không có ⇒ Toàn hệ thống (chỉ cần bác sĩ tồn tại). */
  scopeBranchId?: string;
  /** Chi nhánh để LỌC danh sách và ca: bằng `scopeBranchId`, hoặc chi nhánh Toàn hệ thống chọn thêm. */
  filterBranchId?: string;
  /** Lỗi khi `bacSiId` ngoài phạm vi hoặc không tồn tại: Admin 404 (admin Q40), Lễ tân 403 (Q13); CÙNG thân cho cả hai trường hợp. */
  outOfScope: () => AppException;
}

/**
 * Lõi dùng chung của "lưới lịch bác sĩ" cho Quản trị viên (B9) và Lễ tân (B8). Hai vai trò chỉ khác cách xác định phạm vi và mã lỗi
 * khi `bacSiId` ngoài phạm vi; truy vấn, vị từ phạm vi (`doctorScopePredicate`) và cách dựng ca nằm một chỗ này.
 */
@Injectable()
export class ScheduleGridService {
  constructor(
    @Inject(AdminScheduleRepository)
    private readonly repository: AdminScheduleRepository,
    @Inject(ShiftQueries) private readonly shifts: ShiftQueries,
    @Inject(LeaveReader) private readonly leaves: LeaveReader,
    @Inject(BranchHoursReader) private readonly branchHours: BranchHoursReader,
  ) {}

  listDoctors(
    filterBranchId: string | undefined,
    query: Paging & Pick<DoctorFilter, 'chuyenKhoaId' | 'q'>,
  ) {
    return this.repository.listDoctors(
      this.repository.manager,
      {
        chiNhanhId: filterBranchId,
        chuyenKhoaId: query.chuyenKhoaId,
        q: query.q,
      },
      query,
    );
  }

  /** Mỗi bác sĩ của trang kèm các ca trong khoảng; ca lọc theo chi nhánh ngay trong SQL nên ca ngoài phạm vi không rời DB (H10). */
  async getGrid(scope: GridScope, query: GridQuery) {
    const range = checkScheduleRange(query.tuNgay, query.denNgay);
    if (!range.ok)
      throw new AppException(400, SHIFT_ERROR_CODES.INVALID_DATE_RANGE, {
        thongBao: 'Khoảng ngày không hợp lệ.',
        chiTiet: { toiDaNgay: MAX_SCHEDULE_DAYS },
      });
    const { tuNgay, denNgay } = range;
    const em = this.repository.manager;

    // Kiểm trước khi áp các bộ lọc khác để lọc chuyên khoa/tên không làm lộ thêm gì về bác sĩ ngoài phạm vi.
    if (
      query.bacSiId !== undefined &&
      !(await this.repository.existsInScope(
        em,
        query.bacSiId,
        scope.scopeBranchId,
      ))
    )
      throw scope.outOfScope();

    const page = await this.repository.listDoctors(
      em,
      {
        chiNhanhId: scope.filterBranchId,
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
        chiNhanhId: scope.filterBranchId,
      })
    ).filter((shift) => !query.ca || shift.ca === query.ca);
    // Chỉ nghỉ ChoDuyet/DaDuyet; TuChoi chỉ dành cho chính Bác sĩ (Q16). Không có lý do nghỉ.
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
