import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception.js';
import { ReceptionScopeRepository } from './reception-scope.repository.js';
import type { ReceptionScope } from './reception-scope.js';

@Injectable()
export class ReceptionScopeService {
  constructor(
    @Inject(ReceptionScopeRepository)
    private readonly scopes: ReceptionScopeRepository,
  ) {}

  async resolve(accountId: string): Promise<ReceptionScope> {
    // Không cache hoặc lấy từ token/body: đổi chi nhánh hay khoá tài khoản có hiệu lực ở request sau.
    const profile = await this.scopes.findByAccountId(accountId);
    // Một mã chung cho mọi nhánh từ chối (không có dòng, không còn hoạt động, chi nhánh hỏng): không lộ trạng thái tài khoản.
    if (
      profile?.trangThai === 'DangHoatDong' &&
      /^[1-9]\d*$/.test(profile.chiNhanhId)
    )
      return { kind: 'ChiNhanh', chiNhanhId: profile.chiNhanhId };
    throw new AppException(403, 'KHONG_DU_QUYEN');
  }
}
