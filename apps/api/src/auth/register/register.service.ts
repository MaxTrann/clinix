import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { AppException } from '../../common/errors/app.exception.js';
import {
  isDeadlockError,
  isDuplicateKeyError,
} from '../../database/mysql-errors.js';
import {
  REGISTER_ERROR_CODES,
  REGISTER_MAX_ATTEMPTS,
} from '../auth.constants.js';
import type { IssuedOtp } from '../otp/issued-otp.js';
import { toOtpException } from '../otp/otp-errors.js';
import { currentSecond } from '../otp/otp-time.js';
import { OtpService } from '../otp/otp.service.js';
import type { OtpFailure } from '../otp/otp.types.js';
import { PasswordHasher } from '../password/password-hasher.service.js';
import { TaiKhoanRepository } from '../repositories/tai-khoan.repository.js';
import { deliverRegistrationOtp } from './register-delivery.js';
import type { RegisterInput, RegisterResult } from './register.types.js';
import {
  isExpiredUnverifiedPatient,
  isOpenRegistration,
} from './unverified-account-rules.js';
import { UnverifiedPatientCleaner } from './unverified-patient-cleaner.js';

// Báo cho vòng lặp ở `register` "bị đua, làm lại từ đầu" (lỗi trùng khoá, deadlock, hoặc hàng biến mất giữa chừng). Chỉ dùng nội bộ:
// cố ý KHÔNG mang theo lỗi gốc, vì QueryFailedError chứa tham số câu lệnh (email, băm mật khẩu) và thông điệp "Duplicate entry '<email>'".
class RetryRegistration extends Error {
  constructor() {
    super('Đăng ký bị đua với yêu cầu khác, làm lại từ đầu');
  }
}

type Attempt =
  | { kind: 'retry' }
  | { kind: 'refused'; failure: OtpFailure }
  | { kind: 'issued'; issued: IssuedOtp; email: string };

const emailInUse = (): AppException =>
  new AppException(409, REGISTER_ERROR_CODES.EMAIL_IN_USE, {
    thongBao: 'Email này đã được sử dụng. Vui lòng đăng nhập.',
  });

/**
 * POST /auth/register (task A5; PLAN 5.2). Năm nhánh:
 *  1. email chưa có          → tạo tài khoản (Bệnh nhân, chưa xác minh) + hàng OTP mang dữ liệu lần này;
 *  2. đã xác minh / nhân sự / bị ngưng hoạt động → EMAIL_DA_DUNG;
 *  3. chưa xác minh, quá 24 giờ → xoá (UnverifiedPatientCleaner) rồi như nhánh 1;
 *  4. chưa xác minh, còn hạn → kiểm giới hạn gửi lại (OtpService) rồi chèn hàng OTP mới; `tai_khoan` KHÔNG đổi cho tới khi OTP đúng;
 *  5. commit rồi gửi thư NGOÀI giao dịch (H9); OtpService đặt da_gui_luc và thu hồi mã cũ chỉ khi gửi thành công (N1).
 *
 * Khoá: KHÔNG "SELECT … FOR UPDATE email" khi hàng chưa có (khoá khoảng chỉ mục: deadlock giữa hai yêu cầu, chặn cả email khác cùng khoảng;
 * đã kiểm trên MySQL 8.4 ở register.service.concurrency.int-spec.ts, RG-S1/S5). Thay bằng "chèn trước": trùng email thì MySQL ném 1062 và
 * ta LÀM LẠI CẢ GIAO DỊCH (RG-S4); không khoá tiếp trong cùng giao dịch vì với ba bên trở lên sẽ deadlock (đã kiểm). Tài khoản đã có thì
 * khoá hàng bằng SELECT … FOR UPDATE (khoá bản ghi có thật). Tối đa REGISTER_MAX_ATTEMPTS lần, hết thì lỗi 500 có log.
 *
 * Cô lập: giao dịch mở bằng `OtpService.transaction` (READ COMMITTED). Dưới REPEATABLE READ, `issue` của hai tài khoản khác nhau deadlock với nhau
 * (đo được 43% yêu cầu cấp mã bị 1213 khi 6 tài khoản đăng ký cùng lúc); dưới READ COMMITTED không còn khoá khoảng, 0 lỗi (xem TRACKING A5-C).
 *
 * Mật khẩu chỉ tồn tại ở dạng rõ trong `input` đến khi băm xong (Argon2id, NGOÀI giao dịch để không giữ khoá lúc băm); DB chỉ có băm.
 */
@Injectable()
export class RegisterService {
  private readonly logger = new Logger(RegisterService.name);

  constructor(
    @Inject(DataSource) private readonly dataSource: DataSource,
    @Inject(TaiKhoanRepository) private readonly accounts: TaiKhoanRepository,
    @Inject(PasswordHasher) private readonly hasher: PasswordHasher,
    @Inject(OtpService) private readonly otp: OtpService,
    @Inject(UnverifiedPatientCleaner)
    private readonly cleaner: UnverifiedPatientCleaner,
  ) {}

  async register(input: RegisterInput): Promise<RegisterResult> {
    let matKhauBam: string | undefined;
    for (let attempt = 1; attempt <= REGISTER_MAX_ATTEMPTS; attempt++) {
      // Đọc thường để chọn đường đi. Đã xác minh / nhân sự / bị ngưng thì không bao giờ quay lại trạng thái "đăng ký mở" nên từ chối
      // ngay, không tốn một lần băm.
      const seen = await this.accounts.findByEmail(
        this.dataSource.manager,
        input.email,
      );
      if (seen && !isOpenRegistration(seen)) throw emailInUse();

      matKhauBam ??= await this.hasher.hash(input.matKhau); // băm một lần cho mọi lần thử
      const outcome = await this.attemptOnce(input, matKhauBam, seen !== null);

      if (outcome.kind === 'retry') continue;
      if (outcome.kind === 'refused') throw toOtpException(outcome.failure);
      return this.deliver(outcome.issued, outcome.email, input.hoTen);
    }

    this.logger.error(
      `Đăng ký không hoàn tất sau ${String(REGISTER_MAX_ATTEMPTS)} lần thử vì liên tục đua với yêu cầu khác`,
    );
    throw new Error(
      `Đăng ký không hoàn tất sau ${String(REGISTER_MAX_ATTEMPTS)} lần thử`,
    );
  }

  // Một lần thử = MỘT giao dịch. Lỗi nghiệp vụ (EMAIL_DA_DUNG) và lỗi lập trình ném ra ngoài và làm giao dịch hoàn tác;
  // bị đua thì trả { kind: 'retry' } để vòng lặp làm lại với giao dịch mới.
  private async attemptOnce(
    input: RegisterInput,
    matKhauBam: string,
    accountSeen: boolean,
  ): Promise<Attempt> {
    try {
      // otp.transaction = READ COMMITTED: bắt buộc để OtpService đọc không khoá (nhiều người đăng ký cùng lúc không deadlock chéo tài khoản)
      return await this.otp.transaction(async (em): Promise<Attempt> => {
        const now = currentSecond();
        let taiKhoanId: string;
        let email = input.email;
        let created = true;

        if (!accountSeen) {
          taiKhoanId = await this.createPatient(em, input, matKhauBam, now);
        } else {
          const locked = await this.accounts.findByEmailForUpdate(
            em,
            input.email,
          );
          if (!locked) throw new RetryRegistration(); // bị xoá giữa lúc đọc và lúc khoá
          if (!isOpenRegistration(locked)) throw emailInUse();
          if (isExpiredUnverifiedPatient(locked, now)) {
            if (!(await this.cleaner.purgeIfExpired(em, locked.taiKhoanId))) {
              throw new Error(
                `Tài khoản ${locked.taiKhoanId} quá hạn nhưng không xoá được dù đã khoá hàng`,
              );
            }
            taiKhoanId = await this.createPatient(em, input, matKhauBam, now);
          } else {
            taiKhoanId = locked.taiKhoanId;
            email = locked.email; // thư gửi tới email ĐÃ LƯU trong tài khoản, không tới chuỗi gõ ở lần này
            created = false;
          }
        }

        const issued = await this.otp.issue(
          {
            taiKhoanId,
            loai: 'DangKy',
            registration: {
              hoTen: input.hoTen,
              soDienThoai: input.soDienThoai,
              matKhauBam,
            },
          },
          { manager: em },
        );
        if (!issued.ok) {
          // Chỉ nhánh 4 bị từ chối được (gửi lại quá sớm / quá 5 mã), và khi đó CHƯA ghi gì. Tài khoản vừa tạo chưa có hàng OTP nào
          // nên không thể bị từ chối: nếu xảy ra là lỗi lập trình, ném để hoàn tác cả việc tạo tài khoản.
          if (created) {
            throw new Error('OtpService từ chối cấp mã cho tài khoản vừa tạo');
          }
          return { kind: 'refused', failure: issued.failure };
        }
        return { kind: 'issued', issued: issued.issued, email };
      });
    } catch (error) {
      if (error instanceof RetryRegistration) return { kind: 'retry' };
      throw error;
    }
  }

  private async createPatient(
    em: EntityManager,
    input: RegisterInput,
    matKhauBam: string,
    createdAt: Date,
  ): Promise<string> {
    try {
      return await this.accounts.insertPatient(em, {
        hoTen: input.hoTen,
        email: input.email,
        soDienThoai: input.soDienThoai,
        matKhauBam,
        createdAt,
      });
    } catch (error) {
      // Người khác vừa tạo cùng email (1062), hoặc MySQL chọn giao dịch này làm nạn nhân deadlock (1213): làm lại cả giao dịch
      if (isDuplicateKeyError(error) || isDeadlockError(error)) {
        throw new RetryRegistration();
      }
      throw error;
    }
  }

  // Pha 2 (NGOÀI giao dịch): gửi thư rồi báo kết quả. Cách báo lỗi gửi thư (503 GUI_MAIL_LOI, DK-25) nằm ở register-delivery.ts, dùng chung
  // với "Gửi lại mã" của A6 (DK-48).
  private deliver(
    issued: IssuedOtp,
    email: string,
    fullName: string,
  ): Promise<RegisterResult> {
    return deliverRegistrationOtp(this.otp, this.logger, issued, {
      email,
      fullName,
    });
  }
}
