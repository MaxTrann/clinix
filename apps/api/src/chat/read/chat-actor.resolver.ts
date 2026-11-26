import { Inject, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/decorators/current-user.decorator.js';
import { AppException } from '../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';
import { ReceptionScopeService } from '../../rbac/reception-scope.service.js';
import type { ChatActor } from '../core/chat-access.policy.js';

// Dựng người thao tác của chat từ token (chat B2; PLAN chat 5.3). Tài khoản và vai trò chỉ lấy từ token (đã đọc DB ở guard); chi nhánh của Lễ tân đọc
// bằng `ReceptionScopeService.resolve` ở MỖI yêu cầu (không cache, không lấy từ client): đổi chi nhánh có hiệu lực ngay ở yêu cầu sau (NBN-14, MH5).
// Lễ tân không còn phạm vi hợp lệ ⇒ 403 `KHONG_DU_QUYEN` do chính `resolve` ném (QCH-08). Quản trị viên đã bị `@Roles` chặn; đây chỉ là lưới an toàn.
@Injectable()
export class ChatActorResolver {
  constructor(
    @Inject(ReceptionScopeService)
    private readonly receptionScope: ReceptionScopeService,
  ) {}

  async resolve(user: AuthenticatedUser): Promise<ChatActor> {
    switch (user.role) {
      case 'BenhNhan':
        return { vaiTro: 'BenhNhan', taiKhoanId: user.accountId };
      case 'BacSi':
        return { vaiTro: 'BacSi', taiKhoanId: user.accountId };
      case 'LeTan': {
        const scope = await this.receptionScope.resolve(user.accountId);
        return {
          vaiTro: 'LeTan',
          taiKhoanId: user.accountId,
          chiNhanhId: scope.chiNhanhId,
        };
      }
      default:
        throw new AppException(403, COMMON_ERROR_CODES.FORBIDDEN);
    }
  }
}
