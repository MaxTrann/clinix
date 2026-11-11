import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SystemConfigService } from '../../admin/system-config/system-config.service.js';
import { AppException } from '../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';
import { nowVN, toSecond } from '../../common/time/time.js';
import { runReadOnly } from '../../common/transaction/read-only-tx.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import type { ReceptionScope } from '../../rbac/reception-scope.js';
import { ReceptionScopeService } from '../../rbac/reception-scope.service.js';
import {
  PAYMENT_SUMMARY_PORT,
  type PaymentSummaryPort,
} from '../ports/payment.port.js';
import {
  allowedTargets,
  type TransitionContext,
} from '../state/appointment-state.matrix.js';
import { toOperationsDetail } from './operations-appointment.mapper.js';
import type {
  OperationsAppointmentsPage,
  OperationsAppointmentsQuery,
  ReceptionAppointmentDetail,
} from './operations-appointments.dto.js';
import { OperationsAppointmentsService } from './operations-appointments.service.js';

/**
 * Danh sách và chi tiết lịch hẹn cho LỄ TÂN (task B3; PLAN booking 5.8, 5.9, Q32, Q34; TRACKING 3.17). Phần truy vấn là của `OperationsAppointmentsService` (dùng chung với Quản trị viên, B4);
 * ở đây chỉ có phần riêng của Lễ tân: giải phạm vi chi nhánh, chiều sắp xếp, `chuyenDuoc[]` và `conPhaiThu`. Chỉ đọc, không khoá, không log.
 *
 * Chi nhánh đọc từ DB ở MỖI request (`ReceptionScopeService`, không cache, không nhận từ token hay query): đổi chi nhánh hoặc khoá tài khoản có hiệu lực ở request sau; tài khoản không còn
 * hiệu lực ra 403 `KHONG_DU_QUYEN` trước khi đọc bất kỳ lịch hẹn nào.
 */
@Injectable()
export class ReceptionAppointmentsService {
  constructor(
    @Inject(DataSource) private readonly dataSource: DataSource,
    @Inject(ReceptionScopeService)
    private readonly scopes: ReceptionScopeService,
    @Inject(OperationsAppointmentsService)
    private readonly operations: OperationsAppointmentsService,
    @Inject(PAYMENT_SUMMARY_PORT) private readonly payments: PaymentSummaryPort,
    @Inject(SystemConfigService) private readonly configs: SystemConfigService,
  ) {}

  /**
   * Phạm vi chi nhánh của Lễ tân, kiểm LẠI lúc chạy. Với `chiNhanhId = undefined` thì phần dùng chung hiểu là "không lọc chi nhánh" (dành cho Quản trị viên Toàn hệ thống, B4): nếu một
   * ngày `ReceptionScopeService` trả nhầm `ToanHeThong` hay thiếu `chiNhanhId`, danh sách Lễ tân sẽ mở toàn hệ thống mà không ai biết. Nên chỉ nhận đúng `ChiNhanh` có `chiNhanhId` là chuỗi,
   * còn lại 403 `KHONG_DU_QUYEN` như chính `ReceptionScopeService` (một mã chung cho mọi nhánh từ chối, không lộ lý do). Gán vào biến kiểu `AdminScope` để kiểm được kiểu lúc chạy.
   */
  private async receptionScope(accountId: string): Promise<ReceptionScope> {
    const scope: AdminScope = await this.scopes.resolve(accountId);
    if (scope.kind !== 'ChiNhanh' || typeof scope.chiNhanhId !== 'string')
      throw new AppException(403, 'KHONG_DU_QUYEN');
    return scope;
  }

  /** Lễ tân xem theo `thoi_gian` TĂNG dần (chip "Hôm nay" là mặc định của giao diện: lịch sớm nhất trước), rồi `lich_hen_id` tăng. */
  async list(
    accountId: string,
    query: OperationsAppointmentsQuery,
  ): Promise<OperationsAppointmentsPage> {
    const scope = await this.receptionScope(accountId);
    return this.operations.list(scope, query, 'ASC');
  }

  /**
   * Chi tiết MỘT lịch trong chi nhánh của Lễ tân. Lịch ngoài chi nhánh và lịch không tồn tại ra CÙNG một 404 `KHONG_TIM_THAY` từ cùng một nhánh mã (H10, DSV-09, QB-04).
   * `conPhaiThu` chỉ ở `DaXacNhan` (ô duy nhất của ma trận cần nó: `DaXacNhan` sang `DaTiepDon`), đọc qua cổng trong CÙNG giao dịch chỉ đọc với hàng lịch; trạng thái khác là `null`.
   * `chuyenDuoc[]` = `allowedTargets('LeTan', …)` của ma trận P1 (không viết luật lần hai). Thiếu `cau_hinh_he_thong` thì không có cửa sổ tiếp đón: `DaTiepDon`, `VangMat` bị bỏ,
   * `DaHuy` vẫn có, KHÔNG 409 (409 `HE_THONG_CHUA_CAU_HINH` là của route ghi, B12; CT-10).
   */
  async detail(
    accountId: string,
    maLichHen: string,
  ): Promise<ReceptionAppointmentDetail> {
    const scope = await this.receptionScope(accountId);
    const read = await runReadOnly(this.dataSource, async (manager) => {
      const row = await this.operations.findDetail(manager, scope, maLichHen);
      if (row === null) return null;
      const conPhaiThu =
        row.trangThai === 'DaXacNhan'
          ? await this.payments.remainingToCollect(manager, row.lichHenId)
          : null;
      return { row, conPhaiThu };
    });
    // Ném SAU khi giao dịch đã đóng, ở MỘT chỗ duy nhất cho mọi lý do "không xem được"
    if (read === null)
      throw new AppException(404, COMMON_ERROR_CODES.NOT_FOUND);

    // Cấu hình và giờ lấy sau khi đọc xong: giờ gần lúc gửi nhất; cấu hình là một dòng ít đổi, không cần chung ảnh chụp
    const config = await this.configs.get();
    const ctx: TransitionContext = {};
    if (config !== null)
      ctx.window = {
        now: toSecond(nowVN()),
        thoiGian: read.row.thoiGian,
        truocPhut: config.checkInTruocPhut,
        sauPhut: config.checkInSauPhut,
      };
    if (read.conPhaiThu !== null) ctx.conPhaiThu = read.conPhaiThu;
    return {
      ...toOperationsDetail(read.row),
      chuyenDuoc: allowedTargets('LeTan', read.row.trangThai, ctx),
      conPhaiThu: read.conPhaiThu,
    };
  }
}
