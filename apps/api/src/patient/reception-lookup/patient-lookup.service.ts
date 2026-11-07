import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { buildLookupPatterns } from '../validation/keyword-policy.js';
import type {
  PatientLookupPage,
  PatientLookupQuery,
} from './patient-lookup.dto.js';
import { PatientLookupRepository } from './patient-lookup.repository.js';

/**
 * Tra cứu bệnh nhân cho Lễ tân (task B6; PLAN patient 5.4, 5.7; TRACKING B6-E). Chỉ đọc: không giao dịch, không khoá, không nhật ký hành động (Q20 = A).
 * Không nhận người gọi: phạm vi toàn hệ thống (Q16), mọi Lễ tân thấy cùng một kết quả. Không log gì: từ khoá và dữ liệu trả về là dữ liệu cá nhân (H5).
 */
@Injectable()
export class PatientLookupService {
  constructor(
    @Inject(DataSource) private readonly dataSource: DataSource,
    @Inject(PatientLookupRepository)
    private readonly lookup: PatientLookupRepository,
  ) {}

  /**
   * Đếm TRƯỚC, chỉ lấy trang khi `offset < total`. Không khớp ai, hoặc trang vượt quá cuối, ra `items: []` (200, không 404, như danh sách của admin)
   * mà không chạy câu trang; nhờ vậy `page` rất lớn (DTO không chặn trên) không bao giờ gửi `OFFSET` khổng lồ cho MySQL, nơi nó báo lỗi 1064 ra 500.
   * Hai câu không cùng ảnh chụp nên dưới ghi đồng thời `total` có thể lệch vài hàng so với `items`; chấp nhận.
   */
  async search(query: PatientLookupQuery): Promise<PatientLookupPage> {
    const patterns = buildLookupPatterns(query.q);
    const em = this.dataSource.manager;
    const total = await this.lookup.count(em, patterns);
    const items =
      query.offset < total
        ? await this.lookup.findPage(em, patterns, query.pageSize, query.offset)
        : [];
    return { items, total, page: query.page, pageSize: query.pageSize };
  }
}
