import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { AppException } from '../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';
import { nowVN, toSecond } from '../../common/time/time.js';
import { runReadOnly } from '../../common/transaction/read-only-tx.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';
import { ReceptionScopeService } from '../../rbac/reception-scope.service.js';
import { resolveReceptionBranch } from '../reception-branch.js';
import type { RescheduleRequestPage } from './reschedule-request-list.dto.js';
import {
  toRequestDetail,
  toRequestItem,
} from './reschedule-request-list.mapper.js';
import {
  approvalOf,
  approverActor,
  listOrderOf,
  parseRescheduleRequestId,
  statesOf,
  type RequestApproval,
} from './reschedule-request-list.rules.js';
import type {
  RescheduleRequestDetail,
  RescheduleRequestDetailRow,
  RescheduleRequestFilter,
  RescheduleRequestListQuery,
} from './reschedule-request-list.types.js';
import { RescheduleRequestRepository } from './reschedule-request.repository.js';
import { evaluateRescheduleAvailability } from './reschedulability.rules.js';
import { RescheduleReader } from './reschedule.reader.js';
import type { RescheduleConfig } from './reschedule.types.js';

/**
 * Phạm vi do `AdminScopeGuard` giải từ DB ở MỖI request, nhưng `BranchAccessPolicy.branchFilter` hiểu `chiNhanhId = undefined` là "không lọc chi nhánh" (dành cho Toàn hệ thống): một phạm vi hỏng
 * (kind lạ, hay `ChiNhanh` thiếu `chiNhanhId` chuỗi) sẽ mở toàn hệ thống mà không ai biết. Nên kiểm LẠI hình dạng lúc chạy, 403 `KHONG_DU_QUYEN` như guard. Bản của `AdminAppointmentsService.assertScopeShape`
 * (hàm đó không `export`, thuộc file của booking B4 nên không sửa).
 */
function assertScopeShape(scope: AdminScope): void {
  const shape: { kind?: unknown; chiNhanhId?: unknown } = scope;
  if (shape.kind === 'ToanHeThong') return;
  if (shape.kind === 'ChiNhanh' && typeof shape.chiNhanhId === 'string') return;
  throw new AppException(403, COMMON_ERROR_CODES.FORBIDDEN);
}

const notFound = (): AppException =>
  new AppException(404, COMMON_ERROR_CODES.NOT_FOUND);

/**
 * Danh sách và chi tiết yêu cầu đổi lịch ngoài chính sách cho LỄ TÂN và QUẢN TRỊ VIÊN (reschedule B8; PLAN reschedule 5.7, 5.8). CHỈ ĐỌC: mỗi lần gọi đúng MỘT `runReadOnly` (đếm, trang, chi tiết và
 * dữ kiện của `coTheDuyet` cùng ảnh chụp), không khoá, không ghi, không log (mã lịch, tên, lý do, ghi chú là dữ liệu cá nhân).
 *
 * Phạm vi luôn do SERVER giải, không từ query hay thân: Lễ tân từ `ReceptionScopeService` (đọc DB mỗi request, 403 một mã cho khoá hay thu hồi), Quản trị viên từ `AdminScopeGuard`. Điều kiện chi nhánh đi
 * vào SQL qua `BranchAccessPolicy.branchFilter`: `ChiNhanh` luôn dùng chi nhánh của phạm vi và BỎ QUA `chiNhanhId` của query; chỉ `ToanHeThong` dùng nó làm bộ lọc. Chi tiết: phạm vi giải TRƯỚC khi phân tích
 * `:yeuCauId` (QDL-02: Lễ tân bị khoá gửi id sai dạng nhận 403, không 404); id sai dạng, không tồn tại và ngoài phạm vi cùng ra MỘT 404 `KHONG_TIM_THAY`, ném SAU khi giao dịch đã đóng.
 */
@Injectable()
export class RescheduleRequestListService {
  constructor(
    @Inject(DataSource) private readonly dataSource: DataSource,
    @Inject(ReceptionScopeService)
    private readonly receptionScopes: ReceptionScopeService,
    @Inject(BranchAccessPolicy) private readonly policy: BranchAccessPolicy,
    @Inject(RescheduleRequestRepository)
    private readonly requests: RescheduleRequestRepository,
    @Inject(RescheduleReader) private readonly reader: RescheduleReader,
  ) {}

  /** Lễ tân: chi nhánh đọc từ DB mỗi request; `query` không có `chiNhanhId` (DTO của Lễ tân từ chối khoá đó). */
  async listForReception(
    accountId: string,
    query: RescheduleRequestListQuery,
  ): Promise<RescheduleRequestPage> {
    const scope = await resolveReceptionBranch(this.receptionScopes, accountId);
    return this.listIn(scope, query);
  }

  async detailForReception(
    accountId: string,
    rawYeuCauId: string,
  ): Promise<RescheduleRequestDetail> {
    const scope = await resolveReceptionBranch(this.receptionScopes, accountId);
    return this.detailIn(scope, rawYeuCauId);
  }

  /** Quản trị viên: `scope` từ `AdminScopeCtx`. */
  async list(
    scope: AdminScope,
    query: RescheduleRequestListQuery,
  ): Promise<RescheduleRequestPage> {
    assertScopeShape(scope);
    return this.listIn(scope, query);
  }

  async detail(
    scope: AdminScope,
    rawYeuCauId: string,
  ): Promise<RescheduleRequestDetail> {
    assertScopeShape(scope);
    return this.detailIn(scope, rawYeuCauId);
  }

  /**
   * Hai câu trong MỘT `runReadOnly`: `total` luôn khớp trang dù có ghi đồng thời. Chỉ lấy trang khi `offset < total`: `page` rất lớn (DTO không chặn trên) không bao giờ gửi `OFFSET` khổng lồ cho MySQL.
   * Tập trạng thái mặc định `ChoDuyet`; chiều sắp xếp theo tập (`listOrderOf`).
   */
  private async listIn(
    scope: AdminScope,
    query: RescheduleRequestListQuery,
  ): Promise<RescheduleRequestPage> {
    const states = statesOf(query.trangThai);
    const filter: RescheduleRequestFilter = {
      states,
      chiNhanhId: this.policy.branchFilter(scope, query.chiNhanhId),
      bacSiId: query.bacSiId ?? null,
      maLichHen: query.q ?? null,
    };
    const order = listOrderOf(states);
    return runReadOnly(this.dataSource, async (manager) => {
      const total = await this.requests.countByStates(manager, filter);
      const rows =
        query.offset < total
          ? await this.requests.findPage(
              manager,
              filter,
              order,
              query.pageSize,
              query.offset,
            )
          : [];
      return {
        items: rows.map(toRequestItem),
        total,
        page: query.page,
        pageSize: query.pageSize,
      };
    });
  }

  private async detailIn(
    scope: AdminScope,
    rawYeuCauId: string,
  ): Promise<RescheduleRequestDetail> {
    // Phạm vi đã giải ở trên: id sai dạng cùng 404 với "không có" và "ngoài phạm vi"
    const yeuCauId = parseRescheduleRequestId(rawYeuCauId);
    if (yeuCauId === null) throw notFound();
    // MỘT mốc cho hạn duyệt (`thoi_gian + check_in_sau_phut`) và cho trạng thái khung giờ mong muốn
    const now = toSecond(nowVN());
    const read = await runReadOnly(this.dataSource, async (manager) => {
      const row = await this.requests.findDetail(
        manager,
        this.policy.branchFilter(scope),
        yeuCauId,
      );
      if (row === null) return null;
      // Không có `cau_hinh_he_thong` thì vẫn đọc được: `null` ⇒ `soLanToiDa` `null`, `coTheDuyet` `false` (409 là của route ghi; nếp CT-10)
      const config = await this.reader.tryConfig();
      return {
        row,
        config,
        approval: await this.approval(manager, scope, row, config, now),
      };
    });
    if (read === null) throw notFound();
    return toRequestDetail(read.row, {
      soLanToiDa: read.config?.soLanTuDoiLichToiDa ?? null,
      approval: read.approval,
      now,
    });
  }

  /**
   * `coTheDuyet` của MỘT yêu cầu. Chỉ đọc dữ kiện của lịch gốc (đọc thường, không khoá) khi còn cần: yêu cầu đã xử lý hay thiếu cấu hình thì `approvalOf` dừng sớm. Luật là
   * `evaluateRescheduleAvailability` của B2 với vai `DuyetYeuCau` (cùng bước 1 đến 5, 11, 13, 14), KHÔNG có bản thứ hai ở đây.
   */
  private async approval(
    manager: EntityManager,
    scope: AdminScope,
    row: RescheduleRequestDetailRow,
    config: RescheduleConfig | null,
    now: Date,
  ): Promise<RequestApproval> {
    const availability =
      row.trangThai === 'ChoDuyet' && config !== null
        ? evaluateRescheduleAvailability(
            await this.reader.readAvailability(manager, {
              actor: approverActor(scope),
              maLichHen: row.maLichHen,
              now,
              config,
            }),
          )
        : null;
    return approvalOf({
      trangThai: row.trangThai,
      configured: config !== null,
      availability,
    });
  }
}
