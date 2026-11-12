import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppException } from '../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';
import type { Paged } from '../../common/paging/paged.js';
import { nowVN, todayVN } from '../../common/time/time.js';
import { runReadOnly } from '../../common/transaction/read-only-tx.js';
import {
  APPOINTMENT_LEAVE_READ_PORT,
  type AppointmentLeaveReadPort,
} from '../leave-approval/appointment-leave-read.port.js';
import {
  DoctorLeaveHistoryRepository,
  type LeaveRequestRow,
} from './doctor-leave-history.repository.js';
import { countActiveAppointments } from './leave-impact.js';
import type {
  LeaveHistoryQueryDto,
  LeaveRequestView,
} from './leave-history.dto.js';

/** Lịch sử và chi tiết yêu cầu nghỉ của Bác sĩ (B12; PLAN doctor 5.7). Chỉ đọc; `bacSiId` luôn lấy từ token. */
@Injectable()
export class DoctorLeaveHistoryService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(DoctorLeaveHistoryRepository)
    private readonly repository: DoctorLeaveHistoryRepository,
    @Inject(APPOINTMENT_LEAVE_READ_PORT)
    private readonly appointments: AppointmentLeaveReadPort,
  ) {}

  private readonly logger = new Logger(DoctorLeaveHistoryService.name);

  async list(
    bacSiId: string,
    query: LeaveHistoryQueryDto,
  ): Promise<Paged<LeaveRequestView>> {
    const status = query.trangThai ?? null;
    // Một ảnh chụp cho cả hai câu để `total` khớp `items`.
    const { rows, total } = await runReadOnly(this.db, async (em) => ({
      rows: await this.repository.findPage(
        em,
        bacSiId,
        status,
        query.pageSize,
        query.offset,
      ),
      total: await this.repository.count(em, bacSiId, status),
    }));
    return {
      items: rows.map(toView),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(bacSiId: string, id: string): Promise<LeaveRequestView> {
    const { row, shiftIds } = await runReadOnly(this.db, async (em) => {
      const found = await this.repository.findOne(em, bacSiId, id);
      if (found === null) return { row: null, shiftIds: [] as string[] };
      // Chỉ yêu cầu còn hiệu lực (ChoDuyet/DaDuyet) và chỉ các ca từ hôm nay trở đi mới có "hệ quả" (bước huỷ của Duyệt không đụng lịch đã qua giờ).
      const today = todayVN(nowVN());
      const shiftIds =
        found.trangThai === 'TuChoi'
          ? []
          : await this.repository.findShiftIds(em, {
              bacSiId,
              tuNgay: found.tuNgay > today ? found.tuNgay : today,
              denNgay: found.denNgay,
              ca: found.ca,
            });
      return { row: found, shiftIds };
    });
    // Không có và của người khác: cùng 404, cùng thân.
    if (row === null) throw new AppException(404, COMMON_ERROR_CODES.NOT_FOUND);
    if (row.trangThai === 'TuChoi') return toView(row);
    const soLichHenDangCo = await countActiveAppointments(
      this.appointments,
      shiftIds,
      this.logger,
    );
    return soLichHenDangCo === undefined
      ? toView(row)
      : { ...toView(row), soLichHenDangCo };
  }
}

function toView(row: LeaveRequestRow): LeaveRequestView {
  return {
    yeuCauNghiPhepId: row.yeuCauNghiPhepId,
    trangThai: row.trangThai,
    hinhThuc: row.hinhThuc,
    tuNgay: row.tuNgay,
    denNgay: row.denNgay,
    ca: row.ca,
    lyDo: row.lyDo,
    thoiDiemTao: row.thoiDiemTao.toISOString(),
    thoiDiemXuLy: row.thoiDiemXuLy?.toISOString() ?? null,
  };
}
