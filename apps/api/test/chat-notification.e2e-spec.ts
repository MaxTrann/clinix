import request from 'supertest';
import { vi } from 'vitest';
import { T0 } from './../src/auth/testing/otp-int-helpers.js';
import {
  openRefreshHarness,
  type RefreshHarness,
} from './../src/auth/testing/refresh-http-helpers.js';
import type { ChatActor } from './../src/chat/core/chat-access.policy.js';
import {
  buildChatWorld,
  newSendId,
  type ChatWorld,
} from './../src/chat/testing/chat-world.js';
import { resetTables } from './../src/database/testing/test-database.js';

// chat B6 — thông báo tin mới qua HTTP THẬT (AppModule dựng cổng `CHAT_NOTIFIER` thật; PLAN chat 5.10, 7.9): TBC-08 (phần E: Trung tâm thông báo trả liên kết
// `{ kieu: 'HoiThoai', hoiThoaiId }`), TBC-01 và TBC-03 qua đúng route gửi và đánh dấu đọc của web. Phần W (nút mở trang theo vai trò) là chat F1.
let h: RefreshHarness;
let w: ChatWorld;

beforeAll(async () => {
  h = await openRefreshHarness();
});
beforeEach(async () => {
  await resetTables(h.db);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  w = await buildChatWorld(h.db);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
afterAll(async () => {
  await h.close();
});

const server = () => request(h.app.getHttpServer());
const tokenOf = async (actor: ChatActor) =>
  (await h.sessions.create(actor.taiKhoanId)).accessToken;
const get = (path: string, token: string) =>
  server().get(path).set('Authorization', `Bearer ${token}`);
const post = (path: string, body: object, token: string) =>
  server().post(path).send(body).set('Authorization', `Bearer ${token}`);

describe('chat B6 — thông báo tin nhắn mới qua HTTP', () => {
  it('TBC-08, TBC-01: Bệnh nhân gửi qua REST ⇒ Trung tâm thông báo của Bác sĩ có một mục "Tin nhắn mới", nhóm TinNhan, liên kết HoiThoai đúng id; không nội dung tin', async () => {
    const patient = await tokenOf(w.patientA);
    const doctor = await tokenOf(w.doctorA);
    const sent = await post(
      `/chat/doctors/${w.doctorA.taiKhoanId}/messages`,
      { noiDung: 'Nội dung riêng của tin', maGui: newSendId() },
      patient,
    ).expect(201);
    const hoiThoaiId = (sent.body as { hoiThoaiId: string }).hoiThoaiId;

    const list = await get('/notifications', doctor).expect(200);
    const body = list.body as {
      items: Record<string, unknown>[];
      total: number;
    };
    expect(body.total).toBe(1);
    expect(body.items[0]).toMatchObject({
      loai: 'TinNhanMoi',
      nhom: 'TinNhan',
      tieuDe: 'Tin nhắn mới',
      noiDung: 'Bạn có tin nhắn mới từ bệnh nhân Bệnh nhân chỉ A.',
      daDoc: false,
      lienKet: { kieu: 'HoiThoai', hoiThoaiId },
    });
    expect(JSON.stringify(body)).not.toContain('Nội dung riêng');
    // Người gửi không tự nhận thông báo
    const own = await get('/notifications', patient).expect(200);
    expect((own.body as { total: number }).total).toBe(0);
  });

  it('TBC-03 (qua HTTP): Bác sĩ đọc hết qua POST /chat/conversations/:id/read ⇒ số chưa đọc của Trung tâm về 0', async () => {
    const patient = await tokenOf(w.patientA);
    const doctor = await tokenOf(w.doctorA);
    const sent = await post(
      `/chat/doctors/${w.doctorA.taiKhoanId}/messages`,
      { noiDung: 'Chào bác sĩ', maGui: newSendId() },
      patient,
    ).expect(201);
    const { hoiThoaiId, tinNhan } = sent.body as {
      hoiThoaiId: string;
      tinNhan: { id: string };
    };
    const before = await get('/notifications/unread-count', doctor).expect(200);
    expect(before.body).toEqual({ soChuaDoc: 1 });
    await post(
      `/chat/conversations/${hoiThoaiId}/read`,
      { tinNhanId: tinNhan.id },
      doctor,
    ).expect(200);
    const after = await get('/notifications/unread-count', doctor).expect(200);
    expect(after.body).toEqual({ soChuaDoc: 0 });
  });
});
