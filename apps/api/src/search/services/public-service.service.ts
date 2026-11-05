import { Injectable } from '@nestjs/common';
import { parseFilterId } from '../common/id-param.js';
import type {
  PublicItems,
  PublicServiceGroupItem,
  PublicServiceGroupQueryDto,
  PublicServiceItem,
  PublicServiceQueryDto,
} from './public-service.dto.js';
import { PublicServiceRepository } from './public-service.repository.js';

@Injectable()
export class PublicServiceService {
  constructor(private readonly repository: PublicServiceRepository) {}

  async listGroups(
    query: PublicServiceGroupQueryDto,
  ): Promise<PublicItems<PublicServiceGroupItem>> {
    // Sai dạng ⇒ 400 trước khi chạm DB; đúng dạng mà không có chi nhánh ⇒ mọi nhóm "Sắp triển khai" (Q23).
    const branchId = parseFilterId(query.chiNhanhId, 'chiNhanhId');
    const items = await this.repository.findGroups(branchId);
    // Chọn lại từng trường để không lọt cột nào ngoài danh sách trắng.
    return {
      items: items.map((row) => ({
        nhomDichVuId: row.nhomDichVuId,
        ten: row.ten,
        soDichVu: row.soDichVu,
        giaTu: row.giaTu,
        sapTrienKhai: row.sapTrienKhai,
      })),
    };
  }

  async listServices(
    query: PublicServiceQueryDto,
  ): Promise<PublicItems<PublicServiceItem>> {
    const branchId = parseFilterId(query.chiNhanhId, 'chiNhanhId');
    const groupId = parseFilterId(query.nhomDichVuId, 'nhomDichVuId');
    const items = await this.repository.findServices(branchId, groupId);
    return {
      items: items.map((row) => ({
        dichVuKhamId: row.dichVuKhamId,
        ten: row.ten,
        nhomDichVu: { id: row.nhomDichVu.id, ten: row.nhomDichVu.ten },
        thoiLuong: row.thoiLuong,
        giaMacDinh: row.giaMacDinh,
        mucDatCoc: row.mucDatCoc,
        soBacSi: row.soBacSi,
      })),
    };
  }
}
