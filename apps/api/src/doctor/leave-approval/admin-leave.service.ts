import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppException } from '../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';
import { runReadOnly } from '../../common/transaction/read-only-tx.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';
import {
  formatCalendarDate,
  parseCalendarDate,
} from '../../scheduling/calendar-date.js';
import {
  AdminLeaveRepository,
  type AdminLeaveFilter,
  type AdminLeaveRow,
} from './admin-leave.repository.js';
import type {
  AdminLeaveDetail,
  AdminLeaveItem,
  AdminLeaveListDto,
  AdminLeavePage,
  LeaveStats,
} from './admin-leave.dto.js';

/** Quản trị viên xem danh sách và chi tiết yêu cầu nghỉ (B13; PLAN doctor 5.8, Q28, Q38). Chỉ đọc. Duyệt/từ chối thêm ở B14, B15. */
@Injectable()
export class AdminLeaveService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(AdminLeaveRepository)
    private readonly repository: AdminLeaveRepository,
    @Inject(BranchAccessPolicy) private readonly policy: BranchAccessPolicy,
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
    return {
      items: page.rows.map(toItem),
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
    return { ...toItem(row), lyDo: row.lyDo };
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

function toItem(row: AdminLeaveRow): AdminLeaveItem {
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
