import { Injectable } from '@nestjs/common';
import type { PublicOverview } from './public-overview.dto.js';
import { PublicOverviewRepository } from './public-overview.repository.js';

@Injectable()
export class PublicOverviewService {
  constructor(private readonly repository: PublicOverviewRepository) {}

  /** Chọn lại từng trường để không lọt cột nào ngoài danh sách trắng. */
  async get(): Promise<PublicOverview> {
    const { soChuyenKhoa, soBacSi, soDichVu } = await this.repository.count();
    return { soChuyenKhoa, soBacSi, soDichVu };
  }
}
