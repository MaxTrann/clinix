import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { runReadOnly } from '../../common/transaction/read-only-tx.js';
import { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { dayBounds } from './list-query.rules.js';
import type { ListOrder } from './list-query.sql.js';
import { toOperationsItem } from './operations-appointment.mapper.js';
import {
  OPERATIONS_DEFAULT_STATES,
  type OperationsAppointmentsPage,
  type OperationsAppointmentsQuery,
} from './operations-appointments.dto.js';
import {
  OperationsAppointmentsRepository,
  type OperationsAppointmentDetailRow,
  type OperationsAppointmentFilter,
} from './operations-appointments.repository.js';

/**
 * Danh sách và chi tiết lịch hẹn cho nhân sự, DÙNG CHUNG cho Lễ tân (B3) và Quản trị viên (B4) (PLAN booking 5.8, Q32; TRACKING 3.17 B3-C, B3-D). Chỉ khác nhau ở `AdminScope`
 * và chiều sắp xếp do service của vai trò truyền vào. Chỉ đọc, không khoá, không log (mã lịch, tên, SĐT là dữ liệu cá nhân).
 *
 * `scope` luôn do SERVER giải từ DB (Lễ tân: `ReceptionScopeService`; Quản trị viên: `AdminScopeGuard`), không từ query. `BranchAccessPolicy.branchFilter` quyết chi nhánh vào SQL: phạm vi
 * `ChiNhanh` luôn dùng chi nhánh của phạm vi và BỎ QUA `chiNhanhId` của query (DSV-01, DSV-02); chỉ `ToanHeThong` dùng `chiNhanhId` làm bộ lọc, hoặc không lọc (DSV-03).
 */
@Injectable()
export class OperationsAppointmentsService {
  constructor(
    @Inject(DataSource) private readonly dataSource: DataSource,
    @Inject(OperationsAppointmentsRepository)
    private readonly appointments: OperationsAppointmentsRepository,
    @Inject(BranchAccessPolicy) private readonly policy: BranchAccessPolicy,
  ) {}

  /** Hai câu trong MỘT lần gọi `runReadOnly` (một ảnh chụp): `total` luôn khớp trang dù có ghi đồng thời. Không `demTheoTrangThai` (B3, câu (b)). */
  async list(
    scope: AdminScope,
    query: OperationsAppointmentsQuery,
    order: ListOrder,
  ): Promise<OperationsAppointmentsPage> {
    const { from, to } = dayBounds(query.tuNgay, query.denNgay);
    const filter: OperationsAppointmentFilter = {
      chiNhanhId: this.policy.branchFilter(scope, query.chiNhanhId),
      states: query.trangThai ?? OPERATIONS_DEFAULT_STATES,
      bacSiId: query.bacSiId ?? null,
      chuyenKhoaId: query.chuyenKhoaId ?? null,
      dichVuKhamId: query.dichVuKhamId ?? null,
      from,
      to,
      keyword: query.q ?? null,
    };
    return runReadOnly(this.dataSource, async (manager) => {
      const total = await this.appointments.count(manager, filter);
      // Chỉ lấy trang khi `offset < total`: `page` rất lớn (DTO không chặn trên) không bao giờ gửi `OFFSET` khổng lồ cho MySQL, nơi nó báo lỗi 1064 ra 500
      const rows =
        query.offset < total
          ? await this.appointments.findPage(
              manager,
              filter,
              order,
              query.pageSize,
              query.offset,
            )
          : [];
      return {
        items: rows.map(toOperationsItem),
        total,
        page: query.page,
        pageSize: query.pageSize,
      };
    });
  }

  /**
   * Hàng chi tiết của `maLichHen` TRONG phạm vi; `null` khi lịch ngoài chi nhánh hay không tồn tại (cùng một kết quả, H10). Chạy trong `manager` của người gọi để các cổng và cấu hình
   * mà service của vai trò đọc thêm cùng ảnh chụp với hàng này. `maLichHen` đã được `ParseAppointmentCodePipe` chuẩn hoá.
   */
  findDetail(
    manager: EntityManager,
    scope: AdminScope,
    maLichHen: string,
  ): Promise<OperationsAppointmentDetailRow | null> {
    return this.appointments.findDetail(
      manager,
      this.policy.branchFilter(scope),
      maLichHen,
    );
  }
}
