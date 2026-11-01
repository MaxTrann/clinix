import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AUTH_ERROR_CODES } from '../auth.constants.js';
import type { LoaiTaiKhoan } from '../entities/enums.js';
import { TaiKhoanRepository } from '../repositories/tai-khoan.repository.js';

/** Thân phản hồi `GET /auth/me`: ĐÚNG ba trường này (danh sách trắng, DN-23). Không email, mã tài khoản, số điện thoại hay băm. */
export interface MeResponse {
  vaiTro: LoaiTaiKhoan;
  hoTen: string;
  daXacMinhEmail: boolean;
}

/**
 * GET /auth/me (task A15; PLAN 5.1; TRACKING A15-A…). Chỉ ĐỌC: một câu SELECT thường, không giao dịch, không khoá, không đụng phiên hay cookie.
 * Ba trường lấy từ CÙNG một hàng nên luôn nhất quán với nhau; vai trò không lấy từ `user.role` của guard để không có hai nguồn cho một hàng.
 * Guard vừa kiểm tài khoản nhưng hàng có thể biến mất hoặc bị ngưng ngay sau đó (job dọn, admin khoá): khi ấy 401 như A13, không 500.
 */
@Injectable()
export class MeService {
  constructor(
    @Inject(DataSource) private readonly dataSource: DataSource,
    @Inject(TaiKhoanRepository) private readonly accounts: TaiKhoanRepository,
  ) {}

  async getProfile(accountId: string): Promise<MeResponse> {
    const account = await this.accounts.findProfile(
      this.dataSource.manager,
      accountId,
    );
    if (account?.trangThai !== 'DangHoatDong') {
      throw new UnauthorizedException(AUTH_ERROR_CODES.SESSION_INACTIVE);
    }
    return {
      vaiTro: account.loaiTaiKhoan,
      hoTen: account.hoTen,
      daXacMinhEmail: account.daXacMinhEmail,
    };
  }
}
