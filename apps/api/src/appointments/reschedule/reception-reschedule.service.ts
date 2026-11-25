import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { AuditService } from '../../audit/audit.service.js';
import type { AppException } from '../../common/errors/app.exception.js';
import { nowVN } from '../../common/time/time.js';
import { ReceptionScopeService } from '../../rbac/reception-scope.service.js';
import { resolveReceptionBranch } from '../reception-branch.js';
import { AppointmentRescheduleService } from './appointment-reschedule.service.js';
import type { RescheduledResult } from './patient-reschedule.dto.js';
import { toRescheduledResult } from './patient-reschedule.mapper.js';
import { rescheduleFailureException } from './reschedule-failure.js';
import type {
  RescheduleRejection,
  RescheduleWritten,
} from './reschedule.types.js';

/**
 * `Rejected` của B4 sang lỗi API. Hai kiểu riêng của DUYỆT (`RequestNotFound`, `RequestHandled`) chỉ có ở đường `DuyetYeuCau` của B9; ở `DoiHo` không thể xảy ra, nên là lỗi lập trình: ném `Error` thường (ra 500
 * `LOI_HE_THONG`), KHÔNG đoán sang 404 để khỏi che lỗi.
 */
function receptionRejection(rejection: RescheduleRejection): AppException {
  if (
    rejection.kind === 'RequestNotFound' ||
    rejection.kind === 'RequestHandled'
  )
    throw new Error(
      `kết quả của đường duyệt xuất hiện ở đường đổi hộ: ${rejection.kind}`,
    );
  return rescheduleFailureException(rejection);
}

/**
 * `POST /reception/appointments/:maLichHen/reschedule` (reschedule B7; PLAN reschedule 5.5, 5.8, 5.11, Q6, Q9; TRACKING reschedule 1.11). GHÉP các phần đã có, KHÔNG có SQL và KHÔNG mở giao dịch (AR-06):
 *  1. `resolveReceptionBranch` (cùng nơi định nghĩa với route đọc B3 và route ghi B12): chi nhánh của Lễ tân CHỈ từ `ReceptionScopeService`, không từ thân hay query; không hợp lệ ⇒ 403 TRƯỚC mọi thứ.
 *  2. `AppointmentRescheduleService.reschedule` (B4) với `actor` `DoiHo`: không bao giờ `OverQuota`, không tính vào `so_lan_tu_doi_lich`, đổi được cả khi có yêu cầu `ChoDuyet` (KDL-19), hạn là giờ hẹn cộng
 *     `check_in_sau_phut`. B4 gọi thông báo `LichHenDaDoiLich` (Lễ tân đã đổi hộ và lý do) cho tài khoản ĐẶT.
 *  3. `afterWrite` (điểm cắm BẮT BUỘC của B4, chạy TRONG giao dịch sau `markReplaced` và trước thông báo, bằng `em` của giao dịch): ghi Audit `DoiLichHo`. `AuditError` PHẢI nổi (KHÔNG `try/catch`): lỗi ghi nhật ký
 *     hoàn tác TRỌN đổi lịch (lịch mới, hai khung giờ, thông báo; 2.4.70 A1, DLO-08). Hàm này không giữ trạng thái giữa các lần vì thân giao dịch có thể chạy LẠI (1213, 1205).
 * Lỗi mà B4 NÉM (409 `HE_THONG_CHUA_CAU_HINH`, 503 `HE_THONG_DANG_BAN`) đi nguyên, không nuốt. `thoiGianMayChu` lấy SAU khi B4 đã trả (sau commit). Không log: lý do, mã lịch và tên là dữ liệu cá nhân (BDL-01).
 */
@Injectable()
export class ReceptionRescheduleService {
  constructor(
    @Inject(ReceptionScopeService)
    private readonly scopes: ReceptionScopeService,
    @Inject(AppointmentRescheduleService)
    private readonly core: AppointmentRescheduleService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /** `maLichHen` đã qua `ParseAppointmentCodePipe`; `accountId` chỉ từ access token; `lyDo` đã qua DTO (`RequiredReason`: đã cắt khoảng trắng, 1 đến 255, không giống bí mật). */
  async reschedule(
    accountId: string,
    maLichHen: string,
    input: { khungGioId: string; lyDo: string },
  ): Promise<RescheduledResult> {
    const { chiNhanhId } = await resolveReceptionBranch(this.scopes, accountId);
    const outcome = await this.core.reschedule({
      maLichHen,
      khungGioMoiId: input.khungGioId,
      actor: { via: 'DoiHo', chiNhanhId },
      lyDo: input.lyDo,
      afterWrite: (em, written) =>
        this.recordAudit(em, accountId, input.lyDo, written),
    });
    switch (outcome.kind) {
      case 'Rescheduled':
        return toRescheduledResult(outcome, nowVN());
      case 'Rejected':
        throw receptionRejection(outcome.failure);
      case 'OverQuota':
        // Hạn mức chỉ áp cho `TuDoi` (`isOverQuota`): thấy ở đây là lỗi lập trình, không đoán sang mã nghiệp vụ
        throw new Error('đổi hộ không thể ra OverQuota');
    }
  }

  // Ghi Audit `DoiLichHo` (PLAN 5.11): `targetId` là id lịch CŨ, `branchId` là chi nhánh của LỊCH (không phải của Lễ tân), mã lịch là mã CÔNG KHAI, giờ là ISO-8601 có múi giờ. Luật kiểm ở `audit/` (P2).
  private recordAudit(
    em: EntityManager,
    actorId: string,
    lyDo: string,
    written: RescheduleWritten,
  ): Promise<void> {
    return this.audit.record(em, {
      actorId,
      branchId: written.chiNhanhId,
      action: 'DoiLichHo',
      targetType: 'lich_hen',
      targetId: written.lichHenCuId,
      result: 'ThanhCong',
      changes: {
        truoc: {
          ma_lich_hen: written.maLichHenCu,
          thoi_gian: written.thoiGianCu.toISOString(),
        },
        sau: {
          ma_lich_hen: written.maLichHenMoi,
          thoi_gian: written.thoiGianMoi.toISOString(),
        },
        ly_do: lyDo,
      },
    });
  }
}
