import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception.js';
import { AdminScopeRepository } from './admin-scope.repository.js';
import type { AdminMe, AdminScope } from './admin-scope.js';

@Injectable()
export class AdminScopeService {
  constructor(
    @Inject(AdminScopeRepository) private readonly scopes: AdminScopeRepository,
  ) {}

  async resolve(accountId: string): Promise<AdminScope> {
    // Không cache hoặc lấy từ token/body: thay đổi phạm vi có hiệu lực request sau.
    const profile = await this.scopes.findByAccountId(accountId);
    if (profile?.phamViQuanTri === 'ToanHeThong' && profile.chiNhanhId === null)
      return { kind: 'ToanHeThong' };
    if (
      profile?.phamViQuanTri === 'ChiNhanh' &&
      typeof profile.chiNhanhId === 'string' &&
      /^[1-9]\d*$/.test(profile.chiNhanhId)
    )
      return { kind: 'ChiNhanh', chiNhanhId: profile.chiNhanhId };
    throw new AppException(403, 'KHONG_DU_QUYEN');
  }

  async describe(scope: AdminScope): Promise<AdminMe> {
    if (scope.kind === 'ToanHeThong') return { phamVi: 'ToanHeThong' };
    const branch = await this.scopes.findBranch(scope.chiNhanhId);
    if (!branch) throw new AppException(403, 'KHONG_DU_QUYEN');
    return {
      phamVi: 'ChiNhanh',
      chiNhanh: { id: branch.chiNhanhId, ten: branch.ten },
    };
  }
}
