import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import type { PageQueryDto } from '../../common/paging/page-query.dto.js';
import type { Paged } from '../../common/paging/paged.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';
import {
  mapHistoryRow,
  type SystemConfigHistoryItem,
} from './system-config-history.mapper.js';
import { SystemConfigHistoryRepository } from './system-config-history.repository.js';

@Injectable()
export class SystemConfigHistoryService {
  constructor(
    @Inject(SystemConfigHistoryRepository)
    private readonly repository: SystemConfigHistoryRepository,
    @Inject(BranchAccessPolicy) private readonly policy: BranchAccessPolicy,
  ) {}

  // Chỉ Quản trị viên Toàn hệ thống (PLAN admin Q37, CH A2): guard ở controller là lớp một, đây là lớp hai và chạy TRƯỚC mọi truy vấn.
  async history(
    scope: AdminScope,
    query: Pick<PageQueryDto, 'page' | 'pageSize' | 'offset'>,
  ): Promise<Paged<SystemConfigHistoryItem>> {
    this.policy.assertToanHeThong(scope);
    // Cùng đoạn, cùng mã lỗi, cùng chữ với bốn danh sách admin có sẵn (branches, service-groups, services, specialties): `page` rất lớn làm `offset`
    // vượt số nguyên an toàn thì báo 400 thay vì để SQL báo lỗi (TRACKING 9A.4 mục 9).
    if (!Number.isSafeInteger(query.offset) || query.offset < 0)
      throw new AppException(400, 'DU_LIEU_KHONG_HOP_LE', {
        loi: [{ truong: 'page', ma: 'TRANG_KHONG_HOP_LE' }],
      });
    const { rows, total } = await this.repository.list(query);
    return {
      items: rows.map(mapHistoryRow),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }
}
