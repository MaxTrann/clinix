import { Inject, Injectable, Logger } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { AppException } from '../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';
import { isDeadlockError } from '../../database/mysql-errors.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';
import { accountVisibility } from '../accounts/account-visibility.js';
import { ActivationLinkService } from '../staff-activation/activation-link.service.js';
import type { ActivationRecipient } from '../staff-activation/activation-link.types.js';
import type { IssuedActivationLink } from '../staff-activation/issued-activation-link.js';
import { toIssueException } from '../staff-activation/staff-activation-errors.js';
import { STAFF_ACTIVATION_ERROR_CODES } from '../staff-activation/staff-activation.constants.js';
import { decideResendAccess } from './account-resend.policy.js';
import { AccountResendRepository } from './account-resend.repository.js';
import type { ResendActivationResponse } from './account-resend.types.js';

// Số lần làm lại cả giao dịch khi MySQL chọn nó làm nạn nhân deadlock (1213). Cùng con số của B15 (`MAX_ATTEMPTS`) và B18.
const MAX_ATTEMPTS = 3;

// Phản hồi khi gửi thư lỗi: hàng mới đã bị thu hồi nên không có hạn mới (liên kết cũ còn hạn, nếu có, vẫn dùng được)
const failed = (
  id: string,
  maLoi: typeof STAFF_ACTIVATION_ERROR_CODES.MAIL_FAILED,
): ResendActivationResponse => ({
  taiKhoanId: id,
  guiEmail: { ketQua: 'ThatBai', maLoi },
  hanLienKet: null,
});

/** Kết quả giao dịch 1: mọi thứ pha gửi thư (NGOÀI giao dịch) cần. Token và URL nằm kín trong IssuedActivationLink. */
interface Prepared {
  issued: IssuedActivationLink;
  recipient: ActivationRecipient;
}

/**
 * POST /admin/accounts/:id/resend-activation (task B20; PLAN admin 5.5 "Gửi lại", 5.6, 7.5 TK-40…48; quyết định Q22, Q23, Q27, Q40, Q45).
 * Mọi việc khó (sinh và băm token, giới hạn Q23, thu hồi rồi đặt `da_gui_luc`, giữ liên kết cũ khi gửi lỗi) đã nằm ở `ActivationLinkService` của B14;
 * B20 chỉ làm phần B14 cố ý để người gọi: khoá, tầm nhìn, quyền, và gói phản hồi.
 *
 * Một lần gọi (cùng mô hình B15):
 *  1. MỘT giao dịch READ COMMITTED (`ActivationLinkService.transaction`, đúng cách B14 hướng dẫn): khoá hàng `tai_khoan` → đọc đích theo tầm nhìn
 *     (không thấy ⇒ 404) → quyền (403) → `issue` ('GuiLai': nhân sự `ChoKichHoat` ⇒ 409, giới hạn ⇒ 429, rồi chèn hàng "mới tạo"). Lỗi ở bước nào
 *     cũng hoàn tác: chưa ghi gì.
 *  2. SAU commit: `deliver` gửi thư NGOÀI giao dịch (không giữ khoá lúc gọi SMTP) và ghi kết quả: thành công ⇒ thu hồi liên kết cũ RỒI đặt `da_gui_luc`;
 *     gửi lỗi ⇒ chỉ thu hồi hàng mới, liên kết cũ còn hạn GIỮ NGUYÊN. Gửi lỗi vẫn trả 200 với `guiEmail = ThatBai` (như B15 trả 201).
 *
 * Khoá "trước rồi đọc": nếu gộp một câu `FOR UPDATE OF t`, các bảng nối đọc theo ảnh chụp của chính câu đó và có thể cũ so với giao dịch khác đang giữ khoá
 * `tai_khoan` (B13 đổi chi nhánh Bác sĩ). Khoá xong mới đọc thì câu đọc bắt đầu sau khi người kia commit nên thấy chi nhánh hiện tại.
 * Deadlock (1213) ⇒ làm lại cả giao dịch 1 tối đa MAX_ATTEMPTS lần; các lần làm lại KHÔNG gửi thư và không để lại dấu vết (thư gửi sau commit cuối).
 *
 * Không ghi audit: PLAN 5.10 không có giá trị cho "gửi lại" (Đại chọn phương án A, 19/11/2026). Không bao giờ ghi token, URL, băm hay email vào log, lỗi
 * hay phản hồi: B20 chỉ cầm `IssuedActivationLink` (đã ẩn URL) và chuyển nó cho `deliver`.
 */
@Injectable()
export class AccountResendService {
  private readonly logger = new Logger(AccountResendService.name);

  constructor(
    @Inject(ActivationLinkService)
    private readonly links: ActivationLinkService,
    @Inject(AccountResendRepository)
    private readonly repo: AccountResendRepository,
    @Inject(BranchAccessPolicy) private readonly policy: BranchAccessPolicy,
  ) {}

  async resend(
    scope: AdminScope,
    id: string,
  ): Promise<ResendActivationResponse> {
    const prepared = await this.prepareWithRetry(scope, id);
    return this.deliver(id, prepared);
  }

  private async prepareWithRetry(
    scope: AdminScope,
    id: string,
  ): Promise<Prepared> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.links.transaction((em) =>
          this.prepareIn(em, scope, id),
        );
      } catch (error) {
        if (!isDeadlockError(error) || attempt >= MAX_ATTEMPTS) throw error;
        this.logger.warn(
          `Gửi lại liên kết kích hoạt: deadlock (1213) lần ${String(attempt)}/${String(MAX_ATTEMPTS)}, làm lại cả giao dịch`,
        );
      }
    }
  }

  // Thân giao dịch 1. Thứ tự theo PLAN 5.6 (4a/4b): tồn tại và tầm nhìn (404) → quyền (403) → loại, trạng thái (409), giới hạn (429) trong `issue`.
  private async prepareIn(
    em: EntityManager,
    scope: AdminScope,
    id: string,
  ): Promise<Prepared> {
    await this.repo.lockAccount(em, id);
    const target = await this.repo.findVisible(
      em,
      accountVisibility(this.policy, scope),
      id,
    );
    if (target === null) {
      throw new AppException(404, COMMON_ERROR_CODES.NOT_FOUND);
    }
    decideResendAccess(scope, target);

    const issued = await this.links.issue(
      { taiKhoanId: target.taiKhoanId, kind: 'GuiLai' },
      { manager: em },
    );
    if (!issued.ok) throw toIssueException(issued.failure);
    return {
      issued: issued.issued,
      recipient: { email: target.email, fullName: target.hoTen },
    };
  }

  // Pha 2, NGOÀI giao dịch. `deliver` trả `ok: false` khi MailSendError. Lỗi khác (lỗi lập trình khi dựng thư, hoặc DB lỗi lúc ghi kết quả sau gửi) cũng đổi
  // thành `ThatBai`: hàng liên kết ĐÃ commit nên trả 500 làm Admin tưởng chưa có gì; trạng thái thật là "liên kết mới chưa hiệu lực, hãy Gửi lại" (cách ≥ 60
  // giây). Log chỉ có mã tài khoản và TÊN lỗi (không thông điệp, không email, không URL).
  private async deliver(
    id: string,
    prepared: Prepared,
  ): Promise<ResendActivationResponse> {
    try {
      const result = await this.links.deliver(
        prepared.issued,
        prepared.recipient,
      );
      if (result.ok) {
        return {
          taiKhoanId: id,
          guiEmail: { ketQua: 'DaGui' },
          hanLienKet: result.hetHanLuc,
        };
      }
      return failed(id, result.maLoi);
    } catch (error) {
      this.logger.error(
        `Gửi lại liên kết kích hoạt cho tài khoản ${id} gặp lỗi ngoài dự kiến (${error instanceof Error ? error.name : 'không rõ'}): báo gửi lỗi`,
      );
      return failed(id, STAFF_ACTIVATION_ERROR_CODES.MAIL_FAILED);
    }
  }
}
