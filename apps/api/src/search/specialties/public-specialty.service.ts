import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';
import { parseFilterId, parsePublicId } from '../common/id-param.js';
import type {
  PublicSpecialtyDetail,
  PublicSpecialtyItem,
  PublicSpecialtyPage,
  PublicSpecialtyQueryDto,
} from './public-specialty.dto.js';
import { PublicSpecialtyRepository } from './public-specialty.repository.js';

@Injectable()
export class PublicSpecialtyService {
  constructor(private readonly repository: PublicSpecialtyRepository) {}

  async list(query: PublicSpecialtyQueryDto): Promise<PublicSpecialtyPage> {
    // Sai dạng ⇒ 400 trước khi chạm DB; đúng dạng mà không có chi nhánh ⇒ 200 rỗng (Q23).
    const branchId = parseFilterId(query.chiNhanhId, 'chiNhanhId');
    const { items, total, soCoBacSi } = await this.repository.findPage(
      query.likePattern,
      branchId,
      query.pageSize,
      query.offset,
    );
    return {
      items: items.map(pickSpecialty),
      total,
      page: query.page,
      pageSize: query.pageSize,
      soCoBacSi,
    };
  }

  /** Id sai dạng, không tồn tại hoặc chuyên khoa đã ngừng ⇒ cùng một 404 `KHONG_TIM_THAY` (H8). */
  async detail(
    rawId: string,
    rawBranchId: string | undefined,
  ): Promise<PublicSpecialtyDetail> {
    const id = parsePublicId(rawId);
    const branchId = parseFilterId(rawBranchId, 'chiNhanhId');
    const found = await this.repository.findDetail(id, branchId);
    if (!found) throw new AppException(404, COMMON_ERROR_CODES.NOT_FOUND);
    return pickSpecialty(found);
  }
}

// Chọn lại từng trường để không lọt cột nào ngoài danh sách trắng.
function pickSpecialty(row: PublicSpecialtyItem): PublicSpecialtyItem {
  return {
    chuyenKhoaId: row.chuyenKhoaId,
    ten: row.ten,
    moTa: row.moTa ?? null,
    anhDaiDien: row.anhDaiDien ?? null,
    soBacSi: row.soBacSi,
  };
}
