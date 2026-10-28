import { Inject, Injectable, Logger } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { isForeignKeyError } from '../../database/mysql-errors.js';
import { currentSecond } from '../otp/otp-time.js';
import { MaXacThucRepository } from '../repositories/ma-xac-thuc.repository.js';
import { PhienDangNhapRepository } from '../repositories/phien-dang-nhap.repository.js';
import { TaiKhoanRepository } from '../repositories/tai-khoan.repository.js';
import { isExpiredUnverifiedPatient } from './unverified-account-rules.js';

/**
 * Xoá tài khoản Bệnh nhân chưa xác minh đã quá 24 giờ (task A5 dùng cho xoá lười khi đăng ký lại; task A7 dùng cho job dọn định kỳ).
 *
 * `purgeIfExpired(em, taiKhoanId)` chạy trong GIAO DỊCH CỦA NGƯỜI GỌI (`em` bắt buộc) để cùng commit/rollback với việc tạo tài khoản
 * mới (A5) hoặc với một lô (A7: mỗi id một giao dịch). Thứ tự: khoá hàng tai_khoan → kiểm điều kiện dưới khoá → xoá ma_xac_thuc → xoá
 * phien_dang_nhap → xoá tai_khoan (khoá ngoại không CASCADE, H2). Không đụng nhân sự, tài khoản đã xác minh, tài khoản bị ngưng hoạt động
 * (H1; điều kiện nằm ở cả luật `isExpiredUnverifiedPatient` lẫn câu DELETE của repository). Trả false nếu tài khoản không còn / chưa đủ điều kiện.
 *
 * Còn bảng khác tham chiếu tới tài khoản (thong_bao, tin_nhan…) thì khoá ngoại chặn: hàm GHI LOG rồi ném lỗi để người gọi hoàn tác, không bao giờ
 * xoá lặng lẽ hay bỏ qua. Log chỉ có mã tài khoản (không email, họ tên, băm).
 */
@Injectable()
export class UnverifiedPatientCleaner {
  private readonly logger = new Logger(UnverifiedPatientCleaner.name);

  constructor(
    @Inject(TaiKhoanRepository) private readonly accounts: TaiKhoanRepository,
    @Inject(MaXacThucRepository) private readonly otps: MaXacThucRepository,
    @Inject(PhienDangNhapRepository)
    private readonly sessions: PhienDangNhapRepository,
  ) {}

  async purgeIfExpired(
    em: EntityManager,
    taiKhoanId: string,
  ): Promise<boolean> {
    const account = await this.accounts.findByIdForUpdate(em, taiKhoanId);
    if (!account || !isExpiredUnverifiedPatient(account, currentSecond())) {
      return false;
    }

    try {
      await this.otps.deleteByAccount(em, taiKhoanId);
      await this.sessions.deleteByAccount(em, taiKhoanId);
      if (!(await this.accounts.deleteUnverifiedPatient(em, taiKhoanId))) {
        // Đã khoá hàng và kiểm điều kiện mà câu DELETE vẫn không xoá được hàng nào: không thể xảy ra, nên coi là lỗi lập trình
        throw new Error(
          `Không xoá được tài khoản chưa xác minh ${taiKhoanId} dù đã khoá hàng và kiểm điều kiện`,
        );
      }
    } catch (error) {
      if (isForeignKeyError(error)) {
        this.logger.error(
          `Không xoá được tài khoản chưa xác minh ${taiKhoanId}: còn bảng khác tham chiếu tới nó (khoá ngoại); giao dịch của người gọi sẽ hoàn tác, không xoá gì`,
        );
      }
      throw error;
    }

    this.logger.log(
      `Đã xoá tài khoản Bệnh nhân chưa xác minh quá 24 giờ ${taiKhoanId} cùng mã xác thực và phiên của nó`,
    );
    return true;
  }
}
