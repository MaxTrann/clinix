import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { AuditService } from '../../audit/audit.service.js';
import { nowVN, toSecond } from '../../common/time/time.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { ReceptionScopeService } from '../../rbac/reception-scope.service.js';
import { RESCHEDULE_NOTIFICATION_EVENTS } from '../appointments.constants.js';
import { withBookingTransaction } from '../locking/booking-transaction.js';
import {
  APPOINTMENT_NOTIFIER,
  type AppointmentNotifier,
} from '../ports/appointment-notifier.port.js';
import { resolveReceptionBranch } from '../reception-branch.js';
import { requestRejectionException } from './reschedule-request-failure.js';
import type {
  RejectRescheduleRequestInput,
  RejectRescheduleRequestResult,
} from './reschedule-request-handle.dto.js';
import { toRejectedResult } from './reschedule-request-handle.mapper.js';
import {
  handlerActorOf,
  loadHandlingRow,
  type HandlerActor,
} from './reschedule-request-handle.scope.js';
import type { RescheduleRequestHandlingRow } from './reschedule-request-handle.types.js';
import { RescheduleRequestRepository } from './reschedule-request.repository.js';
import { lockRescheduleRequest } from './reschedule-locks.js';
import type { RescheduleRejection } from './reschedule.types.js';

const REJECT_LABEL = 'reschedule-request-reject';

/** Kết quả CÓ KIỂU của thân giao dịch (không ném `AppException` trong giao dịch: ném thì lần ghi đã làm bị hoàn tác theo, bài học A8). `Refused` là commit RỖNG. */
type RejectWork =
  | { kind: 'Done' }
  | {
      kind: 'Refused';
      rejection: Extract<
        RescheduleRejection,
        { kind: 'RequestNotFound' | 'RequestHandled' }
      >;
    };

/** Cố định cho MỌI lần chạy lại của thân giao dịch (không giữ trạng thái giữa các lần). */
interface RejectContext {
  accountId: string;
  row: RescheduleRequestHandlingRow;
  ghiChu: string;
  /** MỘT mốc `toSecond(nowVN())` lấy một lần ở dịch vụ */
  now: Date;
}

/**
 * Từ chối yêu cầu đổi lịch ngoài chính sách: `POST /reception|admin/reschedule-requests/:yeuCauId/reject` (reschedule B9; PLAN reschedule 5.4, 5.7, 5.8, 5.11; TRACKING reschedule 1.13). Giao dịch RIÊNG (không qua lõi
 * đổi lịch: không có lịch mới, khung giờ nào bị đụng), phạm vi và đọc yêu cầu y như duyệt (`handlerActorOf`, `loadHandlingRow`).
 * Trong MỘT `withBookingTransaction`, CHỈ khoá tầng 6c (`lockRescheduleRequest`): KHÔNG khoá khung giờ, KHÔNG khoá lịch, nên không có chu trình khoá mới (PLAN 5.4). Dưới khoá: yêu cầu không còn hay lệch lịch ⇒ `RequestNotFound`;
 * không còn `ChoDuyet` ⇒ `RequestHandled` (commit RỖNG, 409 sau khi giao dịch đóng). Rồi theo thứ tự của B4 (ghi, Audit, thông báo): `UPDATE` sang `TuChoi`, Audit `XuLyDoiLichNgoaiChinhSach` (KHÔNG có `ma_lich_hen_moi`),
 * thông báo `YeuCauDoiLichBiTuChoi` cho tài khoản ĐẶT kèm ghi chú nguyên văn (Q10). Lỗi Audit hay thông báo ⇒ hoàn tác TRỌN, yêu cầu vẫn `ChoDuyet`, 500 `LOI_HE_THONG`.
 * Từ chối được với MỌI trạng thái của lịch gốc và cả khi khung giờ mong muốn đã bị chiếm (R6): không đọc trạng thái lịch gốc để quyết. Không `onSlotReleased` (không giải phóng khung giờ nào). `lich_hen` chỉ được ĐỌC
 * thường (ở `loadHandlingRow` và trong `notify` của B3), không khoá: các cột dùng (`ma_lich_hen`, `chi_nhanh_id`, `benh_nhan_id`) bất biến. Không SQL ở file này (AR-06). Không log (BDL-11).
 */
@Injectable()
export class RescheduleRequestRejectService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(ReceptionScopeService)
    private readonly receptionScopes: ReceptionScopeService,
    @Inject(RescheduleRequestRepository)
    private readonly requests: RescheduleRequestRepository,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(APPOINTMENT_NOTIFIER)
    private readonly notifier: AppointmentNotifier,
  ) {}

  /** Lễ tân: chi nhánh đọc từ DB mỗi request; `accountId` chỉ từ access token; `input` đã qua DTO. */
  async rejectAsReception(
    accountId: string,
    rawYeuCauId: string,
    input: RejectRescheduleRequestInput,
  ): Promise<RejectRescheduleRequestResult> {
    const scope = await resolveReceptionBranch(this.receptionScopes, accountId);
    return this.rejectIn(handlerActorOf(scope), accountId, rawYeuCauId, input);
  }

  /** Quản trị viên: `scope` từ `AdminScopeCtx`. `async` để phạm vi hỏng (403) là lời hứa bị từ chối, không ném đồng bộ. */
  async rejectAsAdmin(
    scope: AdminScope,
    accountId: string,
    rawYeuCauId: string,
    input: RejectRescheduleRequestInput,
  ): Promise<RejectRescheduleRequestResult> {
    return this.rejectIn(handlerActorOf(scope), accountId, rawYeuCauId, input);
  }

  private async rejectIn(
    actor: HandlerActor,
    accountId: string,
    rawYeuCauId: string,
    input: RejectRescheduleRequestInput,
  ): Promise<RejectRescheduleRequestResult> {
    // KHÔNG có cổng sớm theo trạng thái ở đây: quyết định "còn ChoDuyet không" chỉ có một nơi, dưới khoá 6c (XDL-10)
    const row = await loadHandlingRow(
      this.requests,
      this.db.manager,
      actor,
      rawYeuCauId,
    );
    const context: RejectContext = {
      accountId,
      row,
      ghiChu: input.ghiChu,
      now: toSecond(nowVN()),
    };
    const work = await withBookingTransaction(
      this.db,
      (em) => this.rejectWithin(em, context),
      { label: REJECT_LABEL },
    );
    if (work.kind === 'Refused')
      throw requestRejectionException(work.rejection);
    return toRejectedResult(nowVN());
  }

  private async rejectWithin(
    em: EntityManager,
    context: RejectContext,
  ): Promise<RejectWork> {
    const { row, ghiChu, accountId } = context;
    // Tầng 6c: khoá DUY NHẤT của từ chối. Đọc LẠI dưới khoá: người khác có thể đã duyệt hay từ chối giữa lần đọc thường và giờ
    const locked = await lockRescheduleRequest(em, row.yeuCauId);
    if (locked === null || locked.lichHenId !== row.lichHenId)
      return { kind: 'Refused', rejection: { kind: 'RequestNotFound' } };
    if (locked.trangThai !== 'ChoDuyet')
      return { kind: 'Refused', rejection: { kind: 'RequestHandled' } };

    await this.requests.markRejected(em, {
      yeuCauId: row.yeuCauId,
      ghiChu,
      nguoiXuLyId: accountId,
      thoiDiemXuLy: context.now,
    });
    // Audit (PLAN 5.11): `targetId` là id YÊU CẦU, `branchId` là chi nhánh của LỊCH, KHÔNG có khoá `ma_lich_hen_moi` (luật P2: chỉ có khi duyệt)
    await this.audit.record(em, {
      actorId: accountId,
      branchId: row.chiNhanhId,
      action: 'XuLyDoiLichNgoaiChinhSach',
      targetType: 'yeu_cau_doi_lich_ngoai_chinh_sach',
      targetId: row.yeuCauId,
      result: 'ThanhCong',
      changes: {
        truoc: { trang_thai: 'ChoDuyet' },
        sau: { trang_thai: 'TuChoi' },
        ghi_chu: ghiChu,
        ma_lich_hen_cu: row.maLichHen,
      },
    });
    // `taiKhoanId` là tài khoản ĐẶT (không phải người xử lý); `thoiGianMongMuon` là giờ khung giờ MONG MUỐN GỐC; `lichHenId` là lịch CŨ (chỉ để đọc mã và giờ, không ghi vào `thong_bao.lich_hen_id`, B3 Q5)
    await this.notifier.notify(em, {
      loaiSuKien: RESCHEDULE_NOTIFICATION_EVENTS.REQUEST_REJECTED,
      lichHenId: row.lichHenId,
      taiKhoanId: row.benhNhanId,
      yeuCau: {
        yeuCauId: row.yeuCauId,
        ghiChu,
        thoiGianMongMuon: row.thoiGianMongMuon,
      },
    });
    return { kind: 'Done' };
  }
}
