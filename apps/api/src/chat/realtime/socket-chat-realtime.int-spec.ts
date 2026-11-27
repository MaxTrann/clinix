import type { ConfigService } from '@nestjs/config';
import type { Socket } from 'socket.io';
import type { DataSource, EntityManager } from 'typeorm';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import type { SessionService } from '../../auth/session/session.service.js';
import type { ChatActor } from '../core/chat-access.policy.js';
import { ChatInternalError } from '../core/send-message.service.js';
import { ConversationReadRepository } from '../read/conversation-read.repository.js';
import {
  buildChatWorld,
  buildSendService,
  newSendId,
  type ChatWorld,
} from '../testing/chat-world.js';
import { ChatConnectionRegistry } from './chat-connection.registry.js';
import { ChatRecipientsRepository } from './chat-recipients.repository.js';
import { ChatSocketSessions } from './chat-socket-sessions.js';
import { SocketChatRealtime } from './socket-chat-realtime.js';

// chat B5 — cổng đẩy thật trên MySQL thật, socket GIẢ (PLAN chat 5.7, 7.8): SOC-12 (giao dịch hoàn tác ⇒ không đẩy; đẩy thấy tin đã commit; đột biến 20),
// SOC-09 (kiểm phiên TỪNG kết nối trước khi đẩy; đột biến 18), BCH-01 (log khi kiểm phiên lỗi), EXPLAIN cho hai câu đọc mới. Ca socket thật ở test/chat-socket-send.e2e-spec.ts.
let db: DataSource;
let logs: string[];
let w: ChatWorld;
useIntegrationHooks((d, l) => {
  db = d;
  logs = l;
});

interface FakeSocket {
  socket: Socket;
  /** Mỗi lần đẩy: tên sự kiện, id tin, và tin đó đã thấy được từ kết nối KHÁC chưa (đã commit). */
  emitted: { event: string; tinNhanId: string; committed: Promise<boolean> }[];
  disconnects: number;
}

let registry: ChatConnectionRegistry;
let revoked: Set<string>;
let failingSessions: Set<string>;

const committed = async (tinNhanId: string) =>
  (
    (await db.query(
      'SELECT COUNT(*) AS n FROM tin_nhan WHERE tin_nhan_id = ?',
      [tinNhanId],
    )) as { n: string }[]
  )[0]?.n === '1';

function connect(
  actor: ChatActor,
  sessionId = `s-${actor.taiKhoanId}`,
): FakeSocket {
  const fake: FakeSocket = {
    socket: undefined as unknown as Socket,
    emitted: [],
    disconnects: 0,
  };
  fake.socket = {
    data: {
      user: {
        accountId: actor.taiKhoanId,
        sessionId,
        role: actor.vaiTro,
        expiresAt: new Date(Date.now() + 60_000),
      },
    },
    emit: (event: string, body: { tinNhan: { id: string } }) => {
      fake.emitted.push({
        event,
        tinNhanId: body.tinNhan.id,
        committed: committed(body.tinNhan.id),
      });
      return true;
    },
    disconnect: () => {
      fake.disconnects += 1;
      registry.remove(actor.taiKhoanId, fake.socket);
      return fake.socket;
    },
  } as unknown as Socket;
  registry.tryAdd(actor.taiKhoanId, fake.socket, 5);
  return fake;
}

function build(notifier?: { notify: () => Promise<void> }) {
  const sessions = {
    resolveActive: ({
      accountId,
      sessionId,
    }: {
      accountId: string;
      sessionId: string;
    }) => {
      if (failingSessions.has(sessionId))
        return Promise.reject(new TypeError('DB mất kết nối 0901234567'));
      if (revoked.has(sessionId)) return Promise.resolve(null);
      const role = registry
        .socketsOf(accountId)
        .map((s) => (s.data as { user: { role: string } }).user.role)[0];
      return Promise.resolve({ sessionId, accountId, role });
    },
  } as unknown as SessionService;
  const socketSessions = new ChatSocketSessions(sessions, registry, {
    get: () => 'test',
  } as unknown as ConfigService);
  const realtime = new SocketChatRealtime(
    db,
    new ConversationReadRepository(),
    new ChatRecipientsRepository(),
    registry,
    socketSessions,
  );
  return buildSendService(db, notifier ? { realtime, notifier } : { realtime });
}

const send = (
  core: ReturnType<typeof build>,
  actor: ChatActor,
  target: { hoiThoaiId: string } | { bacSiId: string } | { chiNhanhId: string },
  noiDung = 'Tin thử',
) => core.send({ actor, target, noiDung, maGui: newSendId() });

beforeEach(async () => {
  w = await buildChatWorld(db);
  registry = new ChatConnectionRegistry();
  revoked = new Set();
  failingSessions = new Set();
});

describe('chat B5 — cổng đẩy thật (SocketChatRealtime)', () => {
  it('SOC-12: giao dịch bị hoàn tác (cổng thông báo ném, luồng mở và hội thoại đã có) ⇒ không đẩy gì tới ai', async () => {
    const patient = connect(w.patientA);
    const doctor = connect(w.doctorA);
    const reception = connect(w.receptionistA);
    const core = build();
    const opened = await send(core, w.patientA, {
      bacSiId: w.doctorA.taiKhoanId,
    });
    if (opened.kind !== 'Sent') throw new Error(opened.kind);
    expect(patient.emitted).toHaveLength(1);
    expect(doctor.emitted).toHaveLength(1);

    const broken = build({
      notify: () => Promise.reject(new Error('ghi thông báo lỗi')),
    });
    await expect(
      send(broken, w.doctorA, { hoiThoaiId: opened.tinNhan.hoiThoaiId }),
    ).rejects.toThrow(ChatInternalError);
    await expect(
      send(broken, w.patientA, { chiNhanhId: w.branchA }),
    ).rejects.toThrow(ChatInternalError);
    expect(patient.emitted).toHaveLength(1);
    expect(doctor.emitted).toHaveLength(1);
    expect(reception.emitted).toEqual([]);
  });

  it('SOC-12: mỗi lần đẩy xảy ra SAU commit (tin đã thấy được từ kết nối khác lúc đẩy); bị từ chối hay gửi trùng mã thì không đẩy', async () => {
    const patient = connect(w.patientA);
    const reception = connect(w.receptionistA);
    const core = build();
    const first = await send(core, w.patientA, { chiNhanhId: w.branchA });
    if (first.kind !== 'Sent') throw new Error(first.kind);
    const reply = await send(core, w.receptionistA, {
      hoiThoaiId: first.tinNhan.hoiThoaiId,
    });
    expect(reply.kind).toBe('Sent');
    // Từ chối (rỗng, không thấy) ⇒ không đẩy
    expect(
      (await send(core, w.patientA, { chiNhanhId: w.branchA }, ' ')).kind,
    ).toBe('Invalid');
    expect(
      (await send(core, w.patientB, { hoiThoaiId: first.tinNhan.hoiThoaiId }))
        .kind,
    ).toBe('NotFound');
    for (const fake of [patient, reception]) {
      expect(fake.emitted.map((e) => e.event)).toEqual([
        'chat:tin-moi',
        'chat:tin-moi',
      ]);
      expect(await Promise.all(fake.emitted.map((e) => e.committed))).toEqual([
        true,
        true,
      ]);
    }
  });

  it('SOC-09: trước khi đẩy kiểm phiên TỪNG kết nối: phiên bị thu hồi ⇒ ngắt, không đẩy; tab của phiên khác cùng tài khoản vẫn nhận', async () => {
    const patient = connect(w.patientA);
    const revokedTab = connect(w.doctorA, 's-cu');
    const liveTab = connect(w.doctorA, 's-moi');
    revoked.add('s-cu');
    const core = build();
    expect(
      (await send(core, w.patientA, { bacSiId: w.doctorA.taiKhoanId })).kind,
    ).toBe('Sent');
    expect(revokedTab.emitted).toEqual([]);
    expect(revokedTab.disconnects).toBe(1);
    expect(liveTab.emitted).toHaveLength(1);
    expect(patient.emitted).toHaveLength(1);
    expect(registry.count(w.doctorA.taiKhoanId)).toBe(1);
  });

  it('SOC-09, BCH-01: kiểm phiên của một kết nối lỗi (DB) ⇒ đóng mặc định với kết nối đó (không đẩy, không ngắt), các kết nối khác vẫn nhận; log chỉ id và tên lớp lỗi', async () => {
    const patient = connect(w.patientA);
    const broken = connect(w.doctorA, 's-loi');
    failingSessions.add('s-loi');
    const core = build();
    const secret = 'Nội dung riêng a@b.vn';
    expect(
      (await send(core, w.patientA, { bacSiId: w.doctorA.taiKhoanId }, secret))
        .kind,
    ).toBe('Sent');
    expect(broken.emitted).toEqual([]);
    expect(broken.disconnects).toBe(0);
    expect(patient.emitted).toHaveLength(1);
    const out = logs.join('');
    expect(out).toContain('Kiểm phiên trước khi đẩy lỗi');
    expect(out).toContain('TypeError');
    for (const leaked of [secret, 'a@b.vn', '0901234567'])
      expect(out).not.toContain(leaked);
  });

  it('SOC-07 (âm): người trong hội thoại không ai đang nối ⇒ gửi vẫn thành công; Lễ tân chi nhánh khác đang nối không nhận', async () => {
    const other = connect(w.receptionistB);
    const core = build();
    expect((await send(core, w.patientA, { chiNhanhId: w.branchA })).kind).toBe(
      'Sent',
    );
    expect(other.emitted).toEqual([]);
  });

  it('Quét phiên: ngắt đúng các kết nối có phiên hết, trả số đã ngắt; lỗi kiểm của một kết nối không làm hỏng lượt quét', async () => {
    connect(w.patientA);
    const gone = connect(w.doctorA, 's-het');
    const flaky = connect(w.receptionistA, 's-chap-chon');
    revoked.add('s-het');
    failingSessions.add('s-chap-chon');
    const sessions = new ChatSocketSessions(
      {
        resolveActive: ({
          sessionId,
          accountId,
        }: {
          sessionId: string;
          accountId: string;
        }) =>
          failingSessions.has(sessionId)
            ? Promise.reject(new Error('x'))
            : Promise.resolve(
                revoked.has(sessionId)
                  ? null
                  : { sessionId, accountId, role: 'BenhNhan' },
              ),
      } as unknown as SessionService,
      registry,
      { get: () => 'test' } as unknown as ConfigService,
    );
    expect(await sessions.sweep()).toBe(1);
    expect(gone.disconnects).toBe(1);
    expect(flaky.disconnects).toBe(0);
    expect(registry.count(w.patientA.taiKhoanId)).toBe(1);
  });
});

describe('chat B5 — EXPLAIN hai câu đọc mới của việc đẩy', () => {
  interface ExplainRow {
    table: string | null;
    type: string | null;
    key: string | null;
  }
  it('Lễ tân đang hoạt động của chi nhánh: `le_tan` theo chỉ mục `chi_nhanh_id` (ref), `tai_khoan` theo khoá chính (eq_ref); tên chi nhánh theo khoá chính', async () => {
    const recorded: { sql: string; params: unknown[] }[] = [];
    const em = {
      query: (sql: string, params: unknown[] = []) => {
        recorded.push({ sql, params });
        return db.query(sql, params);
      },
    } as unknown as EntityManager;
    const repo = new ChatRecipientsRepository();
    expect(await repo.activeReceptionists(em, w.branchA)).toEqual([
      w.receptionistA.taiKhoanId,
    ]);
    expect(await repo.branchName(em, w.branchB)).toEqual(expect.any(String));
    expect(await repo.branchName(em, '999999')).toBeNull();
    const [receptionists, branch] = await Promise.all(
      recorded
        .slice(0, 2)
        .map(
          async ({ sql, params }) =>
            (await db.query(`EXPLAIN ${sql}`, params)) as ExplainRow[],
        ),
    );
    const byTable = new Map(receptionists!.map((r) => [r.table, r]));
    expect(byTable.get('lt')).toMatchObject({ type: 'ref' });
    expect(byTable.get('lt')?.key).not.toBeNull();
    expect(byTable.get('tk')).toMatchObject({ type: 'eq_ref', key: 'PRIMARY' });
    expect(branch![0]).toMatchObject({ type: 'const', key: 'PRIMARY' });
  });
});
