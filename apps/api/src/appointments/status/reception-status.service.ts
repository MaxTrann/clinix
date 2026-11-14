import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { SystemConfigService } from '../../admin/system-config/system-config.service.js';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import { AppException } from '../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';
import { nowVN, toSecond } from '../../common/time/time.js';
import { runReadOnly } from '../../common/transaction/read-only-tx.js';
import { ReceptionScopeService } from '../../rbac/reception-scope.service.js';
import { AppointmentCancellationService } from '../cancel/appointment-cancellation.service.js';
import { cancelOutcomeException } from '../cancel/cancel-failure.js';
import { withBookingTransaction } from '../locking/booking-transaction.js';
import {
  PAYMENT_SUMMARY_PORT,
  type PaymentSummaryPort,
} from '../ports/payment.port.js';
import { resolveReceptionBranch } from '../reception-branch.js';
import { canTransition } from '../state/appointment-state.matrix.js';
import { AppointmentTransitionService } from '../state/appointment-transition.service.js';
import {
  readLichHenKeysByCode,
  type LichHenOwnerKeys,
} from '../state/lich-hen-keys.query.js';
import type {
  ReceptionStatusDto,
  ReceptionStatusResult,
} from './reception-status.dto.js';
import {
  invalidTransitionException,
  onlyDoctorCompletesException,
  statusFailureException,
} from './status-failure.js';

// Cập nhật trạng thái lịch hẹn của LỄ TÂN (task B12; PLAN booking 5.7, Q21, Q22, Q27; TRACKING 3.26 B12-E). Điều phối: phạm vi chi nhánh, MỘT mốc `now` và cấu hình đọc NGOÀI giao dịch, rẽ theo đích, giao dịch
// riêng cho `checkIn` và `markNoShow` (hai phương thức họ B của `AppointmentTransitionService`), huỷ qua `AppointmentCancellationService` (B10, reason `LeTanHuy`). Kết quả có kiểu đổi sang lỗi API SAU khi giao dịch
// đã đóng, ở MỘT chỗ (`status-failure.ts`; huỷ dùng `cancelOutcomeException`). Controller chỉ nhận và trả.

const CHECK_IN_LABEL = 'reception-check-in';
const NO_SHOW_LABEL = 'reception-no-show';

@Injectable()
export class ReceptionStatusService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(ReceptionScopeService)
    private readonly scopes: ReceptionScopeService,
    @Inject(SystemConfigService) private readonly configs: SystemConfigService,
    @Inject(AppointmentTransitionService)
    private readonly transition: AppointmentTransitionService,
    @Inject(AppointmentCancellationService)
    private readonly cancellation: AppointmentCancellationService,
    @Inject(PAYMENT_SUMMARY_PORT) private readonly payments: PaymentSummaryPort,
  ) {}

  /**
   * Đổi trạng thái lịch `maLichHen` (đã chuẩn hoá chữ hoa) theo đích `body.trangThai`. Thứ tự lỗi: vai trò (403, guard) → phạm vi tài khoản (403) → lịch không thấy được (404, cùng thân với ngoài chi nhánh)
   * → trạng thái nguồn → cấu hình → còn phải thu → cửa sổ (đúng thứ tự `canTransition`). `DaHuy` KHÔNG cần cấu hình (CT-10).
   */
  async change(
    accountId: string,
    maLichHen: string,
    body: Pick<ReceptionStatusDto, 'trangThai' | 'lyDo'>,
  ): Promise<ReceptionStatusResult> {
    const { chiNhanhId } = await resolveReceptionBranch(this.scopes, accountId);
    switch (body.trangThai) {
      case 'DaHuy':
        return this.cancel(accountId, chiNhanhId, maLichHen, body.lyDo);
      case 'DaTiepDon':
        return this.checkIn(chiNhanhId, maLichHen);
      case 'VangMat':
        return this.markNoShow(chiNhanhId, maLichHen);
      default:
        // `HoanThanh` (chỉ Bác sĩ), `ChoThanhToan`, `DaXacNhan`, `DaDoiLich`: ma trận của Lễ tân luôn từ chối, nhưng người ngoài chi nhánh vẫn phải nhận 404, không phải 409
        return this.refuse(chiNhanhId, maLichHen, body.trangThai);
    }
  }

  // `lyDo` đã được DTO bắt buộc khi huỷ (400 `LY_DO_BAT_BUOC`): thiếu ở đây là lỗi lập trình của người gọi nội bộ
  private async cancel(
    accountId: string,
    chiNhanhId: string,
    maLichHen: string,
    lyDo: string | undefined,
  ): Promise<ReceptionStatusResult> {
    if (lyDo === undefined)
      throw new RangeError('lyDo là bắt buộc khi huỷ (DTO đã kiểm)');
    const outcome = await this.cancellation.cancel({
      maLichHen,
      actor: { kind: 'LeTan', accountId, chiNhanhId },
      reason: 'LeTanHuy',
      lyDo,
    });
    if (outcome.kind !== 'Cancelled') throw cancelOutcomeException(outcome);
    return {
      maLichHen: outcome.maLichHen,
      trangThai: 'DaHuy',
      hoanCoc: outcome.hoanCoc,
    };
  }

  private async checkIn(
    chiNhanhId: string,
    maLichHen: string,
  ): Promise<ReceptionStatusResult> {
    // Mốc và cấu hình MỘT lần ngoài giao dịch: thân giao dịch chạy lại được khi 1213, 1205 mà không đọc lại
    const now = toSecond(nowVN());
    const config = await this.configs.get();
    const done = await this.inBranch(
      CHECK_IN_LABEL,
      maLichHen,
      chiNhanhId,
      (em, keys) =>
        this.transition.checkIn(em, {
          lichHenId: keys.lichHenId,
          now,
          config,
          actor: 'LeTan',
          chiNhanhId,
          remainingToCollect: (manager) =>
            this.payments.remainingToCollect(manager, keys.lichHenId),
        }),
    );
    if (done === null)
      throw new AppException(404, COMMON_ERROR_CODES.NOT_FOUND);
    if (done.outcome.kind !== 'CheckedIn')
      throw statusFailureException(done.outcome, 'DaTiepDon');
    return { maLichHen: done.maLichHen, trangThai: 'DaTiepDon' };
  }

  private async markNoShow(
    chiNhanhId: string,
    maLichHen: string,
  ): Promise<ReceptionStatusResult> {
    const now = toSecond(nowVN());
    const config = await this.configs.get();
    const done = await this.inBranch(
      NO_SHOW_LABEL,
      maLichHen,
      chiNhanhId,
      (em, keys) =>
        this.transition.markNoShow(em, {
          lichHenId: keys.lichHenId,
          now,
          config,
          actor: 'LeTan',
          chiNhanhId,
        }),
    );
    if (done === null)
      throw new AppException(404, COMMON_ERROR_CODES.NOT_FOUND);
    if (done.outcome.kind !== 'NoShowed')
      throw statusFailureException(done.outcome, 'VangMat');
    return { maLichHen: done.maLichHen, trangThai: 'VangMat' };
  }

  // Giao dịch `withBookingTransaction` (READ COMMITTED, thử lại 1213 và 1205 bằng cách CHẠY LẠI thân từ đầu): đọc thường theo MÃ lịch (cột bất biến, chưa khoá gì), lịch không có hoặc ngoài chi nhánh
  // ⇒ `null` (404 cùng thân) TRƯỚC khi xin khoá nào, rồi `run` với `lichHenId`. Thân không giữ trạng thái và không có tác dụng phụ ngoài `em`.
  private inBranch<O>(
    label: string,
    maLichHen: string,
    chiNhanhId: string,
    run: (em: EntityManager, keys: LichHenOwnerKeys) => Promise<O>,
  ): Promise<{ maLichHen: string; outcome: O } | null> {
    return withBookingTransaction(
      this.db,
      async (em) => {
        const keys = await readLichHenKeysByCode(em, maLichHen);
        if (keys === null || keys.chiNhanhId !== chiNhanhId) return null;
        return { maLichHen: keys.maLichHen, outcome: await run(em, keys) };
      },
      { label },
    );
  }

  // Đường CHỈ-TỪ-CHỐI cho đích Lễ tân không bao giờ làm được: đọc thường (không khoá, không ghi), phạm vi (404), rồi ma trận. Luôn ném: ma trận không có ô `LeTan` nào tới các đích này.
  private async refuse(
    chiNhanhId: string,
    maLichHen: string,
    to: TrangThaiLichHen,
  ): Promise<never> {
    const keys = await runReadOnly(this.db, (manager) =>
      readLichHenKeysByCode(manager, maLichHen),
    );
    if (keys === null || keys.chiNhanhId !== chiNhanhId)
      throw new AppException(404, COMMON_ERROR_CODES.NOT_FOUND);
    const decision = canTransition({
      actor: 'LeTan',
      from: keys.trangThai,
      to,
    });
    if (decision.ok)
      throw new Error(
        `ma trận cho phép LeTan đi ${keys.trangThai} sang ${to} nhưng route chưa hỗ trợ đích này`,
      );
    if (decision.reason === 'ChiBacSiHoanThanh')
      throw onlyDoctorCompletesException();
    throw invalidTransitionException(keys.trangThai, to);
  }
}
