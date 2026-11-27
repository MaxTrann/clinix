import request from 'supertest';
import { vi } from 'vitest';
import { T0 } from './../src/auth/testing/otp-int-helpers.js';
import {
  openRefreshHarness,
  type RefreshHarness,
} from './../src/auth/testing/refresh-http-helpers.js';
import { ChatAttachmentInspector } from './../src/chat/attachments/chat-attachment.inspector.js';
import { CHAT_FILE_MAX_BYTES } from './../src/chat/chat.constants.js';
import type { ChatActor } from './../src/chat/core/chat-access.policy.js';
import {
  clearStore,
  fakePdf,
  imageWithGps,
  pdf,
  storedKeys,
} from './../src/chat/testing/chat-files.js';
import {
  buildChatWorld,
  deferred,
  newSendId,
  type ChatWorld,
} from './../src/chat/testing/chat-world.js';
import { expectErrorResponse } from './../src/common/testing/error-assertions.js';
import { resetTables } from './../src/database/testing/test-database.js';
import { captureProcessOutput } from './../src/patient/testing/relatives-update-helpers.js';

// chat B4 — gửi và tải tệp qua HTTP THẬT (AppModule + MySQL thật + multer thật; kho là CHAT_FILES_DIR của test trong thư mục tạm; PLAN chat 5.6, 5.8, 7.5, 7.7, 7.10):
// TEP-04 (413 qua multer), TEP-05, TEP-06, TEP-09, TEP-10, TEP-12, QCH-12 (tải tệp), BCH-01 (log), BCH-05 (no-store). Hành vi DB chi tiết ở chat/rest/chat-attachment.int-spec.ts.
let h: RefreshHarness;
let w: ChatWorld;
const root = process.env.CHAT_FILES_DIR!;

beforeAll(async () => {
  h = await openRefreshHarness();
});
beforeEach(async () => {
  await resetTables(h.db);
  await clearStore(root);
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
interface FilePart {
  data: Buffer;
  name?: string;
  /** Đường dẫn đầy đủ gửi nguyên trong header (form-data mặc định chỉ giữ tên cuối). */
  filepath?: string;
  contentType?: string;
}
const upload = (
  path: string,
  token: string,
  file: FilePart | null,
  fields: Record<string, string> = {
    noiDung: 'Kèm tệp',
    maGui: newSendId(),
  },
) => {
  let req = server().post(path).set('Authorization', `Bearer ${token}`);
  for (const [key, value] of Object.entries(fields))
    req = req.field(key, value);
  if (file)
    req = req.attach('file', file.data, {
      filename: file.name ?? 'tep.pdf',
      contentType: file.contentType ?? 'application/octet-stream',
      ...(file.filepath ? { filepath: file.filepath } : {}),
    });
  return req;
};
const download = (tinNhanId: string, token?: string) => {
  const req = server()
    .get(`/chat/messages/${tinNhanId}/attachment`)
    .buffer(true)
    // Tệp: giữ nguyên byte; lỗi (JSON): parse như mọi phản hồi lỗi
    .parse((res, done) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        const json = String(res.headers['content-type']).includes('json');
        done(null, json ? (JSON.parse(raw.toString('utf8')) as unknown) : raw);
      });
    });
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
};
const messageCount = async () =>
  Number(
    (
      (await h.db.query('SELECT COUNT(*) AS n FROM tin_nhan')) as {
        n: string;
      }[]
    )[0]?.n,
  );
interface SentBody {
  hoiThoaiId: string;
  tinNhan: {
    id: string;
    tep: { ten: string; loai: string; dungLuong: number } | null;
  };
}
const toDoctor = () => `/chat/doctors/${w.doctorA.taiKhoanId}/messages`;

describe('chat B4 — multipart ở route gửi', () => {
  it('TEP-04: đúng 10 MB ⇒ 201; 10 MB + 1 byte ⇒ 413 CHAT_TEP_QUA_LON do multer chặn, không tin, không tệp', async () => {
    const token = await tokenOf(w.patientC);
    const ok = await upload(toDoctor(), token, {
      data: pdf(CHAT_FILE_MAX_BYTES),
      name: 'du.pdf',
    });
    expect(ok.status).toBe(201);
    expect((ok.body as SentBody).tinNhan.tep?.dungLuong).toBe(
      CHAT_FILE_MAX_BYTES,
    );
    const keys = await storedKeys(root);
    const over = await upload(toDoctor(), token, {
      data: pdf(CHAT_FILE_MAX_BYTES + 1),
      name: 'qua.pdf',
    });
    expectErrorResponse(over, 413, 'CHAT_TEP_QUA_LON');
    expect(await messageCount()).toBe(1);
    expect(await storedKeys(root)).toEqual(keys);
  });

  it('TEP-05: hai tệp; trường tệp tên lạ; trường chữ lạ ⇒ 400; không tin, không tệp', async () => {
    const token = await tokenOf(w.patientC);
    const two = await server()
      .post(toDoctor())
      .set('Authorization', `Bearer ${token}`)
      .field('maGui', newSendId())
      .attach('file', pdf(), 'a.pdf')
      .attach('file', pdf(), 'b.pdf');
    expectErrorResponse(two, 400, 'YEU_CAU_KHONG_HOP_LE');
    const wrongField = await server()
      .post(toDoctor())
      .set('Authorization', `Bearer ${token}`)
      .field('maGui', newSendId())
      .attach('anh', pdf(), 'a.pdf');
    expectErrorResponse(wrongField, 400, 'YEU_CAU_KHONG_HOP_LE');
    const extra = await upload(
      toDoctor(),
      token,
      { data: pdf() },
      { maGui: newSendId(), taiKhoanId: w.patientA.taiKhoanId },
    );
    const body = expectErrorResponse(extra, 400, 'DU_LIEU_KHONG_HOP_LE');
    expect(body.loi).toEqual([
      { truong: 'taiKhoanId', ma: 'TRUONG_KHONG_DUOC_PHEP' },
    ]);
    expect(await messageCount()).toBe(0);
    expect(await storedKeys(root)).toEqual([]);
  });

  it('TEP-06: tên tiếng Việt qua multipart giữ đúng dấu; đường dẫn, ký tự đổi chiều bị bỏ; dài 300 ⇒ ≤ 255', async () => {
    const token = await tokenOf(w.patientC);
    const vn = await upload(toDoctor(), token, {
      data: pdf(),
      name: 'Kết quả xét nghiệm.pdf',
    });
    expect((vn.body as SentBody).tinNhan.tep?.ten).toBe(
      'Kết quả xét nghiệm.pdf',
    );
    const pathy = await upload(toDoctor(), token, {
      data: pdf(),
      filepath: '../../duong/dan/Đơn‮fdp.exe',
    });
    expect((pathy.body as SentBody).tinNhan.tep?.ten).toBe('Đơnfdp.pdf');
    const long = await upload(toDoctor(), token, {
      data: pdf(),
      name: `${'ệ'.repeat(300)}.pdf`,
    });
    expect(
      Array.from((long.body as SentBody).tinNhan.tep?.ten ?? '').length,
    ).toBe(255);
  });

  it('TEP-13: multipart chỉ có tệp (không trường noiDung) ⇒ 201, noiDung rỗng', async () => {
    const token = await tokenOf(w.patientC);
    const res = await upload(
      `/chat/branches/${w.branchA}/messages`,
      token,
      { data: await imageWithGps('png'), name: 'anh.png' },
      { maGui: newSendId() },
    );
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      tinNhan: { noiDung: '', tep: { loai: 'image/png' } },
    });
  });
});

describe('chat B4 — tải tệp', () => {
  async function sentFile(data = pdf(3000), name = 'Kết quả.pdf') {
    const token = await tokenOf(w.patientC);
    const res = await upload(toDoctor(), token, { data, name });
    expect(res.status).toBe(201);
    return (res.body as SentBody).tinNhan.id;
  }

  it('TEP-09, BCH-05: người tham gia (Bệnh nhân gửi, Bác sĩ nhận) tải ⇒ 200, đủ sáu header, byte đúng', async () => {
    const data = pdf(3000);
    const id = await sentFile(data);
    for (const actor of [w.patientC, w.doctorA]) {
      const res = await download(id, await tokenOf(actor));
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-length']).toBe(String(data.length));
      expect(res.headers['content-disposition']).toBe(
        `attachment; filename="Ket qua.pdf"; filename*=UTF-8''K%E1%BA%BFt%20qu%E1%BA%A3.pdf`,
      );
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-security-policy']).toBe(
        "default-src 'none'; sandbox",
      );
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body).toEqual(data);
    }
  });

  it('TEP-09: Lễ tân chi nhánh tải tệp ở hộp thư chung của chi nhánh mình ⇒ 200', async () => {
    const res = await upload(
      `/chat/branches/${w.branchA}/messages`,
      await tokenOf(w.patientC),
      {
        data: pdf(),
        name: 'a.pdf',
      },
    );
    const id = (res.body as SentBody).tinNhan.id;
    expect((await download(id, await tokenOf(w.receptionistA))).status).toBe(
      200,
    );
  });

  it('TEP-10, QCH-12: người ngoài (Bệnh nhân khác, Bác sĩ khác, Lễ tân) ⇒ 404 cùng thân; tin không tệp ⇒ 404; id sai dạng ⇒ 404; Quản trị viên ⇒ 403', async () => {
    const id = await sentFile();
    const reference = expectErrorResponse(
      await download('999999999', await tokenOf(w.patientC)),
      404,
      'KHONG_TIM_THAY',
    );
    for (const actor of [
      w.patientB,
      w.doctorB,
      w.receptionistA,
      w.receptionistB,
    ]) {
      const res = await download(id, await tokenOf(actor));
      expect(expectErrorResponse(res, 404, 'KHONG_TIM_THAY')).toEqual(
        reference,
      );
    }
    const text = await server()
      .post(toDoctor())
      .set('Authorization', `Bearer ${await tokenOf(w.patientC)}`)
      .send({ noiDung: 'Tin chữ', maGui: newSendId() });
    expectErrorResponse(
      await download(
        (text.body as SentBody).tinNhan.id,
        await tokenOf(w.patientC),
      ),
      404,
      'KHONG_TIM_THAY',
    );
    expectErrorResponse(
      await download('abc', await tokenOf(w.patientC)),
      404,
      'KHONG_TIM_THAY',
    );
    const admin = await download(
      id,
      await tokenOf(w.accounts.sysAdmin.account.taiKhoanId),
    );
    expect(admin.status).toBe(403);
    expect((await download(id)).status).toBe(401);
  });

  it('TEP-10, BCH-01: tệp mất trên đĩa ⇒ 404 và log CHỈ id tin (không khoá, không tên tệp)', async () => {
    const id = await sentFile(pdf(), 'TenRiengTu.pdf');
    const [key] = await storedKeys(root);
    await clearStore(root);
    const logs = captureProcessOutput();
    const res = await download(id, await tokenOf(w.patientC));
    vi.restoreAllMocks();
    expectErrorResponse(res, 404, 'KHONG_TIM_THAY');
    const output = logs.join('');
    expect(output).toContain(`tinNhanId=${id}`);
    expect(output).not.toContain(key!);
    expect(output).not.toContain('TenRiengTu');
  });
});

describe('chat B4 — giới hạn tải đồng thời (TEP-12)', () => {
  it('TEP-12: đang có 4 lượt tải (ở cả ba route) ⇒ lượt thứ năm 503 CHAT_TAI_TEP_DANG_BAN; 4 lượt kia vẫn xong 201; sau đó tải lại được; gửi chữ (JSON) không bị chặn', async () => {
    const inspector = h.app.get(ChatAttachmentInspector);
    const gate = deferred();
    const real = inspector.prepare.bind(inspector);
    const spy = vi
      .spyOn(inspector, 'prepare')
      .mockImplementation(async (data, name) => {
        await gate.promise;
        return real(data, name);
      });
    const token = await tokenOf(w.patientC);
    const opened = await server()
      .post(toDoctor())
      .set('Authorization', `Bearer ${token}`)
      .send({ noiDung: 'Mở', maGui: newSendId() });
    const paths = [
      toDoctor(),
      toDoctor(),
      `/chat/branches/${w.branchA}/messages`,
      `/chat/conversations/${(opened.body as SentBody).hoiThoaiId}/messages`,
    ];
    const pending = paths.map((path) =>
      upload(path, token, { data: pdf(), name: 'a.pdf' }).then((r) => r),
    );
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(4), {
      timeout: 10_000,
      interval: 20,
    });

    const busy = await upload(toDoctor(), token, {
      data: pdf(),
      name: 'b.pdf',
    });
    expectErrorResponse(busy, 503, 'CHAT_TAI_TEP_DANG_BAN');
    const textWhileBusy = await server()
      .post(toDoctor())
      .set('Authorization', `Bearer ${token}`)
      .send({ noiDung: 'Chữ', maGui: newSendId() });
    expect(textWhileBusy.status).toBe(201);

    gate.resolve();
    expect((await Promise.all(pending)).map((r) => r.status)).toEqual([
      201, 201, 201, 201,
    ]);
    const after = await upload(toDoctor(), token, {
      data: pdf(),
      name: 'c.pdf',
    });
    expect(after.status).toBe(201);
    expect((await storedKeys(root)).length).toBe(5);
  });
});

describe('chat B4 — quyền và log khi gửi tệp (QCH-12, BCH-01)', () => {
  it('QCH-12: gửi multipart vào hội thoại không thấy được (Bệnh nhân khác, Bác sĩ khác, Lễ tân chi nhánh khác) ⇒ 404 cùng thân; không tin, không tệp', async () => {
    const opened = await upload(
      `/chat/branches/${w.branchA}/messages`,
      await tokenOf(w.patientA),
      {
        data: pdf(),
        name: 'a.pdf',
      },
    );
    const inbox = (opened.body as SentBody).hoiThoaiId;
    const doctorChat = await upload(toDoctor(), await tokenOf(w.patientA), {
      data: pdf(),
      name: 'a.pdf',
    });
    const before = [await messageCount(), await storedKeys(root)];
    const cases: [ChatActor, string][] = [
      [w.patientB, inbox],
      [w.doctorB, (doctorChat.body as SentBody).hoiThoaiId],
      [w.receptionistB, inbox],
    ];
    for (const [actor, hoiThoaiId] of cases)
      expectErrorResponse(
        await upload(
          `/chat/conversations/${hoiThoaiId}/messages`,
          await tokenOf(actor),
          { data: pdf() },
        ),
        404,
        'KHONG_TIM_THAY',
      );
    expect([await messageCount(), await storedKeys(root)]).toEqual(before);
  });

  it('BCH-01: log của gửi tệp thành công, tệp sai, quá cỡ không có chữ của tin hay tên tệp', async () => {
    const token = await tokenOf(w.patientC);
    const logs = captureProcessOutput();
    await upload(
      toDoctor(),
      token,
      { data: pdf(), name: 'TenRiengTu.pdf' },
      { noiDung: 'NoiDungRiengTu', maGui: newSendId() },
    );
    await upload(
      toDoctor(),
      token,
      { data: fakePdf(), name: 'TenRiengTu2.pdf' },
      { noiDung: 'NoiDungRiengTu2', maGui: newSendId() },
    );
    await upload(toDoctor(), token, {
      data: pdf(CHAT_FILE_MAX_BYTES + 1),
      name: 'TenRiengTu3.pdf',
    });
    vi.restoreAllMocks();
    const output = logs.join('');
    expect(output).not.toContain('NoiDungRiengTu');
    expect(output).not.toContain('TenRiengTu');
  });
});
