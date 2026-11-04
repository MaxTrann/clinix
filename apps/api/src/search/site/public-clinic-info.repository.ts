import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { PublicClinicInfo } from './public-clinic-info.dto.js';

// Chỉ đọc đúng bốn cột công khai của bảng một dòng `thong_tin_phong_kham` (id luôn bằng 1).
@Injectable()
export class PublicClinicInfoRepository {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  async find(): Promise<PublicClinicInfo | null> {
    const rows = await this.db.query<PublicClinicInfo[]>(
      `SELECT ten_thuong_hieu AS tenThuongHieu, dia_chi_tru_so AS diaChiTruSo,
              duong_day_nong AS duongDayNong, email
       FROM thong_tin_phong_kham WHERE id = 1`,
    );
    return rows[0] ?? null;
  }
}
