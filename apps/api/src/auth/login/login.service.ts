import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { LOGIN_MAX_FAILURES } from '../auth.constants.js';
import type { LoaiTaiKhoan } from '../entities/enums.js';
import { currentSecond } from '../otp/otp-time.js';
import { OtpService } from '../otp/otp.service.js';
import { PasswordHasher } from '../password/password-hasher.service.js';
import { TaiKhoanRepository } from '../repositories/tai-khoan.repository.js';
import {
  SessionService,
  type IssuedSession,
} from '../session/session.service.js';
import {
  badCredentials,
  lockedException,
  refusalException,
  unverifiedException,
} from './login-errors.js';
import {
  loginRefusalFor,
  needsFailureReset,
  nextFailureState,
  unverifiedStatusFor,
  type LoginFacts,
  type LoginRefusal,
} from './login-rules.js';

export interface LoginInput {
  /** Đã chuẩn hoá bởi DTO (cắt khoảng trắng, tên miền chữ thường) */
  email: string;
  /** Mật khẩu rõ: chỉ sống đến khi so xong, không bao giờ được lưu, log hay đưa vào lỗi */
  matKhau: string;
}

/** Kết quả đăng nhập thành công. Controller chỉ chép `accessToken` và `vaiTro` vào thân; refresh token chỉ đi vào cookie. */
export interface LoginResult {
  vaiTro: LoaiTaiKhoan;
  session: IssuedSession;
}

// Kết quả của giao dịch đăng nhập. Giao dịch TRẢ kết quả, KHÔNG ném lỗi nghiệp vụ: ném bên trong thì lần đếm sai đã ghi bị ROLLBACK theo
// (bài học A2). Lỗi API chỉ được ném SAU khi giao dịch đã commit (xem `finish`).
type Outcome =
  | { kind: 'gone' } // tài khoản biến mất giữa lúc đọc và lúc khoá (job A7 vừa xoá)
  | { kind: 'password-changed' } // mật khẩu vừa đổi (đặt lại, xác minh đăng ký): mật khẩu đã so là của băm cũ
  | { kind: 'refused'; id: string; refusal: LoginRefusal }
  | {
      kind: 'wrong';
      id: string;
      failures: number;
      lockedUntil: Date | null;
      remainingSeconds: number;
    }
  | { kind: 'unverified'; id: string; account: LoginFacts; now: Date }
  | { kind: 'ok'; id: string; vaiTro: LoaiTaiKhoan; session: IssuedSession };

// Câu cố định ghi vào log cho từng lý do từ chối (không bao giờ ghi email hay mật khẩu)
const REFUSAL_LOG: Record<LoginRefusal['kind'], string> = {
  PENDING_ACTIVATION: 'tài khoản nhân sự chưa kích hoạt',
  SUSPENDED: 'tài khoản đã bị ngưng hoạt động',
  LOCKED: 'tài khoản đang bị khoá đăng nhập tạm thời',
};

/**
 * POST /auth/login (task A8; PLAN 5.3, quyết định A8-A…). Thứ tự (quy tắc 18 và 23): tìm theo email → trạng thái (ChoKichHoat, NgungHoatDong từ chối,
 * KHÔNG so mật khẩu, KHÔNG đếm) → khoá tạm → so mật khẩu → sai: đếm; đúng: bộ đếm về 0 rồi chưa xác minh thì KHÔNG phiên, đã xác minh thì tạo phiên.
 *
 * Hai pha:
 *  1. Đọc thường (không khoá, không giữ giao dịch) rồi so mật khẩu bằng Argon2id. Băm tốn ~20 ms CPU nên KHÔNG BAO GIỜ nằm trong giao dịch hay giữ
 *     kết nối DB. Email không có tài khoản thì so GIẢ cùng chi phí (H7, DN-06).
 *  2. Giao dịch ngắn READ COMMITTED: khoá MỘT hàng tai_khoan theo khoá chính, rồi CHẠY LẠI mọi kiểm tra bằng trạng thái mới nhất dưới khoá (trạng thái,
 *     khoá tạm, mật khẩu, cờ xác minh), vì pha 1 đọc không khoá: trong lúc băm, tài khoản có thể vừa bị khoá bởi lần sai thứ 5, bị admin ngưng, đổi mật
 *     khẩu hoặc được xác minh. Đúng mật khẩu mà thua cuộc đua với khoá hay ngưng thì KHÔNG được tạo phiên. Sau đó mới đếm sai / đặt về 0 / tạo phiên.
 *     Chỉ có MỘT khoá (hàng của chính tài khoản đó) rồi chèn một hàng phien_dang_nhap mới, thứ tự "tài khoản trước, hàng con sau" như A2 đến A6 và
 *     admin B18, nên hai tài khoản KHÁC nhau không thể chờ nhau vòng tròn; READ COMMITTED để không có khoá khoảng.
 * Lần đếm sai commit cùng giao dịch rồi mới ném lỗi (giao dịch trả `Outcome`, `finish` ném sau commit).
 *
 * Mọi mốc thời gian lấy từ MỘT đồng hồ (`currentSecond()` của OtpService, đã cắt giây); không dùng NOW() của DB. Không tự gửi thư (N2): chưa xác minh
 * thì chỉ trả trạng thái mã để FE đưa người dùng tới màn nhập/gửi lại mã của A6.
 */
@Injectable()
export class LoginService {
  private readonly logger = new Logger(LoginService.name);

  constructor(
    @Inject(DataSource) private readonly dataSource: DataSource,
    @Inject(TaiKhoanRepository) private readonly accounts: TaiKhoanRepository,
    @Inject(PasswordHasher) private readonly hasher: PasswordHasher,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(OtpService) private readonly otp: OtpService,
  ) {}

  async login(input: LoginInput): Promise<LoginResult> {
    const account = await this.accounts.findForLogin(
      this.dataSource.manager,
      input.email,
    );
    if (!account) {
      // Email không có tài khoản: so giả để thời gian phản hồi không cho biết email có trong hệ thống hay không; không đếm, không ghi gì
      await this.hasher.verifyDummy(input.matKhau);
      throw badCredentials();
    }

    const refusal = loginRefusalFor(account, currentSecond());
    if (refusal) throw this.refuse(account.taiKhoanId, refusal);

    // matKhauBam NULL chỉ có ở ChoKichHoat (đã từ chối ở trên; CHECK chk_tai_khoan_mat_khau): vẫn không đưa null vào hàm băm (H6)
    const matched =
      account.matKhauBam === null
        ? await this.hasher.verifyDummy(input.matKhau)
        : await this.hasher.verify(account.matKhauBam, input.matKhau);

    const outcome = await this.settle(account, matched);
    return this.finish(outcome);
  }

  private settle(
    read: { taiKhoanId: string; matKhauBam: string | null },
    matched: boolean,
  ): Promise<Outcome> {
    const id = read.taiKhoanId;
    return this.dataSource.transaction('READ COMMITTED', async (em) => {
      const locked = await this.accounts.findForLoginForUpdate(em, id);
      if (!locked) return { kind: 'gone' };
      const now = currentSecond();

      // Chạy lại kiểm tra trạng thái và khoá tạm bằng dữ liệu MỚI NHẤT dưới khoá, trước mọi quyết định đếm hay tạo phiên
      const refusal = loginRefusalFor(locked, now);
      if (refusal) return { kind: 'refused', id, refusal };
      // Mật khẩu đã đổi sau lúc đọc: kết quả so (đúng hay sai) là của băm cũ nên không dùng để đếm hay cho vào
      if (locked.matKhauBam !== read.matKhauBam) {
        return { kind: 'password-changed' };
      }

      if (!matched) {
        const next = nextFailureState(locked, now);
        if (!(await this.accounts.saveLoginFailure(em, id, next))) {
          throw new Error(
            `Không ghi được lần đăng nhập sai của tài khoản ${id} dù đã khoá và kiểm điều kiện`,
          );
        }
        return {
          kind: 'wrong',
          id,
          failures: next.failures,
          lockedUntil: next.lockedUntil,
          remainingSeconds:
            next.lockedUntil === null
              ? 0
              : Math.ceil((next.lockedUntil.getTime() - now.getTime()) / 1000),
        };
      }

      // Đúng mật khẩu: bộ đếm về 0 và bỏ khoá, kể cả khi chưa xác minh (DN-17)
      if (needsFailureReset(locked)) {
        await this.accounts.resetLoginFailures(em, id);
      }
      if (!locked.daXacMinhEmail) {
        return { kind: 'unverified', id, account: locked, now };
      }
      const session = await this.sessions.create(id, { manager: em });
      return { kind: 'ok', id, vaiTro: locked.loaiTaiKhoan, session };
    });
  }

  // Chạy SAU khi giao dịch đã commit: lúc này ném lỗi không còn làm mất lần đếm sai
  private async finish(outcome: Outcome): Promise<LoginResult> {
    switch (outcome.kind) {
      case 'gone':
      case 'password-changed':
        throw badCredentials();
      case 'refused':
        throw this.refuse(outcome.id, outcome.refusal);
      case 'wrong':
        this.logger.warn(
          `Tài khoản ${outcome.id} đăng nhập sai lần ${String(outcome.failures)}/${String(LOGIN_MAX_FAILURES)}`,
        );
        if (outcome.lockedUntil === null) throw badCredentials();
        this.logger.warn(
          `Tài khoản ${outcome.id} bị khoá đăng nhập tạm thời sau ${String(outcome.failures)} lần sai liên tiếp`,
        );
        throw lockedException(outcome.lockedUntil, outcome.remainingSeconds);
      case 'unverified': {
        if (outcome.account.loaiTaiKhoan !== 'BenhNhan') {
          // Nhân sự đang hoạt động mà chưa xác minh email: kích hoạt nhân sự phải đặt true (quy tắc 22) nên đây là dữ liệu hỏng. Đóng cửa và báo.
          this.logger.error(
            `Tài khoản ${outcome.id} đang hoạt động nhưng chưa xác minh email dù không phải Bệnh nhân: từ chối đăng nhập (dữ liệu không nhất quán)`,
          );
        } else {
          this.logger.log(
            `Tài khoản ${outcome.id} đăng nhập đúng mật khẩu nhưng chưa xác minh email: không tạo phiên`,
          );
        }
        const latest = await this.otp.latestStatus(outcome.id, 'DangKy');
        throw unverifiedException(
          unverifiedStatusFor(outcome.account, latest, outcome.now),
        );
      }
      case 'ok':
        this.logger.log(
          `Tài khoản ${outcome.id} đăng nhập, phiên ${outcome.session.sessionId}`,
        );
        return { vaiTro: outcome.vaiTro, session: outcome.session };
    }
  }

  // Từ chối có tài khoản: một dòng log với lý do cố định, rồi lỗi API tương ứng
  private refuse(id: string, refusal: LoginRefusal): Error {
    this.logger.warn(
      `Tài khoản ${id} bị từ chối đăng nhập: ${REFUSAL_LOG[refusal.kind]}`,
    );
    return refusalException(refusal);
  }
}
