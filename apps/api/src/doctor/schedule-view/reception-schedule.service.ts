import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';
import { ReceptionScopeService } from '../../rbac/reception-scope.service.js';
import { parsePublicId } from '../../search/common/id-param.js';
import type { DoctorSearchQueryDto } from './doctor-list-query.dto.js';
import type { ReceptionScheduleGridDto } from './reception-schedule.dto.js';
import { ScheduleGridService } from './schedule-grid.service.js';

/**
 * Lễ tân xem lịch bác sĩ trong chi nhánh của mình (PLAN doctor 5.6, Q13, Q14). Chỉ XEM.
 * Chi nhánh đọc từ DB ở MỖI request (`ReceptionScopeService`, không cache, không nhận từ token hay query): đổi chi nhánh hoặc
 * khoá tài khoản có hiệu lực ngay; không còn là Lễ tân đang hoạt động ⇒ 403 `KHONG_DU_QUYEN` (XL-14).
 */
@Injectable()
export class ReceptionScheduleService {
  constructor(
    @Inject(ScheduleGridService) private readonly grid: ScheduleGridService,
    @Inject(ReceptionScopeService)
    private readonly scopes: ReceptionScopeService,
  ) {}

  async listDoctors(accountId: string, query: DoctorSearchQueryDto) {
    const scope = await this.scopes.resolve(accountId);
    return this.grid.listDoctors(scope.chiNhanhId, query);
  }

  async getGrid(accountId: string, query: ReceptionScheduleGridDto) {
    const scope = await this.scopes.resolve(accountId);
    // Sai dạng ⇒ 404 `KHONG_TIM_THAY` (không phân biệt với "không có"); chạy SAU khi quyền đã được kiểm (guard + resolve).
    const bacSiId =
      query.bacSiId === undefined ? undefined : parsePublicId(query.bacSiId);
    return this.grid.getGrid(
      {
        scopeBranchId: scope.chiNhanhId,
        filterBranchId: scope.chiNhanhId,
        // Q13: ngoài phạm vi và không tồn tại cùng 403, cùng thân (id bác sĩ vốn công khai ở `search`, nên không lộ gì).
        outOfScope: () => new AppException(403, COMMON_ERROR_CODES.FORBIDDEN),
      },
      // Truyền tường minh từng trường: `offset` là getter trên prototype của DTO nên spread (`...query`) sẽ làm mất nó.
      {
        tuNgay: query.tuNgay,
        denNgay: query.denNgay,
        bacSiId,
        chuyenKhoaId: query.chuyenKhoaId,
        ca: query.ca,
        q: query.q,
        page: query.page,
        pageSize: query.pageSize,
        offset: query.offset,
      },
    );
  }
}
