import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { QuanTriVien } from '../admin/entities/quan-tri-vien.entity.js';
import { ChiNhanh } from '../admin/entities/chi-nhanh.entity.js';

@Injectable()
export class AdminScopeRepository {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  findByAccountId(accountId: string) {
    return this.db.getRepository(QuanTriVien).findOne({
      where: { taiKhoanId: accountId },
      select: { taiKhoanId: true, phamViQuanTri: true, chiNhanhId: true },
    });
  }

  findBranch(branchId: string) {
    return this.db.getRepository(ChiNhanh).findOne({
      where: { chiNhanhId: branchId },
      select: { chiNhanhId: true, ten: true },
    });
  }
}
