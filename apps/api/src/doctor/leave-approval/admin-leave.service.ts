import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppException } from '../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';
import { nowVN, toSecond } from '../../common/time/time.js';
import { runReadOnly } from '../../common/transaction/read-only-tx.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';
import {
  formatCalendarDate,
  parseCalendarDate,
} from '../../scheduling/calendar-date.js';
import { AFFECTED_PREVIEW_LIMIT } from './admin-leave.constants.js';
import {
  AdminLeaveRepository,
  type AdminLeaveFilter,
  type AdminLeaveRow,
} from './admin-leave.repository.js';
import {
  APPOINTMENT_LEAVE_READ_PORT,
  type AppointmentLeaveReadPort,
} from './appointment-leave-read.port.js';
import type {
  AdminLeaveDetail,
  AdminLeaveItem,
  AdminLeaveListDto,
  AdminLeavePage,
  AffectedAppointmentsView,
  LeaveStats,
} from './admin-leave.dto.js';

/**
 * Quản trị viên xem danh sách và chi tiết yêu cầu nghỉ (B13; PLAN doctor 5.8, Q28, Q38). Chỉ đọc. Số lịch hẹn bị ảnh hưởng (D13) nối ở B17: hỏi `booking` qua `AppointmentLeaveReadPort`
 * với MỘT mốc `now` cho cả phản hồi (cùng cận `thoi_gian > now` với bước huỷ của Duyệt). Yêu cầu `TuChoi` không ảnh hưởng ai nên trả `null`.
 */
@Injectable()
export class AdminLeaveService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(AdminLeaveRepository)
    private readonly repository: AdminLeaveRepository,
    @Inject(BranchAccessPolicy) private readonly policy: BranchAccessPolicy,
    @Inject(APPOINTMENT_LEAVE_READ_PORT)
    private readonly appointments: AppointmentLeaveReadPort,
  ) {}

  async list(
    scope: AdminScope,
    query: AdminLeaveListDto,
  ): Promise<AdminLeavePage> {
    const filter = this.toFilter(scope, query);
    // Một ảnh chụp cho trang, COUNT và thẻ thống kê: ba con số luôn khớp nhau.
    const { page, counts } = await runReadOnly(this.db, async (em) => ({
      page: await this.repository.findPage(em, filter, query.trangThai, query),
      counts: await this.repository.countByStatus(em, filter),
    }));
    // Mỗi dòng ChoDuyet/DaDuyet một lần đếm (tối đa `pageSize` ≤ 100 câu đọc nhẹ, tuần tự để không chiếm hết kết nối); `limit = 0` nên không đọc dòng nào.
    const now = toSecond(nowVN());
    const items: AdminLeaveItem[] = [];
    for (const row of page.rows) {
      const summary = await this.affectedOf(row, now, 0);
      items.push({
        ...toItem(row),
        soLichHenBiAnhHuong: summary?.tong ?? null,
      });
    }
    return {
      items,
      total: page.total,
      page: query.page,
      pageSize: query.pageSize,
      thongKe: toStats(counts),
    };
  }

  async get(scope: AdminScope, id: string): Promise<AdminLeaveDetail> {
    const row = await runReadOnly(this.db, (em) =>
      this.repository.findOne(em, id),
    );
    if (row === null) throw new AppException(404, COMMON_ERROR_CODES.NOT_FOUND);
    // Chi nhánh lấy từ DB (chi nhánh HIỆN TẠI của bác sĩ, Q28); ngoài phạm vi ⇒ 404 cùng thân với "không có".
    this.policy.assertCanSee(scope, row.chiNhanhId);
    const summary = await this.affectedOf(
      row,
      toSecond(nowVN()),
      AFFECTED_PREVIEW_LIMIT,
    );
    const lichHenBiAnhHuong: AffectedAppointmentsView | null =
      summary === null
        ? null
        : {
            tong: summary.tong,
            soBenhNhan: summary.soBenhNhan,
            soCoCoc: summary.soCoCoc,
            conNua: summary.tong > summary.items.length,
            items: summary.items,
          };
    return {
      ...toItem(row),
      soLichHenBiAnhHuong: summary?.tong ?? null,
      lyDo: row.lyDo,
      lichHenBiAnhHuong,
    };
  }

  /** D13 cho một yêu cầu; `TuChoi` ⇒ `null` (không hỏi booking). */
  private affectedOf(row: AdminLeaveRow, now: Date, limit: number) {
    if (row.trangThai === 'TuChoi') return Promise.resolve(null);
    return this.appointments.listAffected({
      bacSiId: row.bacSiId,
      tuNgay: row.tuNgay,
      denNgay: row.denNgay,
      ...(row.ca === null ? {} : { ca: row.ca }),
      now,
      limit,
    });
  }

  /** Admin Chi nhánh bị ÉP chi nhánh của mình; `chiNhanhId` gửi lên chỉ có tác dụng với Toàn hệ thống. */
  private toFilter(
    scope: AdminScope,
    query: AdminLeaveListDto,
  ): AdminLeaveFilter {
    return {
      chiNhanhId: this.policy.branchFilter(scope, query.chiNhanhId),
      bacSiId: query.bacSiId,
      q: query.q,
      from:
        query.tuNgayGui !== undefined
          ? `${query.tuNgayGui} 00:00:00`
          : undefined,
      // Khoảng nửa mở: hết ngày `denNgayGui` = 00:00 của ngày kế (gồm cả ngày cuối, không bọc DATE()).
      to:
        query.denNgayGui !== undefined
          ? `${nextDay(query.denNgayGui)} 00:00:00`
          : undefined,
    };
  }
}

/** Ngày kế tiếp của một ngày lịch đã được DTO kiểm là hợp lệ. */
function nextDay(day: string): string {
  return formatCalendarDate((parseCalendarDate(day) as number) + 1);
}

function toStats(counts: Partial<Record<string, number>>): LeaveStats {
  const choDuyet = counts.ChoDuyet ?? 0;
  const daDuyet = counts.DaDuyet ?? 0;
  const tuChoi = counts.TuChoi ?? 0;
  return { choDuyet, daDuyet, tuChoi, tong: choDuyet + daDuyet + tuChoi };
}

function toItem(
  row: AdminLeaveRow,
): Omit<AdminLeaveItem, 'soLichHenBiAnhHuong'> {
  return {
    yeuCauNghiPhepId: row.yeuCauNghiPhepId,
    trangThai: row.trangThai,
    hinhThuc: row.hinhThuc,
    tuNgay: row.tuNgay,
    denNgay: row.denNgay,
    ca: row.ca,
    thoiDiemTao: row.thoiDiemTao.toISOString(),
    thoiDiemXuLy: row.thoiDiemXuLy?.toISOString() ?? null,
    bacSi: { bacSiId: row.bacSiId, hoTen: row.bacSiHoTen },
    chuyenKhoa: { ten: row.chuyenKhoaTen },
    chiNhanh: { chiNhanhId: row.chiNhanhId, ten: row.chiNhanhTen },
  };
}
