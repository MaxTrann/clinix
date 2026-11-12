import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { BranchHoursReader } from '../../scheduling/branch-hours/branch-hours.reader.js';
import { LeaveReader } from '../../scheduling/leave/leave.reader.js';
import {
  APPOINTMENT_LEAVE_READ_PORT,
  type AppointmentLeaveReadPort,
} from '../leave-approval/appointment-leave-read.port.js';
import { ShiftQueries } from '../../scheduling/shifts/shift-queries.js';
import { SHIFT_ERROR_CODES } from '../shifts/shift-assignment.constants.js';
import type { ScheduleQueryDto } from './schedule-view.dto.js';
import { ScheduleViewRepository } from './schedule-view.repository.js';
import {
  MAX_SCHEDULE_DAYS,
  checkScheduleRange,
} from './schedule-view.rules.js';
import {
  hoursPairsOf,
  toShiftView,
  type DoctorScheduleShift,
} from './shift-view.js';

/** Lịch làm việc của CHÍNH Bác sĩ đang đăng nhập (PLAN doctor 5.6): `bac_si_id` luôn là tài khoản trong token. */
@Injectable()
export class ScheduleViewService {
  constructor(
    @Inject(ScheduleViewRepository)
    private readonly repository: ScheduleViewRepository,
    @Inject(ShiftQueries) private readonly shifts: ShiftQueries,
    @Inject(LeaveReader) private readonly leaves: LeaveReader,
    @Inject(BranchHoursReader) private readonly branchHours: BranchHoursReader,
    @Inject(APPOINTMENT_LEAVE_READ_PORT)
    private readonly appointments: AppointmentLeaveReadPort,
  ) {}

  async getSchedule(bacSiId: string, query: ScheduleQueryDto) {
    const range = checkScheduleRange(query.tuNgay, query.denNgay);
    if (!range.ok)
      throw new AppException(400, SHIFT_ERROR_CODES.INVALID_DATE_RANGE, {
        thongBao: 'Khoảng ngày không hợp lệ.',
        chiTiet: { toiDaNgay: MAX_SCHEDULE_DAYS },
      });
    const { tuNgay, denNgay } = range;
    const em = this.repository.manager;

    const allShifts = await this.shifts.listDoctorShifts(em, {
      bacSiId,
      tuNgay,
      denNgay,
    });
    const blocking = await this.leaves.listBlocking(em, {
      bacSiIds: [bacSiId],
      tuNgay,
      denNgay,
    });
    const refused = await this.repository.listRefusedLeaves(em, {
      bacSiId,
      tuNgay,
      denNgay,
    });
    const leaves = [...blocking, ...refused];
    const hours = await this.branchHours.loadMany(em, hoursPairsOf(allShifts));

    // Danh sách chọn chi nhánh lấy từ MỌI ca trong khoảng (chưa lọc) để không mất lựa chọn sau khi lọc (XL-02).
    const chiNhanhLoc = [
      ...new Map(
        allShifts.map((s) => [
          s.chiNhanhId,
          { chiNhanhId: s.chiNhanhId, ten: s.chiNhanhTen },
        ]),
      ).values(),
    ];
    const shown = allShifts
      .filter((s) => !query.ca || s.ca === query.ca)
      .filter((s) => !query.chiNhanhId || s.chiNhanhId === query.chiNhanhId);
    // D14 (B17, Q18): một lần đếm cho mọi ca hiển thị
    const activeCounts = await this.appointments.countByShifts(
      shown.map((s) => s.lichLamViecId),
    );
    const ca: DoctorScheduleShift[] = shown.map((s) =>
      toShiftView(s, { activeCounts, leaves, hours }),
    );

    return {
      tuNgay,
      denNgay,
      ca,
      // Không trả `ly_do`: màn hình lịch chỉ cần ngày và trạng thái.
      nghiPhep: leaves
        .map((l) => ({
          yeuCauNghiPhepId: l.yeuCauNghiPhepId,
          hinhThuc: l.hinhThucNghi,
          tuNgay: l.ngayBatDau,
          denNgay: l.ngayKetThuc,
          ca: l.ca,
          trangThai: l.trangThai,
        }))
        .sort(
          (a, b) => Number(a.yeuCauNghiPhepId) - Number(b.yeuCauNghiPhepId),
        ),
      chiNhanhLoc,
    };
  }
}
