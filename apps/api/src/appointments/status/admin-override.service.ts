import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SystemConfigService } from '../../admin/system-config/system-config.service.js';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import { AuditService } from '../../audit/audit.service.js';
import { AppException } from '../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';
import { nowVN, toSecond } from '../../common/time/time.js';
import { runReadOnly } from '../../common/transaction/read-only-tx.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';
import { AppointmentCancellationService } from '../cancel/appointment-cancellation.service.js';
import { cancelOutcomeException } from '../cancel/cancel-failure.js';
import { withBookingTransaction } from '../locking/booking-transaction.js';
import { canTransition } from '../state/appointment-state.matrix.js';
import { AppointmentTransitionService } from '../state/appointment-transition.service.js';
import {
  readLichHenKeysByCode,
  type LichHenOwnerKeys,
} from '../state/lich-hen-keys.query.js';
import type { OnChanged } from '../state/on-changed.js';
import type {
  AdminOverrideDto,
  AdminOverrideResult,
} from './admin-override.dto.js';
import {
  invalidTransitionException,
  onlyDoctorCompletesException,
  statusFailureException,
} from './status-failure.js';

// Quản trị viên OVERRIDE trạng thái lịch hẹn (task B14; PLAN booking 5.7, 5.9, Q17, Q24, Q27; TRACKING 3.31 B14-C, B14-E). Điều phối: phạm vi (404), MỘT mốc `now` và cấu hình đọc NGOÀI giao dịch, rẽ theo đích sang lõi
// ĐÃ CÓ của từng đích, và ghi audit `OverrideLichHen` CÙNG giao dịch với việc đổi (điểm cắm `onChanged` của lõi: `state/on-changed.ts`). Controller chỉ nhận và trả. Kết quả có kiểu của lõi đổi sang lỗi API SAU khi giao dịch đã
// đóng, ở MỘT chỗ có sẵn (`cancelOutcomeException` cho huỷ, `statusFailureException` cho ba đích còn lại).
//
//  - `DaHuy`     ⇒ `AppointmentCancellationService.cancel` (reason `QtvOverride`, hoàn 100% cọc đã thu; họ A: tự mở giao dịch, hook chạy trong đó).
//  - `VangMat`   ⇒ `markNoShow` (cộng no-show, bật cờ khoá khi đạt ngưỡng, thông báo; CẦN cấu hình: thiếu ⇒ 409 `HE_THONG_CHUA_CAU_HINH`).
//  - `DaTiepDon` ⇒ `checkIn` biến thể `QuanTriVien` (không cửa sổ, không `conPhaiThu`; không cần cấu hình).
//  - `DaXacNhan` ⇒ `restoreConfirmed` (không đụng khung giờ và `benh_nhan`).
//  - `HoanThanh`, `ChoThanhToan`, `DaDoiLich` ⇒ đường CHỈ-TỪ-CHỐI (đọc thường, không khoá, không ghi): `HoanThanh` ⇒ `CHI_BAC_SI_HOAN_THANH`, hai đích kia ⇒ `CHUYEN_TRANG_THAI_KHONG_HOP_LE`.
// `truoc` của audit là trạng thái NGUỒN do lõi đọc DƯỚI khoá (không phải bản đọc thường ở đây): hai Quản trị viên đua nhau vẫn ghi đúng `truoc` của từng lần. Thân giao dịch chạy lại được khi 1213, 1205
// (`withBookingTransaction`; lõi huỷ tự chạy lại): đóng gói `onChanged` không giữ trạng thái ngoài `em`, `now` và cấu hình chốt một lần. Hết lượt ⇒ 503 `HE_THONG_DANG_BAN` từ vỏ.

const NO_SHOW_LABEL = 'admin-override-no-show';
const CHECK_IN_LABEL = 'admin-override-check-in';
const RESTORE_LABEL = 'admin-override-restore';

@Injectable()
export class AdminOverrideService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(SystemConfigService) private readonly configs: SystemConfigService,
    @Inject(AppointmentTransitionService)
    private readonly transition: AppointmentTransitionService,
    @Inject(AppointmentCancellationService)
    private readonly cancellation: AppointmentCancellationService,
    @Inject(BranchAccessPolicy) private readonly branches: BranchAccessPolicy,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /**
   * Đổi trạng thái lịch `maLichHen` (đã chuẩn hoá chữ hoa) sang `body.trangThai` với `body.lyDo` (đã qua DTO: 1 đến 255, không giống bí mật). Thứ tự lỗi: vai trò và phạm vi tài khoản (403, guard) → lịch không
   * thấy được hay ngoài phạm vi (404 cùng thân, TRƯỚC mọi kiểm tra trạng thái) → ma trận Q24 dưới khoá (409). `accountId` là người thực hiện, từ access token.
   */
  async override(
    scope: AdminScope,
    accountId: string,
    maLichHen: string,
    body: Pick<AdminOverrideDto, 'trangThai' | 'lyDo'>,
  ): Promise<AdminOverrideResult> {
    // Đọc thường theo mã (cột bất biến + trạng thái chỉ để báo từ chối): không có hay ngoài phạm vi ⇒ 404, chưa xin khoá nào
    const keys = await runReadOnly(this.db, (manager) =>
      readLichHenKeysByCode(manager, maLichHen),
    );
    if (keys === null || !this.canAct(scope)({ chiNhanhId: keys.chiNhanhId }))
      throw new AppException(404, COMMON_ERROR_CODES.NOT_FOUND);

    const to = body.trangThai;
    const onChanged = this.auditHook(accountId, keys, to, body.lyDo);
    switch (to) {
      case 'DaHuy':
        return this.cancel(scope, accountId, keys, body.lyDo, onChanged);
      case 'VangMat':
        return this.markNoShow(scope, keys, onChanged);
      case 'DaTiepDon':
        return this.checkIn(scope, keys, onChanged);
      case 'DaXacNhan':
        return this.restore(scope, keys, onChanged);
      default:
        // `HoanThanh` (chỉ Bác sĩ), `ChoThanhToan`, `DaDoiLich`: ma trận của Quản trị viên luôn từ chối, kể cả nguồn nào
        throw this.refusal(keys, to);
    }
  }

  // Phạm vi theo `BranchAccessPolicy`; dùng ở lần đọc thường và (qua `canAct` của lõi) LẠI dưới khoá (5.3 quy tắc 2)
  private canAct(scope: AdminScope) {
    return (target: { chiNhanhId: string }): boolean =>
      this.branches.canAccessBranch(scope, target.chiNhanhId);
  }

  // Điểm cắm audit: lõi gọi SAU khi đã đổi, dưới khoá, trong giao dịch của người gọi, kèm trạng thái NGUỒN. `branchId` là chi nhánh của LỊCH (bất biến), không phải phạm vi của Quản trị viên (Toàn hệ thống không có chi nhánh).
  // Không giữ trạng thái: chạy lại cùng đối số khi giao dịch thử lại. `AuditError` ném ⇒ lõi ném tiếp ⇒ vỏ hoàn tác TẤT CẢ (CT-18).
  private auditHook(
    accountId: string,
    keys: LichHenOwnerKeys,
    to: TrangThaiLichHen,
    lyDo: string,
  ): OnChanged {
    return (em, { from }) =>
      this.audit.record(em, {
        actorId: accountId,
        branchId: keys.chiNhanhId,
        action: 'OverrideLichHen',
        targetType: 'lich_hen',
        targetId: keys.lichHenId,
        result: 'ThanhCong',
        changes: {
          truoc: { trang_thai: from },
          sau: { trang_thai: to },
          ly_do: lyDo,
        },
      });
  }

  private async cancel(
    scope: AdminScope,
    accountId: string,
    keys: LichHenOwnerKeys,
    lyDo: string,
    onChanged: OnChanged,
  ): Promise<AdminOverrideResult> {
    const outcome = await this.cancellation.cancel({
      maLichHen: keys.maLichHen,
      actor: { kind: 'QuanTriVien', accountId, scope },
      reason: 'QtvOverride',
      lyDo,
      onChanged,
    });
    if (outcome.kind !== 'Cancelled') throw cancelOutcomeException(outcome);
    return {
      maLichHen: outcome.maLichHen,
      trangThai: 'DaHuy',
      hoanCoc: outcome.hoanCoc,
    };
  }

  private async markNoShow(
    scope: AdminScope,
    keys: LichHenOwnerKeys,
    onChanged: OnChanged,
  ): Promise<AdminOverrideResult> {
    // Mốc và cấu hình MỘT lần ngoài giao dịch: thân chạy lại được khi 1213, 1205 mà không đọc lại. Cấu hình chỉ cần cho ngưỡng no-show (quy tắc 35).
    const now = toSecond(nowVN());
    const config = await this.configs.get();
    const outcome = await withBookingTransaction(
      this.db,
      (em) =>
        this.transition.markNoShow(em, {
          lichHenId: keys.lichHenId,
          now,
          config,
          actor: 'QuanTriVien',
          canAct: this.canAct(scope),
          onChanged,
        }),
      { label: NO_SHOW_LABEL },
    );
    if (outcome.kind !== 'NoShowed')
      throw statusFailureException(outcome, 'VangMat');
    return { maLichHen: keys.maLichHen, trangThai: 'VangMat' };
  }

  private async checkIn(
    scope: AdminScope,
    keys: LichHenOwnerKeys,
    onChanged: OnChanged,
  ): Promise<AdminOverrideResult> {
    const now = toSecond(nowVN());
    const outcome = await withBookingTransaction(
      this.db,
      (em) =>
        this.transition.checkIn(em, {
          lichHenId: keys.lichHenId,
          now,
          // Quản trị viên không bị cửa sổ tiếp đón nên không cần cấu hình: thiếu cấu hình KHÔNG chặn override sang `DaTiepDon` (CT-21)
          config: null,
          actor: 'QuanTriVien',
          canAct: this.canAct(scope),
          onChanged,
        }),
      { label: CHECK_IN_LABEL },
    );
    if (outcome.kind !== 'CheckedIn')
      throw statusFailureException(outcome, 'DaTiepDon');
    return { maLichHen: keys.maLichHen, trangThai: 'DaTiepDon' };
  }

  private async restore(
    scope: AdminScope,
    keys: LichHenOwnerKeys,
    onChanged: OnChanged,
  ): Promise<AdminOverrideResult> {
    const outcome = await withBookingTransaction(
      this.db,
      (em) =>
        this.transition.restoreConfirmed(em, {
          lichHenId: keys.lichHenId,
          actor: 'QuanTriVien',
          canAct: this.canAct(scope),
          onChanged,
        }),
      { label: RESTORE_LABEL },
    );
    if (outcome.kind !== 'Restored')
      throw statusFailureException(outcome, 'DaXacNhan');
    return { maLichHen: keys.maLichHen, trangThai: 'DaXacNhan' };
  }

  // Đường CHỈ-TỪ-CHỐI cho đích Quản trị viên không bao giờ làm được: chỉ ma trận, trên trạng thái đọc thường (kết quả không phụ thuộc nguồn: `HoanThanh` luôn là `ChiBacSiHoanThanh`, hai đích kia luôn `KhongHopLe`).
  // Trả lỗi để người gọi ném; nếu ma trận lại cho phép thì ma trận đã đổi mà dịch vụ chưa theo: lỗi lập trình.
  private refusal(keys: LichHenOwnerKeys, to: TrangThaiLichHen): Error {
    const decision = canTransition({
      actor: 'QuanTriVien',
      from: keys.trangThai,
      to,
    });
    if (decision.ok)
      return new Error(
        `ma trận cho phép QuanTriVien đi ${keys.trangThai} sang ${to} nhưng route chưa hỗ trợ đích này`,
      );
    return decision.reason === 'ChiBacSiHoanThanh'
      ? onlyDoctorCompletesException()
      : invalidTransitionException(keys.trangThai, to);
  }
}
