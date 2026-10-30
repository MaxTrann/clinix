import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SignJWT, errors, jwtVerify } from 'jose';
import { randomBytes } from 'node:crypto';
import type { EnvironmentVariables } from '../../config/env.validation.js';
import {
  RESET_TOKEN_ALGORITHM,
  RESET_TOKEN_AUDIENCE,
  RESET_TOKEN_ISSUER,
  RESET_TOKEN_TTL_MS,
} from '../auth.constants.js';
import { isVerificationId } from '../dto/otp-field.decorators.js';
import { currentSecond } from '../otp/otp-time.js';

/** Nội dung của resetToken: tài khoản được đặt lại mật khẩu và hàng OTP `QuenMatKhau` đã được xác minh (A12 `consume` đúng hàng này, N6). */
export interface ResetTokenClaims {
  taiKhoanId: string;
  maXacThucId: string;
}

/**
 * resetToken của quên mật khẩu (task A11; quyết định S2, N6). JWT HS256 ký bằng `JWT_RESET_SECRET`, KHÁC khoá access và refresh (SE-06) nên
 * access token không dùng làm resetToken được và ngược lại (QM-14). Mục đích nằm ở `aud`. Claims: `sub` = tài khoản, `mxt` = mã xác thực (hàng OTP),
 * `iat` và `exp` = iat + 10 phút. Hạn tính từ LÚC XÁC MINH OTP (`issuedAt` do nơi gọi truyền, đồng hồ `currentSecond()`), không từ lúc cấp OTP.
 *
 * Nửa mở như OTP và phiên: còn hiệu lực tới trước `exp`, đúng `exp` là hết (jose: `exp <= now` là hết hạn). Không chạm DB: kiểm hàng OTP (chưa dùng,
 * chưa thu hồi) là việc của A12 (`OtpService.consume`). Token không bị tiêu thụ ở đây nên `verify-otp` lặp lại cấp token mới; mã mới gửi thành công hoặc
 * A12 đặt mật khẩu xong thì hàng OTP bị thu hồi/đã dùng và mọi token cũ mất tác dụng ở A12.
 */
@Injectable()
export class ResetTokenService {
  private readonly logger = new Logger(ResetTokenService.name);
  private readonly key: Uint8Array;

  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.key = this.resolveKey();
  }

  // Cùng quy tắc OTP_HMAC_SECRET (A2): đặt biến thì dùng; CHỈ development mới tự sinh khoá ngẫu nhiên cho lần chạy này (khởi động lại thì resetToken
  // đang giữ mất hiệu lực, tối đa 10 phút); môi trường khác thiếu khoá là lỗi (validateEnv đã chặn từ lúc khởi động, đây là lớp thứ hai). Không in khoá.
  private resolveKey(): Uint8Array {
    const configured = this.config.get('JWT_RESET_SECRET', { infer: true });
    if (configured) return new TextEncoder().encode(configured);
    if (this.config.get('NODE_ENV', { infer: true }) === 'development') {
      this.logger.warn(
        'JWT_RESET_SECRET chưa đặt: dùng khoá ngẫu nhiên cho lần chạy này, resetToken đang giữ sẽ mất hiệu lực khi API khởi động lại ' +
          '(muốn ổn định thì đặt JWT_RESET_SECRET trong .env)',
      );
      return randomBytes(32);
    }
    throw new Error('JWT_RESET_SECRET: bắt buộc khi NODE_ENV khác development');
  }

  async sign(input: {
    taiKhoanId: string;
    maXacThucId: string;
    /** Lúc OTP được xác minh đúng (đồng hồ ứng dụng). */
    issuedAt: Date;
  }): Promise<{ token: string; expiresAt: Date }> {
    const issuedAtSeconds = Math.floor(input.issuedAt.getTime() / 1000);
    const expiresAtSeconds = issuedAtSeconds + RESET_TOKEN_TTL_MS / 1000;
    const token = await new SignJWT({ mxt: input.maXacThucId })
      .setProtectedHeader({ alg: RESET_TOKEN_ALGORITHM, typ: 'JWT' })
      .setSubject(input.taiKhoanId)
      .setIssuer(RESET_TOKEN_ISSUER)
      .setAudience(RESET_TOKEN_AUDIENCE)
      .setIssuedAt(issuedAtSeconds)
      .setExpirationTime(expiresAtSeconds)
      .sign(this.key);
    return { token, expiresAt: new Date(expiresAtSeconds * 1000) };
  }

  // Trả null với MỌI token không dùng được (sai chữ ký, khoá khác, alg none hoặc khác HS256, sai iss/aud/typ, hết hạn, thiếu hoặc hỏng claims).
  // `algorithms` là danh sách cố định; `currentDate` là đồng hồ ứng dụng (test dùng đồng hồ giả), không phải đồng hồ của thư viện.
  async verify(
    token: string,
    now: Date = currentSecond(),
  ): Promise<ResetTokenClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: [RESET_TOKEN_ALGORITHM],
        issuer: RESET_TOKEN_ISSUER,
        audience: RESET_TOKEN_AUDIENCE,
        typ: 'JWT',
        requiredClaims: ['sub', 'mxt', 'exp', 'iat'],
        currentDate: now,
      });
      const { sub, mxt } = payload;
      if (!isVerificationId(sub) || !isVerificationId(mxt)) return null;
      return { taiKhoanId: sub, maXacThucId: mxt };
    } catch (error) {
      if (error instanceof errors.JOSEError) return null; // token không hợp lệ là chuyện bình thường, không phải lỗi hệ thống
      throw error;
    }
  }
}
