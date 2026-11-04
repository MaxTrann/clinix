import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';
import type { Paged } from '../../common/paging/paged.js';
import { parsePublicId } from '../common/id-param.js';
import { buildWeeklySchedule } from '../common/weekly-schedule.view.js';
import type {
  PublicBranchDetail,
  PublicBranchItem,
  PublicBranchQueryDto,
} from './public-branch.dto.js';
import { PublicBranchRepository } from './public-branch.repository.js';

@Injectable()
export class PublicBranchService {
  constructor(private readonly repository: PublicBranchRepository) {}

  async list(query: PublicBranchQueryDto): Promise<Paged<PublicBranchItem>> {
    const { items, total } = await this.repository.findPage(
      query.likePattern,
      query.pageSize,
      query.offset,
    );
    return {
      items: items.map(pickBranch),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** Id sai dạng hoặc không tồn tại ⇒ cùng một 404 `KHONG_TIM_THAY` (H8). */
  async detail(rawId: string): Promise<PublicBranchDetail> {
    const found = await this.repository.findDetail(parsePublicId(rawId));
    if (!found) throw new AppException(404, COMMON_ERROR_CODES.NOT_FOUND);
    return {
      ...pickBranch(found.branch),
      lichHoatDong: buildWeeklySchedule(found.schedule),
      dichVuKham: found.services.map(({ dichVuKhamId, ten }) => ({
        dichVuKhamId,
        ten,
      })),
      soBacSi: found.doctorCount,
    };
  }
}

// Chọn lại từng trường để không lọt cột nào ngoài danh sách trắng.
function pickBranch(row: PublicBranchItem): PublicBranchItem {
  return {
    chiNhanhId: row.chiNhanhId,
    ten: row.ten,
    diaChi: row.diaChi,
    toaDoLat: row.toaDoLat ?? null,
    toaDoLng: row.toaDoLng ?? null,
  };
}
