import { SignJWT } from 'jose';
import type { ActiveSession } from '../../auth/session/session.service.js';
import type { AccessTokenClaims } from '../../auth/session/token.service.js';
import type { Socket } from 'socket.io';
import { ChatConnectionRegistry } from './chat-connection.registry.js';
import {
  authenticateHandshake,
  type HandshakeLike,
  type SocketAuthDeps,
} from './chat-socket-auth.js';

// chat P4 — SOC-01, SOC-03, SOC-04 phần logic (PLAN chat 7.8): xác thực bắt tay với phụ thuộc giả. Bắt tay qua socket.io thật (gồm SOC-02, SOC-11) ở
// test/chat-socket.e2e-spec.ts.

const ORIGIN = 'http://localhost:5173';
const EXP = 1_900_000_000;
const CLAIMS: AccessTokenClaims = { accountId: '7', sessionId: '70' };
// Token có `exp` thật (chữ ký không quan trọng: verifyAccessToken giả)
const token = await new SignJWT({ sid: '70' })
  .setProtectedHeader({ alg: 'HS256' })
  .setSubject('7')
  .setExpirationTime(EXP)
  .sign(new TextEncoder().encode('k'.repeat(32)));

function deps(
  over: Partial<SocketAuthDeps> & { role?: ActiveSession['role'] } = {},
) {
  const calls: string[] = [];
  const d: SocketAuthDeps = {
    webOrigin: ORIGIN,
    verifyAccessToken: (t) => {
      calls.push('verify');
      return Promise.resolve(t === token ? CLAIMS : null);
    },
    resolveActive: (c) => {
      calls.push('session');
      return Promise.resolve({
        accountId: c.accountId,
        sessionId: c.sessionId,
        role: over.role ?? 'BenhNhan',
      });
    },
    ...over,
  };
  return { d, calls };
}
const hs = (over: Partial<HandshakeLike> = {}): HandshakeLike => ({
  headers: { origin: ORIGIN },
  auth: { token },
  ...over,
});

describe('chat P4 — xác thực bắt tay WebSocket', () => {
  it.each(['BenhNhan', 'BacSi', 'LeTan'] as const)(
    'SOC-01: token đúng, phiên còn, vai trò %s ⇒ nhận; người dùng lấy từ phiên, hạn lấy từ exp',
    async (role) => {
      const { d } = deps({ role });
      expect(await authenticateHandshake(hs(), d)).toEqual({
        ok: true,
        user: {
          accountId: '7',
          sessionId: '70',
          role,
          expiresAt: new Date(EXP * 1000),
        },
      });
    },
  );

  it.each([
    ['thiếu auth.token', { auth: {} }, 'CHUA_DANG_NHAP'],
    ['token rỗng', { auth: { token: '' } }, 'CHUA_DANG_NHAP'],
    ['token không phải chuỗi', { auth: { token: 42 } }, 'CHUA_DANG_NHAP'],
    [
      'token sai (chữ ký, hết hạn…)',
      { auth: { token: 'x.y.z' } },
      'TOKEN_KHONG_HOP_LE',
    ],
  ])('SOC-01: %s ⇒ từ chối %s', async (_case, over, maLoi) => {
    expect(await authenticateHandshake(hs(over), deps().d)).toEqual({
      ok: false,
      maLoi,
    });
  });

  it('SOC-01: phiên đã thu hồi hay tài khoản bị khoá ⇒ PHIEN_HET_HIEU_LUC; Quản trị viên ⇒ KHONG_DU_QUYEN', async () => {
    const revoked = deps({ resolveActive: () => Promise.resolve(null) }).d;
    expect(await authenticateHandshake(hs(), revoked)).toEqual({
      ok: false,
      maLoi: 'PHIEN_HET_HIEU_LUC',
    });
    expect(
      await authenticateHandshake(hs(), deps({ role: 'QuanTriVien' }).d),
    ).toEqual({ ok: false, maLoi: 'KHONG_DU_QUYEN' });
  });

  it.each([
    ['Origin sai', { origin: 'https://evil.example' }],
    ['Origin vắng', {}],
    ['Origin gần đúng (có / cuối)', { origin: `${ORIGIN}/` }],
  ])(
    'SOC-03: %s ⇒ CHAT_NGUON_KHONG_HOP_LE, kiểm TRƯỚC token (không chạm DB)',
    async (_case, headers) => {
      const { d, calls } = deps();
      expect(await authenticateHandshake(hs({ headers }), d)).toEqual({
        ok: false,
        maLoi: 'CHAT_NGUON_KHONG_HOP_LE',
      });
      expect(calls).toEqual([]);
    },
  );
});

describe('chat P4 — sổ kết nối (SOC-04)', () => {
  const sock = () => ({}) as Socket;

  it('SOC-04: tối đa 5 kết nối mỗi tài khoản; kết nối thứ sáu bị từ chối; đóng một cái thì có chỗ lại; tài khoản khác không bị ảnh hưởng', () => {
    const registry = new ChatConnectionRegistry();
    const five = Array.from({ length: 5 }, sock);
    for (const s of five) expect(registry.tryAdd('7', s, 5)).toBe(true);
    expect(registry.tryAdd('7', sock(), 5)).toBe(false);
    expect(registry.count('7')).toBe(5);
    expect(registry.tryAdd('8', sock(), 5)).toBe(true);
    registry.remove('7', five[0]!);
    expect(registry.tryAdd('7', sock(), 5)).toBe(true);
    expect(registry.socketsOf('7')).toHaveLength(5);
    for (const s of registry.socketsOf('8')) registry.remove('8', s);
    expect(registry.count('8')).toBe(0);
  });
});
