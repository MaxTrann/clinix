import type { AddressInfo } from 'node:net';
import { io, type Socket as ClientSocket } from 'socket.io-client';
import { TEST_AUTH_ENV } from './../src/auth/testing/auth-test-env.js';
import {
  openRefreshHarness,
  type RefreshHarness,
} from './../src/auth/testing/refresh-http-helpers.js';
import { TokenService } from './../src/auth/session/token.service.js';
import { ChatConnectionRegistry } from './../src/chat/realtime/chat-connection.registry.js';
import {
  buildChatWorld,
  type ChatWorld,
} from './../src/chat/testing/chat-world.js';
import { resetTables } from './../src/database/testing/test-database.js';
import { captureProcessOutput } from './../src/patient/testing/relatives-update-helpers.js';

// chat P4 — bắt tay WebSocket THẬT (AppModule + IoAdapter + MySQL thật; client socket.io-client chỉ `websocket`; PLAN chat 5.7, 7.8):
// SOC-01, SOC-02, SOC-03, SOC-04, SOC-11. Bắt tay qua nginx và Vite (SOC-16) chạy tay, ghi ở TRACKING. Không giả đồng hồ: hẹn ngắt khi hết hạn dùng giờ thật.
let h: RefreshHarness;
let w: ChatWorld;
let url: string;
const ORIGIN = TEST_AUTH_ENV.WEB_ORIGIN;
const opened: ClientSocket[] = [];

beforeAll(async () => {
  h = await openRefreshHarness();
  const { port } = h.app.getHttpServer().address() as AddressInfo;
  url = `http://127.0.0.1:${port}`;
});
beforeEach(async () => {
  await resetTables(h.db);
  w = await buildChatWorld(h.db);
});
afterEach(() => {
  for (const s of opened.splice(0)) s.disconnect();
  vi.restoreAllMocks();
});
afterAll(async () => {
  await h.close();
});

interface ConnectOptions {
  token?: unknown;
  origin?: string | null;
  query?: Record<string, string>;
}
function client({
  token,
  origin = ORIGIN,
  query,
}: ConnectOptions): ClientSocket {
  const socket = io(url, {
    path: '/socket.io',
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
    ...(token === undefined ? {} : { auth: { token } }),
    ...(query ? { query } : {}),
    extraHeaders: origin === null ? {} : { Origin: origin },
  });
  opened.push(socket);
  return socket;
}
/** Chờ kết quả bắt tay: `connected` hoặc mã từ chối (`err.message`, `err.data.maLoi` phải trùng). */
function outcome(socket: ClientSocket): Promise<string> {
  return new Promise((resolve) => {
    socket.once('connect', () => resolve('connected'));
    socket.once(
      'connect_error',
      (err: Error & { data?: { maLoi?: string } }) => {
        expect(err.data?.maLoi).toBe(err.message);
        resolve(err.message);
      },
    );
  });
}
const connect = (options: ConnectOptions) => outcome(client(options));
const tokenOf = async (accountId: string) =>
  (await h.sessions.create(accountId)).accessToken;

describe('chat P4 — bắt tay WebSocket', () => {
  it('SOC-01: token đúng của Bệnh nhân, Bác sĩ, Lễ tân ⇒ nối được', async () => {
    for (const actor of [w.patientA, w.doctorA, w.receptionistA])
      expect(await connect({ token: await tokenOf(actor.taiKhoanId) })).toBe(
        'connected',
      );
  });

  it('SOC-01: thiếu token; token sai; token hết hạn; phiên đã thu hồi; Quản trị viên ⇒ từ chối kèm mã', async () => {
    expect(await connect({})).toBe('CHUA_DANG_NHAP');
    expect(await connect({ token: 'khong.phai.jwt' })).toBe(
      'TOKEN_KHONG_HOP_LE',
    );

    const session = await h.sessions.create(w.patientA.taiKhoanId);
    const expired = await h.app.get(TokenService).signAccessToken({
      accountId: w.patientA.taiKhoanId,
      sessionId: session.sessionId,
      notAfter: new Date(Date.now() - 60_000),
    });
    expect(await connect({ token: expired.token })).toBe('TOKEN_KHONG_HOP_LE');

    await h.sessions.revoke(session.sessionId);
    expect(await connect({ token: session.accessToken })).toBe(
      'PHIEN_HET_HIEU_LUC',
    );
    for (const admin of [w.accounts.sysAdmin, w.accounts.adminA])
      expect(
        await connect({ token: await tokenOf(admin.account.taiKhoanId) }),
      ).toBe('KHONG_DU_QUYEN');
  });

  it('SOC-02: token chỉ đặt ở query (URL) ⇒ bị bỏ qua, từ chối CHUA_DANG_NHAP; log không chứa token', async () => {
    const token = await tokenOf(w.patientA.taiKhoanId);
    const logs = captureProcessOutput();
    expect(await connect({ query: { token } })).toBe('CHUA_DANG_NHAP');
    expect(await connect({ query: { auth: token, access_token: token } })).toBe(
      'CHUA_DANG_NHAP',
    );
    vi.restoreAllMocks();
    expect(logs.join('')).not.toContain(token);
  });

  it('SOC-03: Origin sai hay vắng ⇒ CHAT_NGUON_KHONG_HOP_LE dù token đúng', async () => {
    const token = await tokenOf(w.patientA.taiKhoanId);
    expect(await connect({ token, origin: 'https://evil.example' })).toBe(
      'CHAT_NGUON_KHONG_HOP_LE',
    );
    expect(await connect({ token, origin: null })).toBe(
      'CHAT_NGUON_KHONG_HOP_LE',
    );
  });

  it('SOC-04: kết nối thứ sáu cùng tài khoản ⇒ CHAT_QUA_NHIEU_KET_NOI (kể cả sáu lần bắt tay đồng thời: đúng 5 nối); đóng một cái thì nối lại được', async () => {
    const token = await tokenOf(w.patientA.taiKhoanId);
    const sockets = Array.from({ length: 6 }, () => client({ token }));
    const results = await Promise.all(sockets.map(outcome));
    expect(results.filter((r) => r === 'connected')).toHaveLength(5);
    expect(results.filter((r) => r === 'CHAT_QUA_NHIEU_KET_NOI')).toHaveLength(
      1,
    );
    const registry = h.app.get(ChatConnectionRegistry);
    expect(registry.count(w.patientA.taiKhoanId)).toBe(5);
    // Tài khoản khác vẫn nối được
    expect(await connect({ token: await tokenOf(w.patientB.taiKhoanId) })).toBe(
      'connected',
    );
    const first = sockets[results.indexOf('connected')]!;
    first.disconnect();
    await vi.waitFor(() =>
      expect(registry.count(w.patientA.taiKhoanId)).toBe(4),
    );
    expect(await connect({ token })).toBe('connected');
  });

  it('SOC-11: token hết hạn khi đang nối ⇒ máy chủ ngắt (lý do "io server disconnect"), sổ kết nối nhả chỗ', async () => {
    const session = await h.sessions.create(w.doctorA.taiKhoanId);
    // Token còn ~2 giây (exp làm tròn xuống giây)
    const short = await h.app.get(TokenService).signAccessToken({
      accountId: w.doctorA.taiKhoanId,
      sessionId: session.sessionId,
      notAfter: new Date(Date.now() + 2_500),
    });
    const socket = client({ token: short.token });
    expect(await outcome(socket)).toBe('connected');
    const reason = await new Promise<string>((resolve) =>
      socket.once('disconnect', resolve),
    );
    expect(reason).toBe('io server disconnect');
    const registry = h.app.get(ChatConnectionRegistry);
    await vi.waitFor(() =>
      expect(registry.count(w.doctorA.taiKhoanId)).toBe(0),
    );
  }, 15_000);

  it('REST không đổi khi có gateway: GET /health vẫn 200 trên cùng cổng', async () => {
    const res = await fetch(`${url}/health`);
    expect(res.status).toBe(200);
  });
});
