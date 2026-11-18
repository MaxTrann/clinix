import { Inject, Injectable, Logger } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { AuditService } from '../../audit/audit.service.js';
import { isExpiredUnverifiedPatient } from '../../auth/register/unverified-account-rules.js';
import { UnverifiedPatientCleaner } from '../../auth/register/unverified-patient-cleaner.js';
import { nowVN, toSecond } from '../../common/time/time.js';
import {
  isDeadlockError,
  isDuplicateKeyError,
  isForeignKeyError,
} from '../../database/mysql-errors.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';
import { ActivationLinkService } from '../staff-activation/activation-link.service.js';
import type { ActivationRecipient } from '../staff-activation/activation-link.types.js';
import type { IssuedActivationLink } from '../staff-activation/issued-activation-link.js';
import { STAFF_ACTIVATION_ERROR_CODES } from '../staff-activation/staff-activation.constants.js';
import {
  branchIdOf,
  buildCreateAudit,
  canCreateRole,
  isCompatibleTitleDegree,
} from './staff-account-rules.js';
import {
  emailInUse,
  invalidBranch,
  invalidSpecialty,
  notAllowed,
  serviceNotAtBranch,
  titleDegreeMismatch,
} from './staff-account.errors.js';
import { StaffAccountRepository } from './staff-account.repository.js';
import type {
  CreateStaffAccountResponse,
  GuiEmailResult,
  StaffAccountInput,
} from './staff-account.types.js';

// Số lần làm lại cả giao dịch khi MySQL chọn nó làm nạn nhân deadlock (1213). Cùng con số REGISTER_MAX_ATTEMPTS của auth A5.
const MAX_ATTEMPTS = 3;

/** Kết quả giao dịch tạo: mọi thứ pha gửi thư (NGOÀI giao dịch) cần. Token và URL nằm kín trong IssuedActivationLink. */
interface CreatedAccount {
  taiKhoanId: string;
  issued: IssuedActivationLink;
  recipient: ActivationRecipient;
}

/**
 * POST /admin/staff-accounts (task B15; PLAN admin 5.5 "Tạo tài khoản", 7.4 NS-01…NS-25; quyết định Q19, Q20, Q24, Q32, Q39, Q40).
 *
 * Một lần gọi:
 *  1. Kiểm THUẦN trước mọi truy cập DB: quyền theo vai trò (403), tổ hợp chức danh–học vị (400).
 *  2. MỘT giao dịch READ COMMITTED (`ActivationLinkService.transaction`, đúng cách B14 hướng dẫn cho B15): kiểm tham chiếu (chi nhánh trong phạm vi và có
 *     thật; chuyên khoa đang hoạt động; dịch vụ có ở chi nhánh) → email (Q32) → chèn `tai_khoan` → chèn hồ sơ vai trò → `issue` liên kết ("mới tạo") →
 *     ghi audit `TaoTaiKhoanNhanSu`. Lỗi ở BẤT KỲ bước nào ⇒ hoàn tác hết: không `tai_khoan`, hồ sơ, `ma_xac_thuc`, audit nào (NS-17).
 *  3. SAU commit: `deliver` gửi thư NGOÀI giao dịch (không giữ khoá lúc gọi SMTP). Gửi lỗi thì tài khoản vẫn tạo ở `ChoKichHoat` và phản hồi báo `ThatBai`.
 *
 * Email trùng (NS-09, NS-22): KHÔNG `SELECT … FOR UPDATE email` khi hàng chưa có (khoá khoảng chỉ mục, auth A5 đã đo: RG-S1, RG-S5). Hàng đã có thì đọc
 * thường rồi chỉ khoá khi cần xoá (Bệnh nhân chưa xác minh quá 24 giờ, Q32); hàng chưa có thì chèn thẳng và bắt 1062 (UNIQUE `email`) thành EMAIL_DA_DUNG.
 * Deadlock (1213) ⇒ làm lại cả giao dịch tối đa MAX_ATTEMPTS lần; các lần làm lại KHÔNG gửi thư và KHÔNG để lại audit (thư gửi sau commit cuối, audit trong
 * giao dịch thành công duy nhất).
 *
 * Không bao giờ ghi token, URL hay băm vào log, lỗi, phản hồi hay audit (NS-21). Không có mật khẩu ở đâu (NS-18).
 */
@Injectable()
export class StaffAccountService {
  private readonly logger = new Logger(StaffAccountService.name);

  constructor(
    @Inject(ActivationLinkService)
    private readonly links: ActivationLinkService,
    @Inject(StaffAccountRepository)
    private readonly repo: StaffAccountRepository,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(BranchAccessPolicy) private readonly policy: BranchAccessPolicy,
    @Inject(UnverifiedPatientCleaner)
    private readonly cleaner: UnverifiedPatientCleaner,
  ) {}

  async create(
    scope: AdminScope,
    actorId: string,
    input: StaffAccountInput,
  ): Promise<CreateStaffAccountResponse> {
    if (!canCreateRole(scope, input.vaiTro)) throw notAllowed();
    if (
      input.vaiTro === 'BacSi' &&
      !isCompatibleTitleDegree(input.chucDanh, input.hocVi)
    ) {
      throw titleDegreeMismatch();
    }

    const created = await this.createWithRetry(scope, actorId, input);
    return {
      taiKhoanId: created.taiKhoanId,
      loaiTaiKhoan: input.vaiTro,
      trangThai: 'ChoKichHoat',
      guiEmail: await this.deliver(created),
    };
  }

  private async createWithRetry(
    scope: AdminScope,
    actorId: string,
    input: StaffAccountInput,
  ): Promise<CreatedAccount> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.links.transaction((em) =>
          this.createIn(em, scope, actorId, input),
        );
      } catch (error) {
        if (!isDeadlockError(error) || attempt >= MAX_ATTEMPTS) throw error;
        this.logger.warn(
          `Tạo tài khoản nhân sự: deadlock (1213) lần ${String(attempt)}/${String(MAX_ATTEMPTS)}, làm lại cả giao dịch`,
        );
      }
    }
  }

  // Thân giao dịch. Thứ tự từ rẻ đến đắt và từ chối sớm thì CHƯA ghi gì: tham chiếu trước email, để một yêu cầu sai chi nhánh không bao giờ đụng tới
  // Bệnh nhân hết hạn đang chiếm email.
  private async createIn(
    em: EntityManager,
    scope: AdminScope,
    actorId: string,
    input: StaffAccountInput,
  ): Promise<CreatedAccount> {
    await this.checkReferences(em, scope, input);
    await this.claimEmail(em, input.email);

    const taiKhoanId = await this.insertAccount(em, input);
    await this.insertProfile(em, taiKhoanId, input);

    const issued = await this.links.issue(
      { taiKhoanId, kind: 'TaoMoi' },
      { manager: em },
    );
    if (!issued.ok) {
      // Tài khoản vừa chèn là nhân sự ChoKichHoat và chưa có hàng liên kết nào nên không thể bị từ chối: nếu xảy ra là lỗi lập trình, hoàn tác tất cả
      throw new Error(
        'ActivationLinkService từ chối cấp liên kết cho tài khoản nhân sự vừa tạo',
      );
    }

    // Cùng giao dịch: lỗi ghi audit làm hoàn tác cả việc tạo (NS-24), nên KHÔNG bắt lỗi ở đây
    await this.audit.record(em, buildCreateAudit(actorId, taiKhoanId, input));
    return {
      taiKhoanId,
      issued: issued.issued,
      recipient: { email: input.email, fullName: input.hoTen },
    };
  }

  // Chi nhánh (ngoài phạm vi và không tồn tại cho CÙNG một lỗi, Q40), chuyên khoa đang hoạt động (Q19), dịch vụ có ở chi nhánh (NS-13).
  private async checkReferences(
    em: EntityManager,
    scope: AdminScope,
    input: StaffAccountInput,
  ): Promise<void> {
    const branchId = branchIdOf(input);
    if (branchId !== null) {
      if (
        !this.policy.canAccessBranch(scope, branchId) ||
        !(await this.repo.branchExists(em, branchId))
      ) {
        throw invalidBranch();
      }
    }
    if (input.vaiTro !== 'BacSi') return;
    if (!(await this.repo.lockActiveSpecialty(em, input.chuyenKhoaId))) {
      throw invalidSpecialty();
    }
    if (
      !(await this.repo.lockServiceAtBranch(
        em,
        input.chiNhanhId,
        input.dichVuKhamId,
      ))
    ) {
      throw serviceNotAtBranch();
    }
  }

  // Email đã có ở bất kỳ loại/trạng thái nào ⇒ EMAIL_DA_DUNG, TRỪ Bệnh nhân chưa xác minh đang hoạt động đã đủ 24 giờ (Q32): xoá tài khoản đó (cùng giao
  // dịch) để email dùng được. Bệnh nhân còn hạn, đã xác minh, `NgungHoatDong` và nhân sự giữ email. Hàng chưa có ⇒ trả về, `insertAccount` tự bắt 1062.
  private async claimEmail(em: EntityManager, email: string): Promise<void> {
    const now = toSecond(nowVN());
    const seen = await this.repo.findByEmail(em, email);
    if (seen === null) return;
    if (!isExpiredUnverifiedPatient(seen, now)) throw emailInUse();

    // Đọc lại dưới khoá: giữa lúc đọc thường và lúc khoá, người đó có thể đã xác minh, bị ngưng hoặc bị xoá (job dọn A7)
    const locked = await this.repo.findByEmailForUpdate(em, email);
    if (locked === null) return;
    if (!isExpiredUnverifiedPatient(locked, now)) throw emailInUse();
    try {
      if (!(await this.cleaner.purgeIfExpired(em, locked.taiKhoanId))) {
        throw new Error(
          `Tài khoản ${locked.taiKhoanId} quá hạn nhưng không xoá được dù đã khoá hàng`,
        );
      }
    } catch (error) {
      // Còn bảng khác tham chiếu Bệnh nhân hết hạn (cleaner đã ghi log và không xoá gì): email vẫn đang được dùng, nên là lỗi nghiệp vụ, không phải 500
      if (isForeignKeyError(error)) throw emailInUse();
      throw error;
    }
  }

  private async insertAccount(
    em: EntityManager,
    input: StaffAccountInput,
  ): Promise<string> {
    try {
      return await this.repo.insertAccount(em, {
        hoTen: input.hoTen,
        email: input.email,
        soDienThoai: input.soDienThoai,
        loaiTaiKhoan: input.vaiTro,
        createdAt: toSecond(nowVN()),
      });
    } catch (error) {
      // UNIQUE `email`: người khác vừa tạo cùng email (hàng mới thì không bao giờ hết hạn). Thông điệp gốc có email nên KHÔNG chuyển đi.
      if (isDuplicateKeyError(error)) throw emailInUse();
      throw error;
    }
  }

  private insertProfile(
    em: EntityManager,
    taiKhoanId: string,
    input: StaffAccountInput,
  ): Promise<void> {
    switch (input.vaiTro) {
      case 'BacSi':
        return this.repo.insertDoctor(em, taiKhoanId, input);
      case 'LeTan':
        return this.repo.insertReceptionist(em, taiKhoanId, input);
      case 'QuanTriVien':
        return this.repo.insertAdmin(em, taiKhoanId, input);
    }
  }

  // Pha 2, NGOÀI giao dịch. `deliver` trả `ok: false` khi MailSendError. Lỗi khác (lỗi lập trình khi dựng thư, hoặc DB lỗi lúc ghi kết quả sau gửi)
  // cũng đổi thành `ThatBai`: tài khoản ĐÃ commit nên trả 500 sẽ làm Admin nhập lại và gặp EMAIL_DA_DUNG; trạng thái thật là "đã tạo, liên kết chưa hiệu lực,
  // hãy Gửi lại". Log chỉ có mã tài khoản và TÊN lỗi (không thông điệp, không email, không URL).
  private async deliver(created: CreatedAccount): Promise<GuiEmailResult> {
    try {
      const result = await this.links.deliver(
        created.issued,
        created.recipient,
      );
      if (result.ok) return { ketQua: 'DaGui' };
      return { ketQua: 'ThatBai', maLoi: result.maLoi };
    } catch (error) {
      this.logger.error(
        `Gửi liên kết kích hoạt cho tài khoản ${created.taiKhoanId} gặp lỗi ngoài dự kiến (${error instanceof Error ? error.name : 'không rõ'}): tài khoản đã tạo, báo gửi lỗi`,
      );
      return {
        ketQua: 'ThatBai',
        maLoi: STAFF_ACTIVATION_ERROR_CODES.MAIL_FAILED,
      };
    }
  }
}
