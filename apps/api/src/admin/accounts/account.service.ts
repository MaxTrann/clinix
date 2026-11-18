import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import type { Paged } from '../../common/paging/paged.js';
import { nowVN } from '../../common/time/time.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';
import type { AccountListDto } from './account.dto.js';
import { AccountRepository } from './account.repository.js';
import { accountVisibility } from './account-visibility.js';
import {
  toAccountDetail,
  toAccountView,
  toActivationLinkView,
  type AccountDetail,
  type AccountView,
} from './account-view.js';

@Injectable()
export class AccountService {
  constructor(
    @Inject(AccountRepository) private readonly accounts: AccountRepository,
    @Inject(BranchAccessPolicy) private readonly policy: BranchAccessPolicy,
  ) {}

  async list(
    scope: AdminScope,
    input: AccountListDto,
  ): Promise<Paged<AccountView>> {
    // Bộ lọc cờ no-show là kênh lộ dữ liệu: Q26 cấm Admin Chi nhánh xem no-show, nên cũng không cho lọc theo nó.
    // Chặn TRƯỚC khi chạm DB.
    if (scope.kind === 'ChiNhanh' && input.khoaNoShow !== undefined)
      throw new AppException(403, 'KHONG_DU_QUYEN');
    if (!Number.isSafeInteger(input.offset) || input.offset < 0)
      throw new AppException(400, 'DU_LIEU_KHONG_HOP_LE', {
        loi: [{ truong: 'page', ma: 'TRANG_KHONG_HOP_LE' }],
      });

    const { rows, total } = await this.accounts.list(
      accountVisibility(this.policy, scope, input.chiNhanhId),
      {
        vaiTro: input.vaiTro,
        trangThai: input.trangThai,
        khoaNoShow: input.khoaNoShow,
        q: input.q === '' ? undefined : input.q,
      },
      input.pageSize,
      input.offset,
    );
    return {
      items: rows.map((row) => toAccountView(scope, row)),
      total,
      page: input.page,
      pageSize: input.pageSize,
    };
  }

  async get(scope: AdminScope, id: string): Promise<AccountDetail> {
    const found = await this.accounts.get(
      accountVisibility(this.policy, scope),
      id,
    );
    // Không tồn tại và ngoài tầm nhìn: cùng một nhánh, cùng 404 (Q40).
    if (!found) throw new AppException(404, 'KHONG_TIM_THAY');
    const link =
      found.activationLink === null
        ? null
        : toActivationLinkView(found.activationLink, nowVN());
    return toAccountDetail(scope, found.row, link);
  }
}
