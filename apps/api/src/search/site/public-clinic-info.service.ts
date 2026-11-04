import { Injectable } from '@nestjs/common';
import type { PublicClinicInfo } from './public-clinic-info.dto.js';
import { PublicClinicInfoRepository } from './public-clinic-info.repository.js';

@Injectable()
export class PublicClinicInfoService {
  constructor(private readonly repository: PublicClinicInfoRepository) {}

  /** Chưa có dòng nào ⇒ mọi trường `null` (200, không 404). Chọn lại từng trường để không lọt cột nào ngoài danh sách trắng. */
  async get(): Promise<PublicClinicInfo> {
    const row = await this.repository.find();
    return {
      tenThuongHieu: row?.tenThuongHieu ?? null,
      diaChiTruSo: row?.diaChiTruSo ?? null,
      duongDayNong: row?.duongDayNong ?? null,
      email: row?.email ?? null,
    };
  }
}
