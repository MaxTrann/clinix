import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppException } from '../../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../../common/errors/error-codes.js';
import { runReadOnly } from '../../../common/transaction/read-only-tx.js';
import type { AdminScope } from '../../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../../rbac/branch-access.policy.js';
import type {
  AdminRatingDetail,
  AdminRatingsPage,
  AdminRatingsQuery,
} from './admin-ratings.dto.js';
import { toCounts, toDetail, toItem } from './admin-ratings.mapper.js';
import {
  AdminRatingsRepository,
  type AdminRatingFilter,
} from './admin-ratings.repository.js';
import { totalOf } from './admin-ratings.rules.js';

/**
 * Quản trị viên xem danh sách và chi tiết đánh giá bác sĩ (doctor-exam B7; PLAN 5.8, Q8; KDD-01…KDD-03, KDD-17; QHK-06, QHK-07, QHK-11). Chỉ đọc, không khoá, không log.
 * Toàn hệ thống thấy hết; Chi nhánh chỉ đánh giá của lịch có `lich_hen.chi_nhanh_id` = chi nhánh mình, ngoài phạm vi ⇒ 404 cùng thân với "không có".
 * Danh sách: MỘT lần gọi `runReadOnly` (một ảnh chụp) với tối đa HAI câu: đếm theo trạng thái (suy ra `total` và `demTheoTrangThai`) rồi trang (chỉ khi `offset < total`).
 */
@Injectable()
export class AdminRatingsService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(AdminRatingsRepository)
    private readonly repository: AdminRatingsRepository,
    @Inject(BranchAccessPolicy) private readonly policy: BranchAccessPolicy,
  ) {}

  async list(
    scope: AdminScope,
    query: AdminRatingsQuery,
  ): Promise<AdminRatingsPage> {
    // Admin Chi nhánh bị ÉP chi nhánh được gán; `chiNhanhId` gửi lên chỉ có tác dụng với Toàn hệ thống. MỘT bộ lọc cho cả hai câu: câu đếm không thể rộng hơn câu trang.
    const filter: AdminRatingFilter = {
      chiNhanhId: this.policy.branchFilter(scope, query.chiNhanhId),
      bacSiId: query.bacSiId,
      soSao: query.soSao,
      q: query.q,
    };
    return runReadOnly(this.db, async (manager) => {
      const counts = toCounts(
        await this.repository.countByStatus(manager, filter),
      );
      const total = totalOf(counts, query.trangThai);
      // Chỉ lấy trang khi `offset < total`: không dòng nào hay `page` rất lớn thì không gửi câu thứ hai (và không bao giờ gửi `OFFSET` khổng lồ)
      const rows =
        query.offset < total
          ? await this.repository.findPage(
              manager,
              filter,
              query.trangThai,
              query.pageSize,
              query.offset,
            )
          : [];
      return {
        items: rows.map(toItem),
        total,
        page: query.page,
        pageSize: query.pageSize,
        demTheoTrangThai: counts,
      };
    });
  }

  async get(scope: AdminScope, id: string): Promise<AdminRatingDetail> {
    const row = await runReadOnly(this.db, (manager) =>
      this.repository.findOne(manager, id),
    );
    if (row === null) throw new AppException(404, COMMON_ERROR_CODES.NOT_FOUND);
    // Chi nhánh của LỊCH (bất biến sau khi đặt); ngoài phạm vi ⇒ 404 cùng thân với "không có" (QHK-06)
    this.policy.assertCanSee(scope, String(row.chiNhanhId));
    return toDetail(row);
  }
}
