import { decodeJwt } from 'jose';
import type { ActiveSession } from '../../auth/session/session.service.js';
import type { AccessTokenClaims } from '../../auth/session/token.service.js';
import {
  CHAT_SOCKET_ERRORS,
  CHAT_SOCKET_ROLES,
  type ChatSocketError,
  type ChatSocketRole,
} from './chat-socket.constants.js';

// Xác thực lúc bắt tay WebSocket (chat P4; PLAN chat 5.7, R2). Guard HTTP (`JwtAuthGuard` đọc header Authorization) không áp cho bắt tay socket, nên kiểm ở đây,
// DÙNG LẠI đúng hai bước của guard: chữ ký token (`TokenService.verifyAccessToken`) và phiên còn hiệu lực (`SessionService.resolveActive`). Không sửa mã auth.
// Thứ tự: Origin (không chạm DB) → token có không → chữ ký → phiên → vai trò. Số kết nối mỗi tài khoản do sổ kết nối kiểm (cần trạng thái trong bộ nhớ).

/** Phần của gói bắt tay socket.io mà phép kiểm cần (dạng con của `Handshake`). */
export interface HandshakeLike {
  headers: Record<string, string | string[] | undefined>;
  /** Gói xác thực của giao thức: `io(url, { auth: { token } })`. KHÔNG đọc `query` (token trên URL lọt vào log proxy, lịch sử; SOC-02). */
  auth: Record<string, unknown>;
}

export interface SocketAuthDeps {
  webOrigin: string;
  verifyAccessToken(token: string): Promise<AccessTokenClaims | null>;
  resolveActive(claims: AccessTokenClaims): Promise<ActiveSession | null>;
}

export interface SocketUser {
  accountId: string;
  sessionId: string;
  role: ChatSocketRole;
  /** Lúc access token hết hạn: máy chủ ngắt kết nối đúng lúc đó (SOC-11). */
  expiresAt: Date;
}

export type SocketAuthResult =
  { ok: true; user: SocketUser } | { ok: false; maLoi: ChatSocketError };

const isChatRole = (role: string): role is ChatSocketRole =>
  (CHAT_SOCKET_ROLES as readonly string[]).includes(role);

export async function authenticateHandshake(
  handshake: HandshakeLike,
  deps: SocketAuthDeps,
): Promise<SocketAuthResult> {
  // Trình duyệt luôn gửi Origin khi mở WebSocket; thiếu hay khác WEB_ORIGIN ⇒ trang lạ (chống chiếm kết nối từ site khác) hay công cụ ngoài
  if (handshake.headers.origin !== deps.webOrigin)
    return { ok: false, maLoi: CHAT_SOCKET_ERRORS.BAD_ORIGIN };
  const token = handshake.auth.token;
  if (typeof token !== 'string' || token === '')
    return { ok: false, maLoi: CHAT_SOCKET_ERRORS.NOT_LOGGED_IN };
  const claims = await deps.verifyAccessToken(token);
  if (claims === null)
    return { ok: false, maLoi: CHAT_SOCKET_ERRORS.INVALID_TOKEN };
  const active = await deps.resolveActive(claims);
  if (active === null)
    return { ok: false, maLoi: CHAT_SOCKET_ERRORS.SESSION_INACTIVE };
  if (!isChatRole(active.role))
    return { ok: false, maLoi: CHAT_SOCKET_ERRORS.FORBIDDEN };
  // Chữ ký đã được kiểm ở trên nên đọc `exp` trực tiếp là an toàn (verifyAccessToken bắt buộc có `exp`)
  const { exp } = decodeJwt(token);
  if (typeof exp !== 'number')
    return { ok: false, maLoi: CHAT_SOCKET_ERRORS.INVALID_TOKEN };
  return {
    ok: true,
    user: {
      accountId: active.accountId,
      sessionId: active.sessionId,
      role: active.role,
      expiresAt: new Date(exp * 1000),
    },
  };
}
