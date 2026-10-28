import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { AppException } from '../../common/errors/app.exception.js';
import { isDuplicateKeyError } from '../../database/mysql-errors.js';
import { REGISTER_ERROR_CODES } from '../auth.constants.js';
import type { TaiKhoan } from '../entities/tai-khoan.entity.js';
import type { IssuedOtp } from '../otp/issued-otp.js';
import { toOtpException } from '../otp/otp-errors.js';
import { currentSecond } from '../otp/otp-time.js';
import { OtpService } from '../otp/otp.service.js';
import type {
  OtpFailure,
  Recipient,
  VerifiedContext,
} from '../otp/otp.types.js';
import { BenhNhanRepository } from '../repositories/benh-nhan.repository.js';
import { MaXacThucRepository } from '../repositories/ma-xac-thuc.repository.js';
import { TaiKhoanRepository } from '../repositories/tai-khoan.repository.js';
import { ViNoiBoRepository } from '../repositories/vi-noi-bo.repository.js';
import { deliverRegistrationOtp } from './register-delivery.js';
import type { RegisterResult } from './register.types.js';
import {
  verificationRefusalFor,
  type VerificationRefusal,
} from './verification-rules.js';

export interface VerifyRegistrationInput {
  email: string;
  maXacThucId: string;
  otp: string;
}

export type ResendRegistrationInput = Omit<VerifyRegistrationInput, 'otp'>;

// Email không có tài khoản: trả ĐÚNG cùng mã với "sai cặp email–id" và "id không tồn tại" (OTP_SAI), không ghi gì, không đếm lần sai,
// để người ngoài không dùng hai endpoint này dò xem một email đã đăng ký chưa (H7).
const UNKNOWN_ACCOUNT: OtpFailure = { code: 'OTP_SAI', reason: 'NOT_FOUND' };

type ResendOutcome =
  | { kind: 'refused'; failure: OtpFailure }
  | { kind: 'issued'; issued: IssuedOtp; recipient: Recipient };

// Quá 24 giờ, hoặc dữ liệu đăng ký không còn dùng được: FE đưa người dùng về màn đăng ký lại bằng chính email này
const registrationVoid = (): AppException =>
  toOtpException({ code: 'CAN_DANG_KY_LAI', reason: 'REGISTRATION_VOID' });

function refusalException(refusal: VerificationRefusal): AppException {
  if (refusal === 'ACCOUNT_SUSPENDED') {
    return new AppException(403, REGISTER_ERROR_CODES.ACCOUNT_SUSPENDED, {
      thongBao:
        'Tài khoản đã bị ngưng hoạt động. Vui lòng liên hệ quản trị viên.',
    });
  }
  return registrationVoid();
}

/**
 * POST /auth/register/verify-otp và /resend-otp (task A6; PLAN 5.2, quyết định A6-A…). Cả hai nhận `email` kèm `maXacThucId` (phương án B của
 * rủi ro id tuần tự): tra tài khoản theo email bằng đọc KHÔNG khoá rồi truyền `expectedTaiKhoanId` cho OtpService. Email lạ hoặc sai cặp
 * email–id ⇒ OTP_SAI, không đếm lần sai, không ghi gì, không gửi thư.
 *
 * verify-otp: `OtpService.verify` tự mở giao dịch RIÊNG (READ COMMITTED) và chạy `activate` TRONG CÙNG giao dịch với việc đánh dấu mã đã dùng,
 * nên việc nào lỗi thì cả giao dịch hoàn tác, kể cả `da_dung_luc` (DK-03). Lần đếm sai của mã sai thì commit riêng, không bị hoàn tác theo.
 * Điều kiện tài khoản (24 giờ, ngưng hoạt động…) CHỈ kiểm khi mã ĐÚNG: mã sai vẫn là OTP_SAI và vẫn đếm, nên kẻ đoán mã không phân biệt được
 * tài khoản đang ngưng hay quá hạn. Không tạo phiên, không trả token: đăng nhập là việc của A8 (ĐK b10).
 *
 * resend-otp: trong `otp.transaction` (READ COMMITTED, bắt buộc để nhiều tài khoản không deadlock chéo, A5-C) gọi `reissue`, rồi kiểm điều kiện
 * tài khoản dưới cùng khoá tài khoản; không đạt thì ném để hoàn tác cả hàng vừa chèn. Gửi thư SAU commit (H9), cách báo gửi lỗi dùng chung với A5.
 * Thứ tự từ chối của resend: OtpService trước (OTP_SAI, OTP_BI_THAY_THE, CAN_DANG_KY_LAI, GUI_LAI_QUA_SOM), rồi mới tới 24 giờ/ngưng hoạt động.
 *
 * Mọi mốc thời gian lấy từ MỘT đồng hồ (`currentSecond()` của OtpService); A6 không dùng NOW() của DB và không tự ghi mốc nào.
 */
@Injectable()
export class RegisterVerificationService {
  private readonly logger = new Logger(RegisterVerificationService.name);

  constructor(
    @Inject(DataSource) private readonly dataSource: DataSource,
    @Inject(TaiKhoanRepository) private readonly accounts: TaiKhoanRepository,
    @Inject(BenhNhanRepository) private readonly patients: BenhNhanRepository,
    @Inject(ViNoiBoRepository) private readonly wallets: ViNoiBoRepository,
    @Inject(MaXacThucRepository) private readonly codes: MaXacThucRepository,
    @Inject(OtpService) private readonly otp: OtpService,
  ) {}

  async verifyOtp(input: VerifyRegistrationInput): Promise<void> {
    const account = await this.accounts.findByEmail(
      this.dataSource.manager,
      input.email,
    );
    if (!account) throw toOtpException(UNKNOWN_ACCOUNT);

    const result = await this.otp.verify(
      {
        maXacThucId: input.maXacThucId,
        loai: 'DangKy',
        otp: input.otp,
        expectedTaiKhoanId: account.taiKhoanId,
      },
      { consume: true },
      (context) => this.activate(context),
    );
    if (!result.ok) throw toOtpException(result.failure);
  }

  async resendOtp(input: ResendRegistrationInput): Promise<RegisterResult> {
    const account = await this.accounts.findByEmail(
      this.dataSource.manager,
      input.email,
    );
    if (!account) throw toOtpException(UNKNOWN_ACCOUNT);

    const outcome = await this.otp.transaction(
      async (em): Promise<ResendOutcome> => {
        const reissued = await this.otp.reissue(
          {
            maXacThucId: input.maXacThucId,
            expectedTaiKhoanId: account.taiKhoanId,
          },
          { manager: em },
        );
        if (!reissued.ok) return { kind: 'refused', failure: reissued.failure };

        // reissue đã giữ khoá tài khoản; đọc lại dưới khoá để quyết định bằng trạng thái MỚI NHẤT (có thể vừa bị xác minh/ngưng/quá hạn)
        const locked = await this.accounts.findByIdForUpdate(
          em,
          account.taiKhoanId,
        );
        if (!locked) {
          throw new Error(
            `Không thấy tài khoản ${account.taiKhoanId} dù đã khoá khi gửi lại OTP`,
          );
        }
        this.ensureEligible(locked, currentSecond());

        // Lời chào trong thư dùng họ tên của lần đăng ký MÀ hàng mới mang (cũng là tên sẽ được lưu khi xác minh), không phải tên cũ trong tai_khoan
        const row = await this.codes.findById(em, reissued.issued.maXacThucId);
        return {
          kind: 'issued',
          issued: reissued.issued,
          recipient: {
            email: locked.email,
            fullName: row?.hoTenDangKy ?? null,
          },
        };
      },
    );
    if (outcome.kind === 'refused') throw toOtpException(outcome.failure);
    return deliverRegistrationOtp(
      this.otp,
      this.logger,
      outcome.issued,
      outcome.recipient,
    );
  }

  // Chạy TRONG giao dịch của verify, dưới khoá tài khoản và khoá hàng OTP đã giữ. Ném lỗi ở bất cứ bước nào ⇒ hoàn tác trọn (kể cả da_dung_luc).
  private async activate({
    manager,
    otp,
    now,
  }: VerifiedContext): Promise<void> {
    const id = otp.taiKhoanId;
    const account = await this.accounts.findByIdForUpdate(manager, id);
    if (!account) {
      throw new Error(`Không thấy tài khoản ${id} dù đã khoá khi xác minh OTP`);
    }
    this.ensureEligible(account, now);

    // Hàng OTP đã khớp mã mà không còn dữ liệu đăng ký: dữ liệu hỏng (OtpService đã chặn hàng NULL cả ba cột là CAN_DANG_KY_LAI trước khi
    // so mã, nên tới đây chỉ có thể là NULL một phần). Tuyệt đối không ghi tai_khoan bằng giá trị rỗng.
    const { registration } = otp;
    if (!registration) {
      this.logger.warn(
        `Tài khoản ${id}: mã OTP đúng nhưng hàng mã thiếu dữ liệu đăng ký, từ chối xác minh (dữ liệu không nhất quán)`,
      );
      throw registrationVoid();
    }

    if (
      !(await this.accounts.activateRegistration(manager, id, registration))
    ) {
      throw new Error(
        `Không kích hoạt được tài khoản ${id} dù đã khoá và kiểm điều kiện`,
      );
    }
    await this.createProfile(manager, id);
    // Thu hồi các mã đăng ký CÒN LẠI (không đụng mã QuenMatKhau: do chính chủ hộp thư yêu cầu) rồi xoá dữ liệu đăng ký (mật khẩu băm)
    // khỏi MỌI hàng DangKy, kể cả hàng vừa dùng (DK-45)
    await this.otp.revokePending(id, 'DangKy', { manager });
    await this.otp.clearRegistrationData(id, { manager });
    this.logger.log(
      `Tài khoản ${id} đã xác minh email; tạo hồ sơ bệnh nhân và ví nội bộ`,
    );
  }

  private async createProfile(
    manager: EntityManager,
    id: string,
  ): Promise<void> {
    try {
      await this.patients.insertNew(manager, id);
      await this.wallets.insertEmpty(manager, id);
    } catch (error) {
      // Tài khoản chưa xác minh mà đã có hồ sơ hoặc ví: dữ liệu hỏng, KHÔNG phải lỗi nghiệp vụ. Hoàn tác cả giao dịch và trả 500 có log;
      // không nối lỗi gốc vào (QueryFailedError mang cả tham số câu lệnh).
      if (isDuplicateKeyError(error)) {
        this.logger.error(
          `Tài khoản ${id} chưa xác minh nhưng đã có hồ sơ bệnh nhân hoặc ví nội bộ: dữ liệu không nhất quán`,
        );
        throw new Error(
          `Hồ sơ bệnh nhân hoặc ví nội bộ của tài khoản ${id} đã tồn tại trước khi xác minh`,
        );
      }
      throw error;
    }
  }

  // Tài khoản không đủ điều kiện ⇒ ném (nơi gọi đang ở trong giao dịch nên mọi việc đã ghi đều hoàn tác)
  private ensureEligible(account: TaiKhoan, now: Date): void {
    const refusal = verificationRefusalFor(account, now);
    if (!refusal) return;
    if (refusal === 'ACCOUNT_NOT_PENDING') {
      this.logger.warn(
        `Tài khoản ${account.taiKhoanId} còn mã đăng ký sống nhưng không còn ở trạng thái chờ xác minh: từ chối (dữ liệu không nhất quán)`,
      );
    }
    throw refusalException(refusal);
  }
}
