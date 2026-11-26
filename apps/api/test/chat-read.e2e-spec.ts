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
  buildSendService,
  newSendId,
  openConversation,
  type ChatWorld,
} from './../src/chat/testing/chat-world.js';
import { expectErrorResponse } from './../src/common/testing/error-assertions.js';
import { resetTables } from './../src/database/testing/test-database.js';

// chat B2 — API đọc qua HTTP THẬT (AppModule + MySQL thật + configureApp như main.ts; PLAN chat 5.6, 7.3, 7.5, 7.10): NBN-01, NBN-03, NBN-07, QCH-01, QCH-02, QCH-03,
// QCH-04, QCH-05, QCH-07, QCH-08, QCH-10, QCH-11 (phần E), BCH-05. Hành vi DB chi tiết (quan hệ, con trỏ, chưa đọc, mốc) ở chat/read/conversation-read.int-spec.ts.
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
const tokenOf = async (actor: ChatActor | string) =>
  (
    await h.sessions.create(
      typeof actor === 'string' ? actor : actor.taiKhoanId,
    )
  ).accessToken;
const get = (path: string, token?: string) => {
  const req = server().get(path);
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
};
const post = (path: string, body: object, token?: string) => {
  const req = server().post(path).send(body);
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
};
const open = (
  patient: ChatActor,
  target: { bacSiId: string } | { chiNhanhId: string },
) => openConversation(buildSendService(h.db), patient, target);
const reply = async (actor: ChatActor, hoiThoaiId: string) => {
  const outcome = await buildSendService(h.db).send({
    actor,
    target: { hoiThoaiId },
    noiDung: 'Trả lời',
    maGui: newSendId(),
  });
  if (outcome.kind !== 'Sent') throw new Error(outcome.kind);
  return outcome.tinNhan.tinNhanId;
};
const countRows = async (sql: string, params: unknown[] = []) =>
  Number(((await h.db.query(sql, params)) as { n: string }[])[0]?.n ?? 0);

/** Mọi route đọc của một hội thoại (chi tiết, tin, đánh dấu) với một token. */
const conversationRoutes = (id: string, tinNhanId: string, token?: string) => [
  get(`/chat/conversations/${id}`, token),
  get(`/chat/conversations/${id}/messages`, token),
  post(`/chat/conversations/${id}/read`, { tinNhanId }, token),
];

describe('chat B2 — API đọc qua HTTP', () => {
  it('QCH-01, BCH-05: không token, token rác, token hết hạn ở MỌI route ⇒ 401; mọi phản hồi (kể cả 401) có Cache-Control: no-store', async () => {
    const conv = await open(w.patientA, { bacSiId: w.doctorA.taiKhoanId });
    const routes = (token?: string) => [
      get('/chat/conversations', token),
      get('/chat/unread-count', token),
      ...conversationRoutes(conv.hoiThoaiId, conv.tinNhanId, token),
    ];
    for (const res of await Promise.all(routes())) {
      expectErrorResponse(res, 401, 'CHUA_DANG_NHAP');
      expect(res.headers['cache-control']).toBe('no-store');
    }
    for (const res of await Promise.all(routes('khong.phai.token'))) {
      expectErrorResponse(res, 401, 'TOKEN_KHONG_HOP_LE');
      expect(res.headers['cache-control']).toBe('no-store');
    }
    const token = await tokenOf(w.patientA);
    vi.setSystemTime(new Date(T0.getTime() + 15 * 60 * 1000 + 1000));
    for (const res of await Promise.all(routes(token))) {
      expect(res.status).toBe(401);
      expect(res.headers['cache-control']).toBe('no-store');
    }
  });

  it('QCH-02: Quản trị viên Toàn hệ thống và Chi nhánh ⇒ 403 KHONG_DU_QUYEN ở mọi route (kể cả id sai dạng: guard chạy trước pipe)', async () => {
    const conv = await open(w.patientA, { chiNhanhId: w.branchA });
    for (const admin of [w.accounts.sysAdmin, w.accounts.adminA]) {
      const token = await tokenOf(admin.account.taiKhoanId);
      const all = await Promise.all([
        get('/chat/conversations', token),
        get('/chat/unread-count', token),
        get('/chat/conversations/abc', token),
        ...conversationRoutes(conv.hoiThoaiId, conv.tinNhanId, token),
      ]);
      for (const res of all) {
        expectErrorResponse(res, 403, 'KHONG_DU_QUYEN');
        expect(res.headers['cache-control']).toBe('no-store');
      }
    }
  });

  it('NBN-01, BCH-05: Bác sĩ xem danh sách: 200 JSON, no-store, chỉ hội thoại mình là thành viên; số đếm đúng', async () => {
    const mine = await open(w.patientA, { bacSiId: w.doctorA.taiKhoanId });
    await open(w.patientB, { bacSiId: w.doctorB.taiKhoanId });
    await open(w.patientA, { chiNhanhId: w.branchA });
    const token = await tokenOf(w.doctorA);
    const res = await get('/chat/conversations', token);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const body = res.body as {
      items: { id: string }[];
      truocTiepTheo: string | null;
    };
    expect(Object.keys(body).sort()).toEqual(['items', 'truocTiepTheo']);
    expect(body.items.map((i) => i.id)).toEqual([mine.hoiThoaiId]);
    const count = await get('/chat/unread-count', token);
    expect([count.status, count.body, count.headers['cache-control']]).toEqual([
      200,
      { soHoiThoaiChuaDoc: 1 },
      'no-store',
    ]);
  });

  it('NBN-03, QCH-03, QCH-04, QCH-05: người không thấy được hội thoại ⇒ 404 KHONG_TIM_THAY CÙNG thân ở chi tiết, tin, đánh dấu; không ghi gì', async () => {
    const doctorConv = await open(w.patientA, {
      bacSiId: w.doctorA.taiKhoanId,
    });
    const inbox = await open(w.patientA, { chiNhanhId: w.branchA });
    const outsiders: [string, ChatActor, typeof doctorConv][] = [
      ['NBN-03 / QCH-04: bác sĩ khác', w.doctorB, doctorConv],
      ['QCH-04: bác sĩ vào hộp thư chung', w.doctorA, inbox],
      ['QCH-03: Bệnh nhân khác (hội thoại bác sĩ)', w.patientB, doctorConv],
      ['QCH-03: Bệnh nhân khác (hộp thư)', w.patientB, inbox],
      ['QCH-05: Lễ tân chi nhánh khác', w.receptionistB, inbox],
      ['QCH-05: Lễ tân vào hội thoại bác sĩ', w.receptionistA, doctorConv],
    ];
    const missing = await Promise.all(
      conversationRoutes('999999999', '1', await tokenOf(w.patientA)),
    );
    const reference = expectErrorResponse(
      missing[0] ?? { status: 0, headers: {}, body: {} },
      404,
      'KHONG_TIM_THAY',
    );
    const before = await countRows(
      'SELECT COUNT(*) AS n FROM tai_khoan_hoi_thoai',
    );
    for (const [label, actor, conv] of outsiders) {
      const token = await tokenOf(actor);
      for (const res of await Promise.all(
        conversationRoutes(conv.hoiThoaiId, conv.tinNhanId, token),
      )) {
        expect(expectErrorResponse(res, 404, 'KHONG_TIM_THAY'), label).toEqual(
          reference,
        );
        expect(res.headers['cache-control']).toBe('no-store');
      }
    }
    expect(
      await countRows('SELECT COUNT(*) AS n FROM tai_khoan_hoi_thoai'),
    ).toBe(before);
    // Lễ tân chi nhánh khác tìm cũng không ra bệnh nhân của chi nhánh A
    const search = await get(
      '/chat/conversations?q=B%E1%BB%87nh',
      await tokenOf(w.receptionistB),
    );
    expect([
      search.status,
      (search.body as { items: unknown[] }).items,
    ]).toEqual([200, []]);
  });

  it('QCH-07: id hội thoại sai dạng (0, âm, chữ, quá 20 số, số thập phân) ⇒ 404 cùng thân, không 500', async () => {
    const token = await tokenOf(w.patientA);
    const reference = expectErrorResponse(
      await get('/chat/conversations/999999999', token),
      404,
      'KHONG_TIM_THAY',
    );
    for (const bad of [
      '0',
      '-1',
      'abc',
      '1'.repeat(21),
      '1.5',
      '9223372036854775808',
    ]) {
      for (const res of await Promise.all(conversationRoutes(bad, '1', token)))
        expect(expectErrorResponse(res, 404, 'KHONG_TIM_THAY'), bad).toEqual(
          reference,
        );
    }
  });

  it('NBN-07: từ khoá 1 ký tự, 101 ký tự, ký tự điều khiển, rỗng ⇒ 400 DU_LIEU_KHONG_HOP_LE đúng MỘT lỗi { q, TU_KHOA_KHONG_HOP_LE }; 2 và 100 ký tự nhận', async () => {
    const token = await tokenOf(w.receptionistA);
    for (const q of ['a', 'a'.repeat(101), 'a%00b', 'a%09b', '', '%20']) {
      const body = expectErrorResponse(
        await get(`/chat/conversations?q=${q}`, token),
        400,
        'DU_LIEU_KHONG_HOP_LE',
      );
      expect(body.loi, q).toEqual([
        { truong: 'q', ma: 'TU_KHOA_KHONG_HOP_LE' },
      ]);
    }
    for (const q of ['ab', 'a'.repeat(100)])
      expect((await get(`/chat/conversations?q=${q}`, token)).status, q).toBe(
        200,
      );
  });

  it('tham số sai ⇒ 400: limit 0 và 51, truoc chữ, loc lạ, trường lạ (taiKhoanId, chiNhanhId); messages limit 101, truoc và sau cùng lúc; thân đánh dấu thiếu, sai dạng, là số', async () => {
    const conv = await open(w.patientA, { bacSiId: w.doctorA.taiKhoanId });
    const token = await tokenOf(w.patientA);
    for (const qs of [
      'limit=0',
      'limit=51',
      'truoc=abc',
      'loc=khac',
      'taiKhoanId=1',
      'chiNhanhId=1',
    ])
      expectErrorResponse(
        await get(`/chat/conversations?${qs}`, token),
        400,
        'DU_LIEU_KHONG_HOP_LE',
      );
    for (const qs of [
      'limit=101',
      'truoc=0',
      `truoc=${conv.tinNhanId}&sau=${conv.tinNhanId}`,
    ])
      expectErrorResponse(
        await get(
          `/chat/conversations/${conv.hoiThoaiId}/messages?${qs}`,
          token,
        ),
        400,
        'DU_LIEU_KHONG_HOP_LE',
      );
    for (const body of [
      {},
      { tinNhanId: 'x' },
      { tinNhanId: Number(conv.tinNhanId) },
      { tinNhanId: conv.tinNhanId, taiKhoanId: '1' },
    ])
      expectErrorResponse(
        await post(`/chat/conversations/${conv.hoiThoaiId}/read`, body, token),
        400,
        'DU_LIEU_KHONG_HOP_LE',
      );
    expect((await get('/chat/conversations?limit=50', token)).status).toBe(200);
  });

  it('QCH-08: Lễ tân không còn phạm vi hợp lệ (mất hồ sơ lễ tân) ⇒ 403 KHONG_DU_QUYEN ở mọi route', async () => {
    const conv = await open(w.patientA, { chiNhanhId: w.branchA });
    const token = await tokenOf(w.receptionistA);
    await h.db.query('DELETE FROM le_tan WHERE tai_khoan_id = ?', [
      w.receptionistA.taiKhoanId,
    ]);
    const all = await Promise.all([
      get('/chat/conversations', token),
      get('/chat/unread-count', token),
      ...conversationRoutes(conv.hoiThoaiId, conv.tinNhanId, token),
    ]);
    for (const res of all) expectErrorResponse(res, 403, 'KHONG_DU_QUYEN');
  });

  it('QCH-10: đánh dấu bằng id tin của hội thoại khác ⇒ 404, mốc không đổi; đánh dấu đúng ⇒ 200 { tinNhanCuoiDaDocId }', async () => {
    const a = await open(w.patientA, { bacSiId: w.doctorA.taiKhoanId });
    const b = await open(w.patientA, { bacSiId: w.doctorB.taiKhoanId });
    const token = await tokenOf(w.patientA);
    const otherMessage = await reply(w.doctorB, b.hoiThoaiId);
    expectErrorResponse(
      await post(
        `/chat/conversations/${a.hoiThoaiId}/read`,
        { tinNhanId: otherMessage },
        token,
      ),
      404,
      'KHONG_TIM_THAY',
    );
    expect(
      await countRows(
        'SELECT COUNT(*) AS n FROM tai_khoan_hoi_thoai WHERE hoi_thoai_id = ? AND tin_nhan_cuoi_da_doc_id IS NOT NULL',
        [a.hoiThoaiId],
      ),
    ).toBe(0);
    const ok = await post(
      `/chat/conversations/${a.hoiThoaiId}/read`,
      { tinNhanId: a.tinNhanId },
      token,
    );
    expect([ok.status, ok.body, ok.headers['cache-control']]).toEqual([
      200,
      { tinNhanCuoiDaDocId: a.tinNhanId },
      'no-store',
    ]);
  });

  it('QCH-11 (E): khoá JSON theo vai trò qua HTTP: Bệnh nhân thấy "Lễ tân · chi nhánh", không họ tên hay id Lễ tân; Bác sĩ không SĐT; không email ở đâu', async () => {
    const inbox = await open(w.patientA, { chiNhanhId: w.branchA });
    await reply(w.receptionistA, inbox.hoiThoaiId);
    const patientToken = await tokenOf(w.patientA);
    const bodies = await Promise.all([
      get('/chat/conversations', patientToken),
      get(`/chat/conversations/${inbox.hoiThoaiId}`, patientToken),
      get(`/chat/conversations/${inbox.hoiThoaiId}/messages`, patientToken),
    ]);
    const raw = JSON.stringify(bodies.map((r) => r.body as unknown));
    expect(raw).toContain('Lễ tân · Chi nhánh A');
    expect(raw).not.toContain(w.accounts.receptionistA.account.hoTen);
    expect(raw).not.toContain(`"${w.receptionistA.taiKhoanId}"`);
    expect(raw).not.toContain(w.accounts.receptionistA.account.email);
    expect(Object.keys(bodies[1]?.body as object).sort()).toEqual([
      'banner',
      'coTheGui',
      'doiTac',
      'id',
      'loai',
      'lyDoKhongGui',
      'quanHe',
    ]);
    const message =
      (bodies[2]?.body as { items?: object[] } | undefined)?.items?.[1] ?? {};
    expect(Object.keys(message).sort()).toEqual([
      'id',
      'laCuaToi',
      'maGui',
      'nguoiGui',
      'noiDung',
      'tep',
      'thoiDiemGui',
    ]);

    const doc = await open(w.patientA, { bacSiId: w.doctorA.taiKhoanId });
    const doctorView = JSON.stringify(
      (
        await get(
          `/chat/conversations/${doc.hoiThoaiId}`,
          await tokenOf(w.doctorA),
        )
      ).body,
    );
    expect(doctorView).toContain(w.accounts.onlyA.account.hoTen);
    expect(doctorView).not.toContain(w.accounts.onlyA.account.soDienThoai);
    expect(doctorView).not.toContain(w.accounts.onlyA.account.email);
  });
});
