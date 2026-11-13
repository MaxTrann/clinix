import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { AppException } from '../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';
import { runReadOnly } from '../../common/transaction/read-only-tx.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import {
  PAYMENT_SUMMARY_PORT,
  type PaymentSummaryPort,
} from '../ports/payment.port.js';
import { allowedTargets } from '../state/appointment-state.matrix.js';
import type { AdminAppointmentDetail } from './admin-appointments.dto.js';
import { AppointmentHistoryReader } from './appointment-history.reader.js';
import { toOperationsDetail } from './operations-appointment.mapper.js';
import type {
  OperationsAppointmentsPage,
  OperationsAppointmentsQuery,
} from './operations-appointments.dto.js';
import type { OperationsAppointmentDetailRow } from './operations-appointments.repository.js';
import { OperationsAppointmentsService } from './operations-appointments.service.js';

/**
 * Phạm vi do `AdminScopeGuard` giải từ DB ở MỖI request, nhưng `BranchAccessPolicy.branchFilter` hiểu `chiNhanhId = undefined` là "không lọc chi nhánh" (dành cho Toàn hệ thống): một phạm vi hỏng
 * (kind lạ, hay `ChiNhanh` thiếu `chiNhanhId` chuỗi) sẽ mở toàn hệ thống mà không ai biết. Nên kiểm LẠI hình dạng lúc chạy, 403 `KHONG_DU_QUYEN` như guard (cùng lý do với M11 của B3).
 */
function assertScopeShape(scope: AdminScope): void {
  const shape: { kind?: unknown; chiNhanhId?: unknown } = scope;
  if (shape.kind === 'ToanHeThong') return;
  if (shape.kind === 'ChiNhanh' && typeof shape.chiNhanhId === 'string') return;
  throw new AppException(403, 'KHONG_DU_QUYEN');
}

/**
 * Danh sách và chi tiết lịch hẹn cho QUẢN TRỊ VIÊN (task B4; PLAN booking 5.8, 5.9, Q32; TRACKING 3.33). Phần truy vấn là của `OperationsAppointmentsService` (dùng chung với Lễ tân, B3); ở đây chỉ có
 * phần riêng của Quản trị viên: chiều sắp xếp GIẢM dần (Figma `511:2`), `chuyenDuoc[]` theo ma trận Q24 và panel "Lịch sử trạng thái". Chỉ đọc, không khoá, không log.
 *
 * Phạm vi do SERVER giải (guard), không từ query: `ChiNhanh` luôn dùng chi nhánh được gán và BỎ QUA `chiNhanhId` của query (DSV-02), `ToanHeThong` dùng `chiNhanhId` hoặc không lọc (DSV-03);
 * việc đó nằm trong `OperationsAppointmentsService`/`BranchAccessPolicy.branchFilter` và điều kiện chi nhánh nằm TRONG SQL.
 */
@Injectable()
export class AdminAppointmentsService {
  constructor(
    @Inject(DataSource) private readonly dataSource: DataSource,
    @Inject(OperationsAppointmentsService)
    private readonly operations: OperationsAppointmentsService,
    @Inject(PAYMENT_SUMMARY_PORT) private readonly payments: PaymentSummaryPort,
    @Inject(AppointmentHistoryReader)
    private readonly history: AppointmentHistoryReader,
  ) {}

  /** Quản trị viên xem theo `thoi_gian` GIẢM dần (lịch mới nhất trước), rồi `lich_hen_id` giảm. Trang vượt cuối ⇒ `items: []`. */
  async list(
    scope: AdminScope,
    query: OperationsAppointmentsQuery,
  ): Promise<OperationsAppointmentsPage> {
    assertScopeShape(scope);
    return this.operations.list(scope, query, 'DESC');
  }

  /**
   * Chi tiết MỘT lịch trong phạm vi. Lịch ngoài phạm vi và lịch không tồn tại ra CÙNG một 404 `KHONG_TIM_THAY` từ cùng một nhánh mã (H10, DSV-09, QB-05); nhật ký CHỈ được đọc khi lịch đã qua phạm vi.
   * Hàng chi tiết, `conPhaiThu` (qua cổng) và panel cùng MỘT lần `runReadOnly` nên cùng ảnh chụp.
   */
  async detail(
    scope: AdminScope,
    maLichHen: string,
  ): Promise<AdminAppointmentDetail> {
    assertScopeShape(scope);
    const read = await runReadOnly(this.dataSource, async (manager) => {
      const row = await this.operations.findDetail(manager, scope, maLichHen);
      if (row === null) return null;
      return {
        row,
        conPhaiThu: await this.payable(manager, row),
        history: await this.history.read(manager, row.lichHenId),
      };
    });
    // Ném SAU khi giao dịch đã đóng, ở MỘT chỗ duy nhất cho mọi lý do "không xem được"
    if (read === null)
      throw new AppException(404, COMMON_ERROR_CODES.NOT_FOUND);
    return {
      ...toOperationsDetail(read.row),
      chuyenDuoc: allowedTargets('QuanTriVien', read.row.trangThai),
      conPhaiThu: read.conPhaiThu,
      lichSuTrangThai: read.history,
    };
  }

  // Như Lễ tân: số còn phải thu CHỈ ở `DaXacNhan` (trạng thái khác `null`, tránh số vô nghĩa như "còn phải thu" của lịch đã huỷ), đọc trong cùng giao dịch với hàng lịch
  private payable(
    manager: EntityManager,
    row: OperationsAppointmentDetailRow,
  ): Promise<string | null> {
    return row.trangThai === 'DaXacNhan'
      ? this.payments.remainingToCollect(manager, row.lichHenId)
      : Promise.resolve(null);
  }
}
