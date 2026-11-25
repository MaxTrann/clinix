import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { AuditService } from '../../audit/audit.service.js';
import { nowVN, toSecond } from '../../common/time/time.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { ReceptionScopeService } from '../../rbac/reception-scope.service.js';
import { resolveReceptionBranch } from '../reception-branch.js';
import { AppointmentRescheduleService } from './appointment-reschedule.service.js';
import { requestRejectionException } from './reschedule-request-failure.js';
import type {
  ApproveRescheduleRequestInput,
  ApproveRescheduleRequestResult,
} from './reschedule-request-handle.dto.js';
import { toApprovedResult } from './reschedule-request-handle.mapper.js';
import {
  handlerActorOf,
  loadHandlingRow,
  type HandlerActor,
} from './reschedule-request-handle.scope.js';
import { RescheduleRequestRepository } from './reschedule-request.repository.js';
import type { RescheduleWritten } from './reschedule.types.js';

/** Những gì `afterWrite` cần ngoài `RescheduleWritten`: cố định cho MỌI lần chạy lại của thân giao dịch (không giữ trạng thái giữa các lần). */
interface ApprovalContext {
  accountId: string;
  yeuCauId: string;
  ghiChu: string;
  /** MỘT mốc `toSecond(nowVN())` lấy một lần ở dịch vụ */
  now: Date;
}

/**
 * Duyệt yêu cầu đổi lịch ngoài chính sách: `POST /reception|admin/reschedule-requests/:yeuCauId/approve` (reschedule B9; PLAN reschedule 5.5, 5.7, 5.8, 5.11; TRACKING reschedule 1.13). GHÉP các phần đã có, KHÔNG có
 * SQL và KHÔNG mở giao dịch riêng (AR-06: lõi B4 mở):
 *  1. phạm vi của người duyệt (Lễ tân từ `ReceptionScopeService`, Quản trị viên từ `AdminScopeCtx`; không bao giờ từ thân hay đường dẫn) ⇒ 403 TRƯỚC mọi thứ; RỒI mới phân tích id và đọc yêu cầu CÓ phạm vi
 *     trong SQL (`loadHandlingRow`): sai dạng, không có, ngoài phạm vi ⇒ cùng 404 (kể cả yêu cầu đã xử lý ở chi nhánh khác);
 *  2. cổng SỚM `YEU_CAU_DA_XU_LY` từ lần đọc thường (chỉ để yêu cầu đã xử lý không bị che bằng lỗi cấu hình hay khung giờ); quyết định THẬT do B4 đọc lại dưới khoá 6c (`RequestHandled`);
 *  3. `AppointmentRescheduleService.reschedule` (B4) với `actor` `DuyetYeuCau`: khoá theo PLAN 5.4 (2→6c), bộ luật của B2, lịch mới, thả khung giờ cũ, thông báo `YeuCauDoiLichDaDuyet` cho tài khoản ĐẶT. Khung giờ
 *     đích là `khungGioId` (thay thế) hoặc khung giờ mong muốn của yêu cầu; KHÔNG viết kiểm tra riêng cho nó (bộ luật của B4 trả `KHUNG_GIO_*`);
 *  4. `afterWrite` (điểm cắm BẮT BUỘC của B4, TRONG giao dịch, sau `markReplaced` và trước thông báo): `UPDATE` yêu cầu sang `DaDuyet` rồi ghi Audit `XuLyDoiLichNgoaiChinhSach`. `AuditError` PHẢI nổi (KHÔNG `try/catch`): B4
 *     hoàn tác TRỌN (lịch mới, hai khung giờ, thông báo, yêu cầu vẫn `ChoDuyet`) và ra 500 `LOI_HE_THONG`.
 * B9 KHÔNG gửi thêm thông báo nào (B4 đã gửi `YeuCauDoiLichDaDuyet`; không `LichHenDaDoiLich`). Lỗi từ chối của B4 (`Rejected`) ⇒ giao dịch rỗng hay hoàn tác trọn, yêu cầu VẪN `ChoDuyet`. `thoiGianMayChu` lấy SAU khi B4
 * đã trả (sau commit). Không log: ghi chú, mã lịch và tên là dữ liệu cá nhân (BDL-11).
 */
@Injectable()
export class RescheduleRequestApproveService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(ReceptionScopeService)
    private readonly receptionScopes: ReceptionScopeService,
    @Inject(RescheduleRequestRepository)
    private readonly requests: RescheduleRequestRepository,
    @Inject(AppointmentRescheduleService)
    private readonly core: AppointmentRescheduleService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /** Lễ tân: chi nhánh đọc từ DB mỗi request (`resolveReceptionBranch`); `accountId` chỉ từ access token; `input` đã qua DTO. */
  async approveAsReception(
    accountId: string,
    rawYeuCauId: string,
    input: ApproveRescheduleRequestInput,
  ): Promise<ApproveRescheduleRequestResult> {
    const scope = await resolveReceptionBranch(this.receptionScopes, accountId);
    return this.approveIn(handlerActorOf(scope), accountId, rawYeuCauId, input);
  }

  /** Quản trị viên: `scope` từ `AdminScopeCtx` (Toàn hệ thống ⇒ mọi chi nhánh; Chi nhánh ⇒ chi nhánh được gán). `async` để phạm vi hỏng (403) là lời hứa bị từ chối, không ném đồng bộ. */
  async approveAsAdmin(
    scope: AdminScope,
    accountId: string,
    rawYeuCauId: string,
    input: ApproveRescheduleRequestInput,
  ): Promise<ApproveRescheduleRequestResult> {
    return this.approveIn(handlerActorOf(scope), accountId, rawYeuCauId, input);
  }

  private async approveIn(
    actor: HandlerActor,
    accountId: string,
    rawYeuCauId: string,
    input: ApproveRescheduleRequestInput,
  ): Promise<ApproveRescheduleRequestResult> {
    const row = await loadHandlingRow(
      this.requests,
      this.db.manager,
      actor,
      rawYeuCauId,
    );
    if (row.trangThai !== 'ChoDuyet')
      throw requestRejectionException({ kind: 'RequestHandled' });
    const context: ApprovalContext = {
      accountId,
      yeuCauId: row.yeuCauId,
      ghiChu: input.ghiChu,
      now: toSecond(nowVN()),
    };
    const outcome = await this.core.reschedule({
      maLichHen: row.maLichHen,
      khungGioMoiId: input.khungGioId ?? row.khungGioMongMuonId,
      actor,
      yeuCauId: row.yeuCauId,
      ghiChu: input.ghiChu,
      afterWrite: (em, written) => this.recordApproval(em, context, written),
    });
    switch (outcome.kind) {
      case 'Rescheduled':
        return toApprovedResult(outcome, nowVN());
      case 'Rejected':
        throw requestRejectionException(outcome.failure);
      case 'OverQuota':
        // Hạn mức chỉ áp cho `TuDoi`: thấy ở đây là lỗi lập trình, không đoán sang mã nghiệp vụ
        throw new Error('duyệt không thể ra OverQuota');
    }
  }

  // `UPDATE` yêu cầu rồi Audit (PLAN 5.11): `targetId` là id YÊU CẦU, `branchId` là chi nhánh của LỊCH (kể cả khi người duyệt là Quản trị viên Toàn hệ thống), mã lịch là mã CÔNG KHAI. Luật kiểm ở `audit/` (P2).
  // Mọi trường lấy từ `context` và `written`, không giữ gì giữa các lần chạy lại (1213, 1205).
  private async recordApproval(
    em: EntityManager,
    context: ApprovalContext,
    written: RescheduleWritten,
  ): Promise<void> {
    await this.requests.markApproved(em, {
      yeuCauId: context.yeuCauId,
      ghiChu: context.ghiChu,
      nguoiXuLyId: context.accountId,
      thoiDiemXuLy: context.now,
    });
    await this.audit.record(em, {
      actorId: context.accountId,
      branchId: written.chiNhanhId,
      action: 'XuLyDoiLichNgoaiChinhSach',
      targetType: 'yeu_cau_doi_lich_ngoai_chinh_sach',
      targetId: context.yeuCauId,
      result: 'ThanhCong',
      changes: {
        truoc: { trang_thai: 'ChoDuyet' },
        sau: { trang_thai: 'DaDuyet' },
        ghi_chu: context.ghiChu,
        ma_lich_hen_cu: written.maLichHenCu,
        ma_lich_hen_moi: written.maLichHenMoi,
      },
    });
  }
}
