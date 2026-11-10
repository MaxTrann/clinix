import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import {
  BranchHoursReader,
  hoursKey,
} from '../../scheduling/branch-hours/branch-hours.reader.js';
import type { CaLamViec } from '../../scheduling/branch-hours/branch-hours.types.js';
import { isoWeekdayOf } from '../../scheduling/branch-hours/time-of-day.js';
import type { LeaveState } from '../../scheduling/leave/leave-overlap.rules.js';
import { LeaveReader } from '../../scheduling/leave/leave.reader.js';
import { ShiftQueries } from '../../scheduling/shifts/shift-queries.js';
import { SHIFT_ERROR_CODES } from '../shifts/shift-assignment.constants.js';
import type { ScheduleQueryDto } from './schedule-view.dto.js';
import { ScheduleViewRepository } from './schedule-view.repository.js';
import {
  MAX_SCHEDULE_DAYS,
  checkScheduleRange,
  leaveStateForShift,
  shiftHours,
} from './schedule-view.rules.js';

export interface DoctorScheduleShift {
  lichLamViecId: string;
  ngay: string;
  ca: CaLamViec;
  chiNhanh: { chiNhanhId: string; ten: string };
  batDau: string | null;
  ketThuc: string | null;
  gioCaKhongCon: boolean;
  nghiPhep: LeaveState | null;
  // `soLichHen` cố ý KHÔNG có: chưa có booking D14 thì không hiện "0 lịch" sai (XL-18, Q18).
}

/** Lịch làm việc của CHÍNH Bác sĩ đang đăng nhập (PLAN doctor 5.6): `bac_si_id` luôn là tài khoản trong token. */
@Injectable()
export class ScheduleViewService {
  constructor(
    @Inject(ScheduleViewRepository)
    private readonly repository: ScheduleViewRepository,
    @Inject(ShiftQueries) private readonly shifts: ShiftQueries,
    @Inject(LeaveReader) private readonly leaves: LeaveReader,
    @Inject(BranchHoursReader) private readonly branchHours: BranchHoursReader,
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
    const hours = await this.branchHours.loadMany(
      em,
      allShifts.map((s) => ({
        chiNhanhId: s.chiNhanhId,
        thuTrongTuan: isoWeekdayOf(s.ngay),
      })),
    );

    // Danh sách chọn chi nhánh lấy từ MỌI ca trong khoảng (chưa lọc) để không mất lựa chọn sau khi lọc (XL-02).
    const chiNhanhLoc = [
      ...new Map(
        allShifts.map((s) => [
          s.chiNhanhId,
          { chiNhanhId: s.chiNhanhId, ten: s.chiNhanhTen },
        ]),
      ).values(),
    ];
    const ca: DoctorScheduleShift[] = allShifts
      .filter((s) => !query.ca || s.ca === query.ca)
      .filter((s) => !query.chiNhanhId || s.chiNhanhId === query.chiNhanhId)
      .map((s) => ({
        lichLamViecId: s.lichLamViecId,
        ngay: s.ngay,
        ca: s.ca,
        chiNhanh: { chiNhanhId: s.chiNhanhId, ten: s.chiNhanhTen },
        ...shiftHours(
          s.ca,
          hours.get(
            hoursKey({
              chiNhanhId: s.chiNhanhId,
              thuTrongTuan: isoWeekdayOf(s.ngay),
            }),
          ) ?? null,
        ),
        nghiPhep: leaveStateForShift(leaves, s),
      }));

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
