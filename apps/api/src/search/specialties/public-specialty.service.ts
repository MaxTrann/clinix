import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';
import { PublicDoctorRepository } from '../doctors/public-doctor.repository.js';
import { parseFilterId, parsePublicId } from '../common/id-param.js';
import { ExamPriceReader } from '../../pricing/exam-price.reader.js';
import type {
  PublicSpecialtyDetail,
  PublicSpecialtyItem,
  PublicSpecialtyPage,
  PublicSpecialtyQueryDto,
} from './public-specialty.dto.js';
import { PublicSpecialtyRepository } from './public-specialty.repository.js';
import { lowestStartingPrice } from './starting-price.js';

@Injectable()
export class PublicSpecialtyService {
  constructor(
    private readonly repository: PublicSpecialtyRepository,
    private readonly doctors: PublicDoctorRepository,
    private readonly prices: ExamPriceReader,
  ) {}

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
    // Bác sĩ công khai của chuyên khoa (theo chi nhánh nếu có lọc), giá qua hàm chung (H3, Q15).
    const { candidates, rules } = await this.doctors.findCandidates({
      dichVuKhamId: null,
      chuyenKhoaId: id,
      chiNhanhId: branchId,
      likePattern: null,
    });
    const giaKhamTu = lowestStartingPrice(
      candidates.map((c) => ({
        price: this.prices.priceFor(c.giaMacDinh, rules, {
          chucDanh: c.chucDanh,
          soNamKinhNghiem: Number(c.soNamKinhNghiem),
        }),
        mucDatCoc: String(c.mucDatCoc),
      })),
    );
    return { ...pickSpecialty(found), giaKhamTu };
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
