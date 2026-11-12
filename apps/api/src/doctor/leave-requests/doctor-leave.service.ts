import { Inject, Injectable, Logger } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { AppException } from '../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';
import { nowVN, toSecond, todayVN } from '../../common/time/time.js';
import { BranchHoursReader } from '../../scheduling/branch-hours/branch-hours.reader.js';
import type { CaLamViec } from '../../scheduling/branch-hours/branch-hours.types.js';
import { shiftWindow } from '../../scheduling/branch-hours/shift-window.rules.js';
import { isoWeekdayOf } from '../../scheduling/branch-hours/time-of-day.js';
import {
  leaveCoversShift,
  type LeaveWindow,
} from '../../scheduling/leave/leave-overlap.rules.js';
import { LeaveReader } from '../../scheduling/leave/leave.reader.js';
import { shouldRetry } from '../common/mysql-errors.js';
import {
  APPOINTMENT_LEAVE_READ_PORT,
  type AppointmentLeaveReadPort,
} from '../leave-approval/appointment-leave-read.port.js';
import {
  LEAVE_EVENTS,
  LeaveNotifier,
} from '../notifications/leave-notifier.js';
import type { CreateLeaveRequestDto } from './doctor-leave.dto.js';
import { countActiveAppointments } from './leave-impact.js';
import {
  DoctorLeaveRepository,
  type DoctorForLeave,
  type ShiftInRange,
} from './doctor-leave.repository.js';
import {
  LEAVE_ERROR_CODES,
  MAX_PENDING_REQUESTS,
} from './leave-request.constants.js';
import {
  checkLeaveDates,
  isShiftEnded,
  leaveWindowsOverlap,
  normalizeReason,
  validateLeaveShape,
} from './leave-request.rules.js';

export interface CreatedLeaveRequest {
  yeuCauNghiPhepId: string;
  trangThai: 'ChoDuyet';
  hinhThuc: 'CaNgay' | 'TheoCa';
  tuNgay: string;
  denNgay: string;
  ca: CaLamViec | null;
  /** Số ca trong lịch làm việc bị yêu cầu này phủ (Q20). */
  soCaBiAnhHuong: number;
  /** Số lịch hẹn đang có trong các ca bị phủ (Q22, D14, B17). Vắng khi không đọc được `booking` (không hiện số sai). */
  soLichHenDangCo?: number;
}

interface ValidatedLeave {
  bacSiId: string;
  hinhThuc: 'CaNgay' | 'TheoCa';
  tuNgay: string;
  denNgay: string;
  ca: CaLamViec | null;
  lyDo: string;
}

const MESSAGES: Record<string, string> = {
  [LEAVE_ERROR_CODES.PAST_DATE]: 'Không thể xin nghỉ cho ngày đã qua.',
  [LEAVE_ERROR_CODES.RANGE_TOO_LONG]: 'Khoảng nghỉ tối đa 31 ngày.',
  [LEAVE_ERROR_CODES.TOO_FAR]: 'Chỉ xin nghỉ trong 90 ngày tới.',
  [LEAVE_ERROR_CODES.OUTSIDE_SCHEDULE]:
    'Ngày/ca xin nghỉ không có trong lịch làm việc đã phân công của bạn.',
  [LEAVE_ERROR_CODES.DUPLICATE]: 'Bạn đã có yêu cầu nghỉ trùng thời gian này.',
  [LEAVE_ERROR_CODES.TOO_MANY_PENDING]:
    'Bạn đang có quá nhiều yêu cầu chờ duyệt.',
  [LEAVE_ERROR_CODES.SHIFT_ENDED]: 'Ca này đã kết thúc trong hôm nay.',
};

/** Tạo yêu cầu xin nghỉ phép (PLAN doctor 5.7). Bác sĩ chỉ tạo cho CHÍNH MÌNH: `bacSiId` luôn lấy từ token. */
@Injectable()
export class DoctorLeaveService {
  constructor(
    @Inject(DoctorLeaveRepository)
    private readonly repository: DoctorLeaveRepository,
    @Inject(LeaveReader) private readonly leaveReader: LeaveReader,
    @Inject(BranchHoursReader) private readonly branchHours: BranchHoursReader,
    @Inject(LeaveNotifier) private readonly notifier: LeaveNotifier,
    @Inject(APPOINTMENT_LEAVE_READ_PORT)
    private readonly appointments: AppointmentLeaveReadPort,
  ) {}

  private readonly logger = new Logger(DoctorLeaveService.name);

  async create(
    bacSiId: string,
    dto: CreateLeaveRequestDto,
  ): Promise<CreatedLeaveRequest> {
    // Kiểm chéo trường và lý do trước mọi thao tác DB (400, loi[]).
    const fieldErrors = validateLeaveShape(dto);
    const reason = normalizeReason(dto.lyDo);
    if (fieldErrors.length > 0 || !reason.ok) {
      throw new AppException(400, COMMON_ERROR_CODES.INVALID_DATA, {
        thongBao: 'Dữ liệu không hợp lệ.',
        loi: fieldErrors,
      });
    }

    // `now` chốt MỘT lần cho cả luồng (H18), kể cả khi giao dịch phải chạy lại.
    const now = nowVN();
    const today = todayVN(now);
    const dateError = checkLeaveDates({
      tuNgay: dto.tuNgay,
      denNgay: dto.denNgay,
      today,
    });
    if (dateError !== null) throw conflict(dateError);

    const input: ValidatedLeave = {
      bacSiId,
      hinhThuc: dto.hinhThuc,
      tuNgay: dto.tuNgay,
      denNgay: dto.denNgay,
      ca: dto.hinhThuc === 'TheoCa' ? (dto.ca as CaLamViec) : null,
      lyDo: reason.value,
    };
    for (let attempt = 0; ; attempt += 1) {
      try {
        const { created, shiftIds } = await this.repository.transaction((em) =>
          this.createInTransaction(em, input, now, today),
        );
        // SAU commit: lỗi đọc số lịch hẹn không được làm hỏng một yêu cầu đã tạo (không thể bấm lại: sẽ trùng).
        const soLichHenDangCo = await countActiveAppointments(
          this.appointments,
          shiftIds,
          this.logger,
        );
        return soLichHenDangCo === undefined
          ? created
          : { ...created, soLichHenDangCo };
      } catch (error) {
        // Deadlock/hết chờ khoá xảy ra trước commit nên chạy lại cả giao dịch là an toàn.
        if (shouldRetry(error, attempt)) continue;
        throw error;
      }
    }
  }

  private async createInTransaction(
    em: EntityManager,
    input: ValidatedLeave,
    now: Date,
    today: string,
  ): Promise<{ created: CreatedLeaveRequest; shiftIds: string[] }> {
    // 1. Khoá bác sĩ: mọi kiểm tra bên dưới đúng cho tới khi commit (hai yêu cầu giống hệt chạy lần lượt: DH-02).
    const doctor = await this.repository.lockDoctor(em, input.bacSiId);
    if (doctor === null) {
      throw new AppException(404, COMMON_ERROR_CODES.NOT_FOUND);
    }

    // 2. Trần số yêu cầu đang chờ.
    const pending = await this.repository.countPending(em, input.bacSiId);
    if (pending >= MAX_PENDING_REQUESTS) {
      throw conflict(LEAVE_ERROR_CODES.TOO_MANY_PENDING);
    }

    // 3. Chồng nhau với yêu cầu ChoDuyet/DaDuyet (Q21). `chiTiet` chỉ có mã yêu cầu, không lộ lý do.
    const window: LeaveWindow = {
      hinhThucNghi: input.hinhThuc,
      ngayBatDau: input.tuNgay,
      ngayKetThuc: input.denNgay,
      ca: input.ca,
    };
    const existing = await this.leaveReader.listBlocking(em, {
      bacSiIds: [input.bacSiId],
      tuNgay: input.tuNgay,
      denNgay: input.denNgay,
    });
    const clash = existing.find((leave) => leaveWindowsOverlap(leave, window));
    if (clash !== undefined) {
      throw conflict(LEAVE_ERROR_CODES.DUPLICATE, {
        yeuCauNghiPhepId: clash.yeuCauNghiPhepId,
      });
    }

    // 4. Phải có ca trong lịch làm việc (Q20): TheoCa đúng (ngày, ca); CaNgay ít nhất một ca trong khoảng.
    const shifts = await this.repository.findShiftsInRange(
      em,
      input.bacSiId,
      input.tuNgay,
      input.denNgay,
    );
    const covered = shifts.filter((shift) => leaveCoversShift(window, shift));
    if (covered[0] === undefined) {
      throw conflict(LEAVE_ERROR_CODES.OUTSIDE_SCHEDULE);
    }
    if (input.hinhThuc === 'TheoCa' && input.tuNgay === today) {
      await this.assertShiftNotEnded(em, covered[0], now);
    }

    // 5. Ghi yêu cầu, rồi thông báo trong CÙNG giao dịch: lỗi ghi thông báo hoàn tác cả yêu cầu (H12, YN-18).
    const id = await this.repository.insert(em, {
      ...input,
      thoiDiemTao: toSecond(now),
    });
    await this.notifyCreated(em, input, doctor);

    return {
      created: {
        yeuCauNghiPhepId: id,
        trangThai: 'ChoDuyet',
        hinhThuc: input.hinhThuc,
        tuNgay: input.tuNgay,
        denNgay: input.denNgay,
        ca: input.ca,
        soCaBiAnhHuong: covered.length,
      },
      shiftIds: covered.map((shift) => shift.lichLamViecId),
    };
  }

  /** `TheoCa` hôm nay chỉ nhận khi ca CHƯA kết thúc (Q24); giờ ca tính theo chi nhánh ghi trên ca. */
  private async assertShiftNotEnded(
    em: EntityManager,
    shift: ShiftInRange,
    now: Date,
  ): Promise<void> {
    const hours = await this.branchHours.load(
      em,
      shift.chiNhanhId,
      isoWeekdayOf(shift.ngay),
    );
    if (isShiftEnded(shiftWindow(shift.ca, hours), now)) {
      throw conflict(LEAVE_ERROR_CODES.SHIFT_ENDED);
    }
  }

  /** Bác sĩ nhận xác nhận đã gửi; Admin có thẩm quyền nhận thông báo chờ duyệt (Q33). Thông báo không chứa lý do (H10). */
  private async notifyCreated(
    em: EntityManager,
    input: ValidatedLeave,
    doctor: DoctorForLeave,
  ): Promise<void> {
    const common = {
      bacSiId: input.bacSiId,
      chiNhanhId: doctor.chiNhanhId,
      tenBacSi: doctor.hoTen,
      ngayBatDau: input.tuNgay,
      ngayKetThuc: input.denNgay,
      ca: input.ca,
    };
    await this.notifier.notify(em, {
      loaiSuKien: LEAVE_EVENTS.Submitted,
      ...common,
    });
    await this.notifier.notify(em, {
      loaiSuKien: LEAVE_EVENTS.Pending,
      ...common,
    });
  }
}

function conflict(maLoi: string, chiTiet?: unknown): AppException {
  return new AppException(409, maLoi, {
    thongBao: MESSAGES[maLoi],
    ...(chiTiet !== undefined && { chiTiet }),
  });
}
