import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import { toSecond } from '../../common/time/time.js';
import { SESSION_IDLE_MS, SESSION_MAX_MS } from '../auth.constants.js';
import type { LoaiTaiKhoan } from '../entities/enums.js';
import type { PhienDangNhap } from '../entities/phien-dang-nhap.entity.js';
import { PhienDangNhapRepository } from '../repositories/phien-dang-nhap.repository.js';
import { TokenService, sha256Hex } from './token.service.js';

export interface IssuedSession {
  sessionId: string;
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  // Hạn không hoạt động của phiên; dùng làm hạn của cookie refresh
  refreshTokenExpiresAt: Date;
}

// Lý do làm mới thất bại. Chỉ để ghi log và test; controller luôn trả cùng một mã 401, không để lộ lý do cho client.
export type RefreshFailureReason =
  | 'INVALID_TOKEN' // sai định dạng hoặc sai chữ ký: không tra DB, không thu hồi gì
  | 'SESSION_NOT_FOUND'
  | 'SESSION_REVOKED'
  | 'REUSE_DETECTED' // chữ ký đúng nhưng băm không khớp băm hiện tại: token cũ bị dùng lại ⇒ phiên bị thu hồi
  | 'ABSOLUTE_EXPIRED' // quá trần 8 giờ kể từ lúc đăng nhập
  | 'IDLE_EXPIRED' // quá 30 phút không làm mới
  | 'ACCOUNT_INACTIVE';

export type RefreshResult =
  | { ok: true; accountId: string; tokens: IssuedSession }
  | { ok: false; reason: RefreshFailureReason };

export interface ActiveSession {
  sessionId: string;
  accountId: string;
  role: LoaiTaiKhoan;
}

// Hàm ghi nhận `manager` để chạy trong giao dịch của người gọi; không truyền thì tự mở giao dịch riêng.
export interface WriteOptions {
  manager?: EntityManager;
}

// Mốc thời gian ghi DB được cắt xuống giây bằng `toSecond` (common/time): hạn chỉ có thể sớm hơn thật tối đa dưới 1 giây.
const earliest = (a: Date, b: Date): Date =>
  a.getTime() <= b.getTime() ? a : b;
const absoluteLimitOf = (createdAt: Date): Date =>
  new Date(createdAt.getTime() + SESSION_MAX_MS);

// So hai chuỗi băm hex bằng thời gian không đổi
function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

// Phiên đăng nhập (Q2, Q8): cấp, làm mới có xoay, thu hồi. Đây là hợp đồng với A4 (guard), A8–A13 (endpoint)
// và module admin (B18 thu hồi phiên khi khoá tài khoản). Thời gian lấy từ new Date(), test dùng đồng hồ giả.
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    @Inject(PhienDangNhapRepository)
    private readonly sessions: PhienDangNhapRepository,
    @Inject(TokenService) private readonly tokens: TokenService,
  ) {}

  // Đăng nhập thành công (A8): tạo phiên mới. tao_luc = bây giờ, hạn không hoạt động = bây giờ + 30 phút.
  create(
    accountId: string,
    options: WriteOptions = {},
  ): Promise<IssuedSession> {
    return this.sessions.inTransaction(options.manager, async (em) => {
      const now = toSecond(new Date());
      const idleExpiresAt = new Date(now.getTime() + SESSION_IDLE_MS);
      // Cần mã phiên (khoá chính tự tăng) để dựng refresh token, nên chèn hàng với băm tạm ngẫu nhiên (không ai giữ được
      // token tương ứng) rồi thay bằng băm thật trong cùng giao dịch.
      const sessionId = await this.sessions.insert(em, {
        accountId,
        refreshTokenHash: sha256Hex(randomBytes(32).toString('hex')),
        createdAt: now,
        idleExpiresAt,
      });
      const refresh = this.tokens.issueRefreshToken(sessionId);
      await this.sessions.setRefreshHash(em, sessionId, refresh.hash);
      return this.buildTokens(
        sessionId,
        accountId,
        now,
        refresh.token,
        idleExpiresAt,
      );
    });
  }

  // Làm mới có xoay (A9). Cả quá trình nằm trong MỘT giao dịch, khoá hàng phiên ngay từ đầu:
  //  - hai yêu cầu cùng token xếp hàng; yêu cầu thứ hai thấy băm đã đổi nên bị coi là "dùng lại" và phiên bị thu hồi (H12);
  //  - giao dịch của admin thu hồi phiên chờ hoặc được chờ, không để lọt token mới sau khi đã khoá tài khoản.
  // Thứ tự kiểm: không có → đã thu hồi → dùng lại → quá trần 8 giờ → quá hạn không hoạt động → tài khoản không còn DangHoatDong.
  // Hạn là nửa mở: đúng thời điểm hết hạn thì đã hết hạn (29:59 còn dùng được, 30:00 và 30:01 thì không).
  async refresh(rawRefreshToken: string): Promise<RefreshResult> {
    const parsed = this.tokens.readRefreshToken(rawRefreshToken);
    if (!parsed) return { ok: false, reason: 'INVALID_TOKEN' };

    return this.sessions.inTransaction(
      undefined,
      async (em): Promise<RefreshResult> => {
        const now = new Date();
        const session = await this.sessions.findByIdForUpdate(
          em,
          parsed.sessionId,
        );
        if (!session) return { ok: false, reason: 'SESSION_NOT_FOUND' };
        if (session.thuHoiLuc) return { ok: false, reason: 'SESSION_REVOKED' };

        if (!sameHash(session.refreshTokenBam, parsed.hash)) {
          // Token có chữ ký hợp lệ nhưng không phải token hiện tại của phiên: nghi bị đánh cắp hoặc phát lại
          await this.sessions.revokeIfActive(em, session.phienDangNhapId, now);
          this.logger.warn(
            `Phát hiện dùng lại refresh token của phiên ${session.phienDangNhapId}; phiên đã bị thu hồi`,
          );
          return { ok: false, reason: 'REUSE_DETECTED' };
        }

        const absoluteLimit = absoluteLimitOf(session.taoLuc);
        if (now.getTime() >= absoluteLimit.getTime())
          return { ok: false, reason: 'ABSOLUTE_EXPIRED' };
        if (now.getTime() >= session.hetHanLuc.getTime())
          return { ok: false, reason: 'IDLE_EXPIRED' };

        const status = await this.sessions.findAccountStatus(
          em,
          session.taiKhoanId,
        );
        if (status !== 'DangHoatDong')
          return { ok: false, reason: 'ACCOUNT_INACTIVE' };

        const rotated = await this.rotateLockedSession(em, session, now);
        const tokens = await this.buildTokens(
          session.phienDangNhapId,
          session.taiKhoanId,
          session.taoLuc,
          rotated.refreshToken,
          rotated.idleExpiresAt,
        );
        return { ok: true, accountId: session.taiKhoanId, tokens };
      },
    );
  }

  // ĐMK (A13): xoay refresh token của phiên HIỆN TẠI mà không cần client đưa token cũ. Trả null nếu phiên không còn dùng được.
  // Không kiểm hạn không hoạt động vì người dùng vừa gọi API bằng access token còn hạn; việc xoay chính là hoạt động mới.
  rotateRefreshToken(
    sessionId: string,
    options: WriteOptions = {},
  ): Promise<{ refreshToken: string; refreshTokenExpiresAt: Date } | null> {
    return this.sessions.inTransaction(options.manager, async (em) => {
      const now = new Date();
      const session = await this.sessions.findByIdForUpdate(em, sessionId);
      if (!session || session.thuHoiLuc) return null;
      if (now.getTime() >= absoluteLimitOf(session.taoLuc).getTime())
        return null;

      const rotated = await this.rotateLockedSession(em, session, now);
      return {
        refreshToken: rotated.refreshToken,
        refreshTokenExpiresAt: rotated.idleExpiresAt,
      };
    });
  }

  // Xoay refresh token tại chỗ cho một phiên ĐÃ khoá hàng: băm mới, hạn không hoạt động = min(bây giờ + 30 phút, tao_luc + 8 giờ).
  // Dùng chung cho làm mới (refresh) và đổi mật khẩu (rotateRefreshToken) để quy tắc kẹp theo trần 8 giờ chỉ nằm ở MỘT chỗ.
  private async rotateLockedSession(
    em: EntityManager,
    session: PhienDangNhap,
    now: Date,
  ): Promise<{ refreshToken: string; idleExpiresAt: Date }> {
    const refresh = this.tokens.issueRefreshToken(session.phienDangNhapId);
    const idleExpiresAt = earliest(
      toSecond(new Date(now.getTime() + SESSION_IDLE_MS)),
      absoluteLimitOf(session.taoLuc),
    );
    await this.sessions.rotate(
      em,
      session.phienDangNhapId,
      refresh.hash,
      idleExpiresAt,
    );
    return { refreshToken: refresh.token, idleExpiresAt };
  }

  // Guard của mỗi request (A4) gọi sau khi TokenService.verifyAccessToken đã xác nhận chữ ký:
  // phiên còn hiệu lực (chưa thu hồi, chưa quá trần 8 giờ) và tài khoản vẫn DangHoatDong. Không kiểm hạn không hoạt động (H14).
  async resolveActive(claims: {
    accountId: string;
    sessionId: string;
  }): Promise<ActiveSession | null> {
    const createdAfter = new Date(Date.now() - SESSION_MAX_MS);
    const role = await this.sessions.findActiveForAccess(
      undefined,
      claims.sessionId,
      claims.accountId,
      createdAfter,
    );
    return role
      ? { sessionId: claims.sessionId, accountId: claims.accountId, role }
      : null;
  }

  // Thu hồi một phiên (đăng xuất, A10). Idempotent: phiên đã thu hồi, đã hết hạn hay không tồn tại đều không lỗi và
  // không ghi đè mốc thu hồi cũ. Trả true nếu chính lần gọi này thu hồi phiên.
  revoke(sessionId: string, options: WriteOptions = {}): Promise<boolean> {
    return this.sessions.revokeIfActive(
      this.sessions.use(options.manager),
      sessionId,
      new Date(),
    );
  }

  // Đăng xuất khi chỉ còn cookie refresh (access token đã hết hạn). Chữ ký HMAC chứng minh token từng được server cấp cho
  // phiên đó, nên không cần băm khớp. Token sai định dạng hoặc sai chữ ký ⇒ false, không làm gì.
  async revokeByRefreshToken(rawRefreshToken: string): Promise<boolean> {
    const parsed = this.tokens.readRefreshToken(rawRefreshToken);
    return parsed ? this.revoke(parsed.sessionId) : false;
  }

  // Thu hồi mọi phiên chưa thu hồi của tài khoản (QMK: tất cả; ĐMK: trừ phiên hiện tại; admin khoá tài khoản: tất cả).
  // Truyền `manager` để việc thu hồi cùng giao dịch với thao tác gọi (Q29). Trả số phiên vừa bị thu hồi.
  revokeAll(
    accountId: string,
    options: WriteOptions & { exceptSessionId?: string } = {},
  ): Promise<number> {
    return this.sessions.revokeAllActive(
      this.sessions.use(options.manager),
      accountId,
      new Date(),
      options.exceptSessionId,
    );
  }

  // Access token không bao giờ sống quá trần 8 giờ của phiên (H14)
  private async buildTokens(
    sessionId: string,
    accountId: string,
    createdAt: Date,
    refreshToken: string,
    idleExpiresAt: Date,
  ): Promise<IssuedSession> {
    const access = await this.tokens.signAccessToken({
      accountId,
      sessionId,
      notAfter: absoluteLimitOf(createdAt),
    });
    return {
      sessionId,
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken,
      refreshTokenExpiresAt: idleExpiresAt,
    };
  }
}
