import type { AddressInfo } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import request from 'supertest';
import { io, type Socket as ClientSocket } from 'socket.io-client';
import { TEST_AUTH_ENV } from './../src/auth/testing/auth-test-env.js';
import {
  openRefreshHarness,
  type RefreshHarness,
} from './../src/auth/testing/refresh-http-helpers.js';
import type { ChatActor } from './../src/chat/core/chat-access.policy.js';
import { ChatConnectionRegistry } from './../src/chat/realtime/chat-connection.registry.js';
import { ChatSocketSessions } from './../src/chat/realtime/chat-socket-sessions.js';
import { ChatSendService } from './../src/chat/rest/chat-send.service.js';
import {
  buildChatWorld,
  newSendId,
  type ChatWorld,
} from './../src/chat/testing/chat-world.js';
import { resetTables } from './../src/database/testing/test-database.js';
import { captureProcessOutput } from './../src/patient/testing/relatives-update-helpers.js';

// chat B5 — gửi và nhận tin tức thời qua WebSocket THẬT (AppModule + IoAdapter + MySQL thật; client socket.io-client chỉ `websocket`; PLAN chat 5.7, 7.8):
// SOC-05, SOC-06, SOC-07, SOC-08, SOC-09, SOC-10, SOC-13, SOC-14, SOC-15, QCH-02 (socket), BCH-01 (lỗi socket). SOC-12 (hoàn tác ⇒ không đẩy) ở
// chat/realtime/socket-chat-realtime.int-spec.ts. Không giả đồng hồ (token và phiên theo giờ thật). Đẩy chạy TRƯỚC khi lõi trả kết quả, nên khi ack về thì máy chủ
// đã ghi xong mọi gói đẩy; ca "không nhận" đợi người nhận đúng nhận xong rồi chờ thêm một quãng ngắn.
let h: RefreshHarness;
let w: ChatWorld;
let url: string;
const ORIGIN = TEST_AUTH_ENV.WEB_ORIGIN;
const opened: ClientSocket[] = [];
const QUIET_MS = 200;

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

interface Push {
  hoiThoaiId: string;
  tinNhan: {
    id: string;
    laCuaToi: boolean;
    nguoiGui: { vaiTro: string; tenHienThi: string };
    noiDung: string;
    maGui: string | null;
  };
}
type Ack =
  | ({ ok: true } & Push)
  | { ok: false; maLoi: string; loi?: { truong: string; ma: string }[] };

interface Tab {
  socket: ClientSocket;
  sessionId: string;
  token: string;
  pushes: Push[];
}

/** Mở một tab (một phiên mới, hay phiên `sessionOf` đã có) và đợi nối xong. */
async function openTab(
  actor: ChatActor | string,
  sessionOf?: Tab,
): Promise<Tab> {
  const accountId = typeof actor === 'string' ? actor : actor.taiKhoanId;
  const { sessionId, token } =
    sessionOf ??
    (await h.sessions.create(accountId).then((s) => ({
      sessionId: s.sessionId,
      token: s.accessToken,
    })));
  const socket = io(url, {
    path: '/socket.io',
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
    auth: { token },
    extraHeaders: { Origin: ORIGIN },
  });
  opened.push(socket);
  const pushes: Push[] = [];
  socket.on('chat:tin-moi', (p: Push) => pushes.push(p));
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
  });
  return { socket, sessionId, token, pushes };
}

const send = (tab: Tab, payload: unknown): Promise<Ack> =>
  tab.socket.timeout(5_000).emitWithAck('chat:gui', payload) as Promise<Ack>;
const text = (noiDung = 'Tin thử qua socket') => ({
  noiDung,
  maGui: newSendId(),
});
const count = async (sql: string, params: unknown[] = []) =>
  Number(((await h.db.query(sql, params)) as { n: string }[])[0]?.n ?? 0);
const messageCount = () => count('SELECT COUNT(*) AS n FROM tin_nhan');
const nameOf = async (accountId: string) =>
  (
    (await h.db.query('SELECT ho_ten FROM tai_khoan WHERE tai_khoan_id = ?', [
      accountId,
    ])) as { ho_ten: string }[]
  )[0]!.ho_ten;
const branchNameOf = async (chiNhanhId: string) =>
  (
    (await h.db.query('SELECT ten FROM chi_nhanh WHERE chi_nhanh_id = ?', [
      chiNhanhId,
    ])) as { ten: string }[]
  )[0]!.ten;
const ok = (ack: Ack): Push => {
  if (!ack.ok) throw new Error(`ack lỗi ${ack.maLoi}`);
  return ack;
};
const disconnected = (tab: Tab) =>
  new Promise<string>((resolve) => tab.socket.once('disconnect', resolve));

describe('chat B5 — gửi qua socket (chat:gui)', () => {
  it('SOC-05: gửi đúng ⇒ ack ok, thân như 201 của REST; gửi lại cùng mã ⇒ ack ok cùng tin, không thêm dòng', async () => {
    const tab = await openTab(w.patientA);
    const body = text();
    const ack = ok(await send(tab, { bacSiId: w.doctorA.taiKhoanId, ...body }));
    expect(ack.tinNhan).toMatchObject({
      laCuaToi: true,
      noiDung: body.noiDung,
      maGui: body.maGui,
      nguoiGui: { vaiTro: 'BenhNhan' },
    });
    // Thân giống hệt tin đó khi tải lại bằng REST
    const res = await request(h.app.getHttpServer())
      .get(`/chat/conversations/${ack.hoiThoaiId}/messages`)
      .set('Authorization', `Bearer ${tab.token}`);
    expect(res.body.items).toEqual([ack.tinNhan]);
    const again = ok(await send(tab, { hoiThoaiId: ack.hoiThoaiId, ...body }));
    expect(again.tinNhan.id).toBe(ack.tinNhan.id);
    expect(await messageCount()).toBe(1);
  });

  it('SOC-05 (âm, biên): rỗng, 2001 điểm mã, trường lạ, mã gửi sai, gói không phải đối tượng, không đích ⇒ ack mã như REST; không ghi gì', async () => {
    const tab = await openTab(w.patientA);
    const to = { bacSiId: w.doctorA.taiKhoanId };
    const cases: [unknown, string, { truong: string; ma: string }[]][] = [
      [
        { ...to, ...text('   ') },
        'DU_LIEU_KHONG_HOP_LE',
        [{ truong: 'noiDung', ma: 'NOI_DUNG_TRONG' }],
      ],
      [
        { ...to, ...text('a'.repeat(2001)) },
        'DU_LIEU_KHONG_HOP_LE',
        [{ truong: 'noiDung', ma: 'NOI_DUNG_QUA_DAI' }],
      ],
      [
        { ...to, ...text(), taiKhoanId: w.patientB.taiKhoanId },
        'DU_LIEU_KHONG_HOP_LE',
        [{ truong: 'taiKhoanId', ma: 'TRUONG_KHONG_DUOC_PHEP' }],
      ],
      [
        { ...to, noiDung: 'x', maGui: 'khong-phai-uuid' },
        'DU_LIEU_KHONG_HOP_LE',
        [{ truong: 'maGui', ma: 'MA_GUI_KHONG_HOP_LE' }],
      ],
      [
        'chuoi',
        'DU_LIEU_KHONG_HOP_LE',
        [{ truong: 'goiTin', ma: 'GOI_TIN_KHONG_HOP_LE' }],
      ],
      [
        text(),
        'DU_LIEU_KHONG_HOP_LE',
        [{ truong: 'dich', ma: 'DICH_KHONG_HOP_LE' }],
      ],
    ];
    for (const [payload, maLoi, loi] of cases)
      expect(await send(tab, payload)).toEqual({ ok: false, maLoi, loi });
    // Biên trên: đúng 2000 điểm mã (emoji ngoài BMP tính một) thì nhận
    ok(await send(tab, { ...to, ...text('😀'.repeat(2000)) }));
    expect(await messageCount()).toBe(1);
    expect(tab.socket.connected).toBe(true);
  });

  it('SOC-06: gửi vào hội thoại không phải của mình, id lạ, id sai dạng ⇒ ack KHONG_TIM_THAY, không ghi; Bác sĩ mở hội thoại mới ⇒ KHONG_DU_QUYEN', async () => {
    const owner = await openTab(w.patientA);
    const { hoiThoaiId } = ok(
      await send(owner, { bacSiId: w.doctorA.taiKhoanId, ...text() }),
    );
    const stranger = await openTab(w.patientB);
    const otherDoctor = await openTab(w.doctorB);
    const otherBranch = await openTab(w.receptionistB);
    for (const tab of [stranger, otherDoctor, otherBranch])
      for (const id of [hoiThoaiId, '999999', 'abc', '0'])
        expect(await send(tab, { hoiThoaiId: id, ...text() })).toEqual({
          ok: false,
          maLoi: 'KHONG_TIM_THAY',
        });
    expect(
      await send(otherDoctor, { chiNhanhId: w.branchA, ...text() }),
    ).toEqual({ ok: false, maLoi: 'KHONG_DU_QUYEN' });
    expect(await messageCount()).toBe(1);
  });

  it('SOC-15, BCH-01: lỗi bất ngờ khi gửi ⇒ ack LOI_HE_THONG, gateway vẫn chạy (lần sau gửi được), log không nội dung, SĐT, email, token', async () => {
    const tab = await openTab(w.patientA);
    const secret = 'Nội dung bí mật 0901234567 a@b.vn';
    const spy = vi
      .spyOn(h.app.get(ChatSendService), 'send')
      .mockRejectedValueOnce(new TypeError(`hỏng: ${secret}`));
    const logs = captureProcessOutput();
    expect(
      await send(tab, { bacSiId: w.doctorA.taiKhoanId, ...text(secret) }),
    ).toEqual({ ok: false, maLoi: 'LOI_HE_THONG' });
    // Lỗi đã lường trước cũng đi qua log: không lộ gì
    await send(tab, { hoiThoaiId: '999999', ...text(secret) });
    await send(tab, {
      bacSiId: w.doctorA.taiKhoanId,
      noiDung: secret,
      maGui: 'x',
    });
    const sentOk = ok(
      await send(tab, { bacSiId: w.doctorA.taiKhoanId, ...text(secret) }),
    );
    vi.restoreAllMocks();
    expect(spy).toHaveBeenCalled();
    expect(sentOk.tinNhan.noiDung).toBe(secret);
    const out = logs.join('');
    expect(out).toContain('Gửi tin qua socket lỗi ngoài dự kiến (TypeError)');
    for (const leaked of [secret, '0901234567', 'a@b.vn', tab.token])
      expect(out).not.toContain(leaked);
    expect(tab.socket.connected).toBe(true);
  });

  it('SOC-14: gói quá 64 KB ⇒ máy chủ đóng kết nối, không gọi handler, không ghi; máy chủ vẫn nhận kết nối mới', async () => {
    const tab = await openTab(w.patientA);
    const closed = disconnected(tab);
    tab.socket.emit('chat:gui', {
      bacSiId: w.doctorA.taiKhoanId,
      noiDung: 'x'.repeat(70 * 1024),
      maGui: newSendId(),
    });
    expect(await closed).toBe('transport close');
    expect(await messageCount()).toBe(0);
    const next = await openTab(w.patientA);
    ok(await send(next, { bacSiId: w.doctorA.taiKhoanId, ...text() }));
  });

  it('Sự kiện lạ bị bỏ qua: không lỗi, kết nối còn, gửi sau đó vẫn được', async () => {
    const tab = await openTab(w.patientA);
    tab.socket.emit('chat:xoa-het', { hoiThoaiId: '1' });
    tab.socket.emit('message', 'x');
    ok(await send(tab, { bacSiId: w.doctorA.taiKhoanId, ...text() }));
    expect(tab.socket.connected).toBe(true);
  });
});

describe('chat B5 — đẩy chat:tin-moi', () => {
  it('SOC-07: hội thoại bác sĩ ⇒ mọi tab của Bệnh nhân (cả tab gửi) và Bác sĩ nhận đúng một lần; bác sĩ khác, Bệnh nhân khác, Lễ tân không nhận', async () => {
    const sender = await openTab(w.patientA);
    const otherTab = await openTab(w.patientA);
    const doctor1 = await openTab(w.doctorA);
    const doctor2 = await openTab(w.doctorA);
    const outsiders = [
      await openTab(w.doctorB),
      await openTab(w.patientB),
      await openTab(w.receptionistA),
    ];
    const { tinNhan, hoiThoaiId } = ok(
      await send(sender, { bacSiId: w.doctorA.taiKhoanId, ...text() }),
    );
    for (const tab of [sender, otherTab, doctor1, doctor2])
      await vi.waitFor(() => expect(tab.pushes).toHaveLength(1));
    expect(sender.pushes[0]).toEqual({ hoiThoaiId, tinNhan });
    expect(doctor1.pushes[0]!.tinNhan).toMatchObject({
      id: tinNhan.id,
      laCuaToi: false,
      maGui: null,
    });
    await sleep(QUIET_MS);
    for (const tab of outsiders) expect(tab.pushes).toEqual([]);
    for (const tab of [sender, otherTab, doctor1, doctor2])
      expect(tab.pushes).toHaveLength(1);
  });

  it('SOC-07: hộp thư chung ⇒ Bệnh nhân và MỌI Lễ tân đang hoạt động của chi nhánh nhận (tin của Bệnh nhân và tin trả lời); Lễ tân chi nhánh khác, Bác sĩ không nhận', async () => {
    // Lễ tân thứ hai của chi nhánh A (cùng chi nhánh với receptionistA)
    const second = await h.newSession({
      loaiTaiKhoan: 'LeTan',
      hoTen: 'Lễ tân thứ hai',
    });
    await h.db.query(
      'INSERT INTO le_tan (tai_khoan_id, chi_nhanh_id) VALUES (?, ?)',
      [second.accountId, w.branchA],
    );
    const patient = await openTab(w.patientA);
    const receptionA = await openTab(w.receptionistA);
    const receptionA2 = await openTab(second.accountId);
    const outsiders = [
      await openTab(w.receptionistB),
      await openTab(w.doctorA),
    ];
    const first = ok(await send(patient, { chiNhanhId: w.branchA, ...text() }));
    for (const tab of [patient, receptionA, receptionA2])
      await vi.waitFor(() => expect(tab.pushes).toHaveLength(1));
    const reply = ok(
      await send(receptionA, { hoiThoaiId: first.hoiThoaiId, ...text() }),
    );
    for (const tab of [patient, receptionA, receptionA2])
      await vi.waitFor(() => expect(tab.pushes).toHaveLength(2));
    expect(receptionA2.pushes.map((p) => p.tinNhan.id)).toEqual([
      first.tinNhan.id,
      reply.tinNhan.id,
    ]);
    await sleep(QUIET_MS);
    for (const tab of outsiders) expect(tab.pushes).toEqual([]);
  });

  it('SOC-08: thân đẩy theo vai trò người nhận: Bệnh nhân thấy "Lễ tân · {chi nhánh}", không thấy họ tên Lễ tân; Lễ tân đồng nghiệp thấy họ tên; maGui chỉ cho người gửi', async () => {
    const patient = await openTab(w.patientA);
    const sender = await openTab(w.receptionistA);
    const { hoiThoaiId } = ok(
      await send(patient, { chiNhanhId: w.branchA, ...text() }),
    );
    await vi.waitFor(() => expect(sender.pushes).toHaveLength(1));
    const reply = ok(await send(sender, { hoiThoaiId, ...text() }));
    await vi.waitFor(() => expect(patient.pushes).toHaveLength(2));
    await vi.waitFor(() => expect(sender.pushes).toHaveLength(2));
    const receptionistName = await nameOf(w.receptionistA.taiKhoanId);
    const seenByPatient = patient.pushes[1]!;
    expect(seenByPatient.tinNhan).toEqual({
      ...reply.tinNhan,
      laCuaToi: false,
      maGui: null,
      nguoiGui: {
        vaiTro: 'LeTan',
        tenHienThi: `Lễ tân · ${await branchNameOf(w.branchA)}`,
      },
    });
    expect(JSON.stringify(seenByPatient)).not.toContain(receptionistName);
    expect(sender.pushes[1]!.tinNhan).toEqual(reply.tinNhan);
    expect(sender.pushes[1]!.tinNhan.nguoiGui.tenHienThi).toBe(
      receptionistName,
    );
  });

  it('SOC-13: gửi qua socket rồi gửi lại bằng REST cùng mã gửi ⇒ một dòng, REST 200 cùng tin; người nhận chỉ nhận MỘT lần đẩy', async () => {
    const sender = await openTab(w.patientA);
    const doctor = await openTab(w.doctorA);
    const body = text();
    const ack = ok(
      await send(sender, { bacSiId: w.doctorA.taiKhoanId, ...body }),
    );
    const res = await request(h.app.getHttpServer())
      .post(`/chat/conversations/${ack.hoiThoaiId}/messages`)
      .set('Authorization', `Bearer ${sender.token}`)
      .send(body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      hoiThoaiId: ack.hoiThoaiId,
      tinNhan: ack.tinNhan,
    });
    await vi.waitFor(() => expect(doctor.pushes).toHaveLength(1));
    await sleep(QUIET_MS);
    expect(doctor.pushes).toHaveLength(1);
    expect(sender.pushes).toHaveLength(1);
    expect(await messageCount()).toBe(1);
  });

  it('SOC-10: Lễ tân đổi chi nhánh khi đang nối ⇒ ngừng nhận tin của chi nhánh cũ NGAY ở tin kế tiếp (người nhận đọc từ DB lúc đẩy)', async () => {
    const patient = await openTab(w.patientA);
    const reception = await openTab(w.receptionistA);
    const first = ok(await send(patient, { chiNhanhId: w.branchA, ...text() }));
    await vi.waitFor(() => expect(reception.pushes).toHaveLength(1));
    await h.db.query(
      'UPDATE le_tan SET chi_nhanh_id = ? WHERE tai_khoan_id = ?',
      [w.branchB, w.receptionistA.taiKhoanId],
    );
    ok(await send(patient, { hoiThoaiId: first.hoiThoaiId, ...text() }));
    await vi.waitFor(() => expect(patient.pushes).toHaveLength(2));
    await sleep(QUIET_MS);
    expect(reception.pushes).toHaveLength(1);
    // Và gửi vào hộp thư cũ không còn được (phạm vi đọc ở mỗi sự kiện)
    expect(
      await send(reception, { hoiThoaiId: first.hoiThoaiId, ...text() }),
    ).toEqual({ ok: false, maLoi: 'KHONG_TIM_THAY' });
  });
});

describe('chat B5 — phiên của kết nối đang mở (SOC-09, QCH-02)', () => {
  it('SOC-09: đăng xuất (thu hồi phiên) khi đang nối ⇒ kết nối đó không nhận đẩy và bị ngắt; tab của phiên khác vẫn nhận', async () => {
    const patient = await openTab(w.patientA);
    const loggedOut = await openTab(w.doctorA);
    const sameSession = await openTab(w.doctorA, loggedOut);
    const otherSession = await openTab(w.doctorA);
    const registry = h.app.get(ChatConnectionRegistry);
    expect(registry.count(w.doctorA.taiKhoanId)).toBe(3);
    await h.sessions.revoke(loggedOut.sessionId);
    const closed = [disconnected(loggedOut), disconnected(sameSession)];
    ok(await send(patient, { bacSiId: w.doctorA.taiKhoanId, ...text() }));
    await vi.waitFor(() => expect(otherSession.pushes).toHaveLength(1));
    expect(await Promise.all(closed)).toEqual([
      'io server disconnect',
      'io server disconnect',
    ]);
    expect(loggedOut.pushes).toEqual([]);
    expect(sameSession.pushes).toEqual([]);
    await vi.waitFor(() =>
      expect(registry.count(w.doctorA.taiKhoanId)).toBe(1),
    );
  });

  it('SOC-09: phiên hết rồi gửi qua socket ⇒ ack PHIEN_HET_HIEU_LUC (ack tới trước), rồi bị ngắt; không ghi', async () => {
    const tab = await openTab(w.patientA);
    await h.sessions.revoke(tab.sessionId);
    const closed = disconnected(tab);
    expect(
      await send(tab, { bacSiId: w.doctorA.taiKhoanId, ...text() }),
    ).toEqual({ ok: false, maLoi: 'PHIEN_HET_HIEU_LUC' });
    expect(await closed).toBe('io server disconnect');
    expect(await messageCount()).toBe(0);
  });

  it('SOC-09: khoá tài khoản khi đang nối, không gửi không nhận gì ⇒ lượt quét phiên (mỗi 60 giây) ngắt; kết nối hợp lệ giữ nguyên', async () => {
    const locked = await openTab(w.receptionistA);
    const keep = await openTab(w.patientA);
    await h.db.query(
      "UPDATE tai_khoan SET trang_thai = 'NgungHoatDong' WHERE tai_khoan_id = ?",
      [w.receptionistA.taiKhoanId],
    );
    const closed = disconnected(locked);
    expect(await h.app.get(ChatSocketSessions).sweep()).toBe(1);
    expect(await closed).toBe('io server disconnect');
    expect(keep.socket.connected).toBe(true);
  });

  it('QCH-02 (socket), SOC-09: tài khoản bị đổi sang vai trò khác (Quản trị viên) khi đang nối ⇒ gửi bị từ chối lỗi phiên và bị ngắt, không nhận đẩy', async () => {
    const tab = await openTab(w.doctorA);
    const sender = await openTab(w.doctorA);
    const patient = await openTab(w.patientA);
    const { hoiThoaiId } = ok(
      await send(patient, { bacSiId: w.doctorA.taiKhoanId, ...text() }),
    );
    await vi.waitFor(() => expect(tab.pushes).toHaveLength(1));
    await h.db.query(
      "UPDATE tai_khoan SET loai_tai_khoan = 'QuanTriVien' WHERE tai_khoan_id = ?",
      [w.doctorA.taiKhoanId],
    );
    // Gửi từ một tab của tài khoản đã đổi vai trò ⇒ lỗi phiên, không ghi
    const senderClosed = disconnected(sender);
    expect(await send(sender, { hoiThoaiId, ...text() })).toEqual({
      ok: false,
      maLoi: 'PHIEN_HET_HIEU_LUC',
    });
    expect(await senderClosed).toBe('io server disconnect');
    // Tin mới của Bệnh nhân không tới tab còn lại; tab đó bị ngắt
    const closed = disconnected(tab);
    ok(await send(patient, { hoiThoaiId, ...text() }));
    expect(await closed).toBe('io server disconnect');
    expect(tab.pushes).toHaveLength(1);
    expect(await messageCount()).toBe(2);
  });
});
