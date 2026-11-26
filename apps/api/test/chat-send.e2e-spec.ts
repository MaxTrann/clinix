import request from 'supertest';
import { vi } from 'vitest';
import { T0 } from './../src/auth/testing/otp-int-helpers.js';
import {
  openRefreshHarness,
  type RefreshHarness,
} from './../src/auth/testing/refresh-http-helpers.js';
import type { ChatActor } from './../src/chat/core/chat-access.policy.js';
import { MessageRepository } from './../src/chat/core/message.repository.js';
import {
  buildChatWorld,
  newSendId,
  type ChatWorld,
} from './../src/chat/testing/chat-world.js';
import { expectErrorResponse } from './../src/common/testing/error-assertions.js';
import { resetTables } from './../src/database/testing/test-database.js';
import { captureProcessOutput } from './../src/patient/testing/relatives-update-helpers.js';

// chat B3 — gửi tin và bắt đầu hội thoại qua HTTP THẬT (AppModule + MySQL thật + configureApp như main.ts; PLAN chat 5.6, 7.1, 7.2, 7.3, 7.5, 7.10):
// NBS-01, NBS-03, NBS-08, NLE-06, NLE-08, NLE-09, NBN-02, QCH-06, QCH-09, QCH-12, BCH-02, BCH-06 (và BCH-05, QCH-01 cho các route mới).
// Hành vi DB chi tiết (trùng hội thoại, bên kia ngưng, hoàn tác, chi nhánh mặc định, dòng thành viên Lễ tân) ở chat/rest/chat-send.int-spec.ts.
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
const text = (noiDung = 'Xin chào bác sĩ') => ({ noiDung, maGui: newSendId() });
const count = async (sql: string, params: unknown[] = []) =>
  Number(((await h.db.query(sql, params)) as { n: string }[])[0]?.n ?? 0);
const tableCounts = async () => [
  await count('SELECT COUNT(*) AS n FROM hoi_thoai'),
  await count('SELECT COUNT(*) AS n FROM tai_khoan_hoi_thoai'),
  await count('SELECT COUNT(*) AS n FROM tin_nhan'),
];
interface SentBody {
  hoiThoaiId: string;
  tinNhan: { id: string; nguoiGui: { vaiTro: string; tenHienThi: string } };
}

describe('chat B3 — gửi và bắt đầu hội thoại qua HTTP', () => {
  it('NBS-01, BCH-05: Bệnh nhân CHƯA từng đặt lịch gửi tin đầu tới bác sĩ ⇒ 201; đúng một hội thoại BenhNhan_BacSi, chi_nhanh_id trống, hai thành viên, một tin; gửi lại cùng mã ⇒ 200 cùng thân', async () => {
    const token = await tokenOf(w.patientC);
    const body = text();
    const res = await post(
      `/chat/doctors/${w.doctorA.taiKhoanId}/messages`,
      body,
      token,
    );
    expect(res.status).toBe(201);
    expect(res.headers['cache-control']).toBe('no-store');
    const sent = res.body as SentBody;
    expect(Object.keys(sent).sort()).toEqual(['hoiThoaiId', 'tinNhan']);
    expect(sent.tinNhan).toMatchObject({
      laCuaToi: true,
      maGui: body.maGui,
      noiDung: body.noiDung,
      tep: null,
    });
    const rows = (await h.db.query(
      'SELECT loai, chi_nhanh_id AS chiNhanhId, nguoi_tao_id AS nguoiTaoId FROM hoi_thoai',
    )) as { loai: string; chiNhanhId: string | null; nguoiTaoId: string }[];
    expect(rows).toEqual([
      {
        loai: 'BenhNhan_BacSi',
        chiNhanhId: null,
        nguoiTaoId: w.patientC.taiKhoanId,
      },
    ]);
    expect(await tableCounts()).toEqual([1, 2, 1]);

    const again = await post(
      `/chat/doctors/${w.doctorA.taiKhoanId}/messages`,
      body,
      token,
    );
    expect([again.status, again.body]).toEqual([200, res.body]);
    expect(await tableCounts()).toEqual([1, 2, 1]);
  });

  it('NBS-03: GET /chat/doctors/:id TRƯỚC khi nhắn ⇒ hoiThoaiId null, không dòng nào được tạo; sau tin đầu ⇒ đúng hoiThoaiId', async () => {
    const token = await tokenOf(w.patientC);
    const before = await get(`/chat/doctors/${w.doctorA.taiKhoanId}`, token);
    expect(before.status).toBe(200);
    expect(before.headers['cache-control']).toBe('no-store');
    expect(before.body).toEqual({
      hoiThoaiId: null,
      loai: 'BenhNhan_BacSi',
      doiTac: { vaiTro: 'BacSi', tenHienThi: 'BS. Bác sĩ A một' },
      quanHe: 'ChuaTungKham',
      banner: true,
      coTheGui: true,
      lyDoKhongGui: null,
    });
    expect(await tableCounts()).toEqual([0, 0, 0]);
    const sent = (
      await post(
        `/chat/doctors/${w.doctorA.taiKhoanId}/messages`,
        text(),
        token,
      )
    ).body as SentBody;
    const after = await get(`/chat/doctors/${w.doctorA.taiKhoanId}`, token);
    expect((after.body as { hoiThoaiId: string }).hoiThoaiId).toBe(
      sent.hoiThoaiId,
    );
    // Bệnh nhân A có lịch DaXacNhan với bác sĩ A (thế giới thử) ⇒ đã từng khám
    const known = await get(
      `/chat/doctors/${w.doctorA.taiKhoanId}`,
      await tokenOf(w.patientA),
    );
    expect((known.body as { quanHe: string }).quanHe).toBe('DaTungKham');
  });

  it('NBS-08: bacSiId không tồn tại, là tài khoản không phải bác sĩ, bác sĩ thiếu hồ sơ, hay sai dạng ⇒ 404 CÙNG thân ở GET và POST; không ghi gì', async () => {
    const token = await tokenOf(w.patientC);
    const reference = expectErrorResponse(
      await get('/chat/doctors/999999999', token),
      404,
      'KHONG_TIM_THAY',
    );
    const ids = [
      '999999999',
      w.patientA.taiKhoanId,
      w.receptionistA.taiKhoanId,
      w.brokenDoctorId,
      'abc',
      '0',
      '-1',
      '1'.repeat(21),
    ];
    for (const id of ids) {
      for (const res of [
        await get(`/chat/doctors/${id}`, token),
        await post(`/chat/doctors/${id}/messages`, text(), token),
      ])
        expect(expectErrorResponse(res, 404, 'KHONG_TIM_THAY'), id).toEqual(
          reference,
        );
    }
    expect(await tableCounts()).toEqual([0, 0, 0]);
  });

  it('NLE-06: tin đầu tới một chi nhánh ⇒ hội thoại BenhNhan_LeTan có chi_nhanh_id, thành viên CHỈ Bệnh nhân; GET chi nhánh trả "Lễ tân · {chi nhánh}"', async () => {
    const token = await tokenOf(w.patientC);
    const header = await get(`/chat/branches/${w.branchA}`, token);
    expect(header.body).toEqual({
      hoiThoaiId: null,
      loai: 'BenhNhan_LeTan',
      doiTac: { vaiTro: 'LeTan', tenHienThi: 'Lễ tân · Chi nhánh A' },
      quanHe: null,
      banner: false,
      coTheGui: true,
      lyDoKhongGui: null,
    });
    const res = await post(
      `/chat/branches/${w.branchA}/messages`,
      text('Cho hỏi giờ mở cửa'),
      token,
    );
    expect(res.status).toBe(201);
    const hoiThoaiId = (res.body as SentBody).hoiThoaiId;
    expect(
      await h.db.query(
        'SELECT loai, chi_nhanh_id AS chiNhanhId FROM hoi_thoai WHERE hoi_thoai_id = ?',
        [hoiThoaiId],
      ),
    ).toEqual([{ loai: 'BenhNhan_LeTan', chiNhanhId: w.branchA }]);
    const members = (await h.db.query(
      'SELECT tai_khoan_id AS id FROM tai_khoan_hoi_thoai WHERE hoi_thoai_id = ?',
      [hoiThoaiId],
    )) as { id: string }[];
    expect(members.map((m) => String(m.id))).toEqual([w.patientC.taiKhoanId]);
  });

  it('NLE-08: chi nhánh không tồn tại hay sai dạng ⇒ 404 cùng thân ở GET và POST; không ghi gì', async () => {
    const token = await tokenOf(w.patientC);
    const reference = expectErrorResponse(
      await get('/chat/branches/999999999', token),
      404,
      'KHONG_TIM_THAY',
    );
    for (const id of ['999999999', 'abc', '0'])
      for (const res of [
        await get(`/chat/branches/${id}`, token),
        await post(`/chat/branches/${id}/messages`, text(), token),
      ])
        expect(expectErrorResponse(res, 404, 'KHONG_TIM_THAY'), id).toEqual(
          reference,
        );
    expect(await tableCounts()).toEqual([0, 0, 0]);
  });

  it('NLE-09: Bệnh nhân đọc tin Lễ tân trả lời ⇒ tenHienThi "Lễ tân · {chi nhánh}"; không họ tên, không id Lễ tân ở bất kỳ khoá nào', async () => {
    const patientToken = await tokenOf(w.patientA);
    const opened = (
      await post(`/chat/branches/${w.branchA}/messages`, text(), patientToken)
    ).body as SentBody;
    const reply = await post(
      `/chat/conversations/${opened.hoiThoaiId}/messages`,
      text('Chào bạn'),
      await tokenOf(w.receptionistA),
    );
    expect(reply.status).toBe(201);
    const views = await Promise.all([
      get(`/chat/conversations/${opened.hoiThoaiId}/messages`, patientToken),
      get('/chat/conversations', patientToken),
      get(`/chat/conversations/${opened.hoiThoaiId}`, patientToken),
    ]);
    const items =
      (views[0]?.body as { items?: SentBody['tinNhan'][] } | undefined)
        ?.items ?? [];
    expect(items[1]?.nguoiGui).toEqual({
      vaiTro: 'LeTan',
      tenHienThi: 'Lễ tân · Chi nhánh A',
    });
    const raw = JSON.stringify(views.map((v) => v.body as unknown));
    const reception = w.accounts.receptionistA.account;
    expect(raw).not.toContain(reception.hoTen);
    expect(raw).not.toContain(`"${reception.taiKhoanId}"`);
    expect(raw).not.toContain(reception.email);
  });

  it('NBN-02, QCH-06: Bác sĩ, Lễ tân, Quản trị viên gọi /chat/doctors, /chat/branches (GET và POST), /chat/default-branch ⇒ 403; không route nào cho họ tạo hội thoại', async () => {
    const actors = [
      w.doctorA.taiKhoanId,
      w.receptionistA.taiKhoanId,
      w.accounts.sysAdmin.account.taiKhoanId,
      w.accounts.adminA.account.taiKhoanId,
    ];
    for (const id of actors) {
      const token = await tokenOf(id);
      const all = [
        await get(`/chat/doctors/${w.doctorB.taiKhoanId}`, token),
        await post(
          `/chat/doctors/${w.doctorB.taiKhoanId}/messages`,
          text(),
          token,
        ),
        await get(`/chat/branches/${w.branchA}`, token),
        await post(`/chat/branches/${w.branchA}/messages`, text(), token),
        await get('/chat/default-branch', token),
        await post('/chat/doctors/abc/messages', text(), token),
      ];
      for (const res of all) {
        expectErrorResponse(res, 403, 'KHONG_DU_QUYEN');
        expect(res.headers['cache-control']).toBe('no-store');
      }
    }
    expect(await tableCounts()).toEqual([0, 0, 0]);
  });

  it('QCH-01: các route mới không token ⇒ 401 CHUA_DANG_NHAP, có no-store; default-branch của Bệnh nhân ⇒ 200', async () => {
    for (const res of [
      await get(`/chat/doctors/${w.doctorA.taiKhoanId}`),
      await post(`/chat/doctors/${w.doctorA.taiKhoanId}/messages`, text()),
      await get(`/chat/branches/${w.branchA}`),
      await post(`/chat/branches/${w.branchA}/messages`, text()),
      await post('/chat/conversations/1/messages', text()),
      await get('/chat/default-branch'),
    ]) {
      expectErrorResponse(res, 401, 'CHUA_DANG_NHAP');
      expect(res.headers['cache-control']).toBe('no-store');
    }
    const res = await get('/chat/default-branch', await tokenOf(w.patientA));
    expect([res.status, res.body]).toEqual([
      200,
      { chiNhanhId: w.branchA, nguon: 'LichHenSapToi' },
    ]);
  });

  it('QCH-09: thân có taiKhoanId, chiNhanhId, bacSiId, hoiThoaiId hay trường lạ ⇒ 400 DU_LIEU_KHONG_HOP_LE với TRUONG_KHONG_DUOC_PHEP; không ghi gì', async () => {
    const token = await tokenOf(w.patientC);
    for (const extra of [
      'taiKhoanId',
      'chiNhanhId',
      'bacSiId',
      'hoiThoaiId',
      'laCuaToi',
    ]) {
      const res = await post(
        `/chat/doctors/${w.doctorA.taiKhoanId}/messages`,
        { ...text(), [extra]: '1' },
        token,
      );
      const body = expectErrorResponse(res, 400, 'DU_LIEU_KHONG_HOP_LE');
      expect(body.loi, extra).toEqual([
        { truong: extra, ma: 'TRUONG_KHONG_DUOC_PHEP' },
      ]);
    }
    expect(await tableCounts()).toEqual([0, 0, 0]);
  });

  it('QCH-12: gửi vào hội thoại KHÔNG thấy được, đủ ba vai trò ⇒ 404 cùng thân; không ghi tin', async () => {
    const patientToken = await tokenOf(w.patientA);
    const doctorConv = (
      (
        await post(
          `/chat/doctors/${w.doctorA.taiKhoanId}/messages`,
          text(),
          patientToken,
        )
      ).body as SentBody
    ).hoiThoaiId;
    const inbox = (
      (await post(`/chat/branches/${w.branchA}/messages`, text(), patientToken))
        .body as SentBody
    ).hoiThoaiId;
    const before = await tableCounts();
    const reference = expectErrorResponse(
      await post(
        '/chat/conversations/999999999/messages',
        text(),
        patientToken,
      ),
      404,
      'KHONG_TIM_THAY',
    );
    const outsiders: [string, ChatActor, string][] = [
      ['Bệnh nhân khác, hội thoại bác sĩ', w.patientB, doctorConv],
      ['Bệnh nhân khác, hộp thư', w.patientB, inbox],
      ['bác sĩ khác', w.doctorB, doctorConv],
      ['bác sĩ vào hộp thư chung', w.doctorA, inbox],
      ['Lễ tân chi nhánh khác', w.receptionistB, inbox],
      ['Lễ tân vào hội thoại bác sĩ', w.receptionistA, doctorConv],
    ];
    for (const [label, actor, id] of outsiders) {
      const res = await post(
        `/chat/conversations/${id}/messages`,
        text(),
        await tokenOf(actor),
      );
      expect(expectErrorResponse(res, 404, 'KHONG_TIM_THAY'), label).toEqual(
        reference,
      );
    }
    expect(await tableCounts()).toEqual(before);
  });

  it('BCH-06: thân lỗi (nội dung quá dài, trống, bên kia ngưng, mã gửi dùng lại) KHÔNG lặp lại nội dung đã gửi', async () => {
    const token = await tokenOf(w.patientC);
    const marker = 'NOIDUNGBIMAT';
    const tooLong = await post(
      `/chat/doctors/${w.doctorA.taiKhoanId}/messages`,
      text(marker + 'x'.repeat(2000)),
      token,
    );
    expect(
      expectErrorResponse(tooLong, 400, 'DU_LIEU_KHONG_HOP_LE').loi,
    ).toEqual([{ truong: 'noiDung', ma: 'NOI_DUNG_QUA_DAI' }]);
    const blank = await post(
      `/chat/doctors/${w.doctorA.taiKhoanId}/messages`,
      text(' \n '),
      token,
    );
    expect(expectErrorResponse(blank, 400, 'DU_LIEU_KHONG_HOP_LE').loi).toEqual(
      [{ truong: 'noiDung', ma: 'NOI_DUNG_TRONG' }],
    );
    const inactive = await post(
      `/chat/doctors/${w.pendingDoctorId}/messages`,
      text(marker),
      token,
    );
    expectErrorResponse(inactive, 409, 'CHAT_NGUOI_NHAN_KHONG_HOAT_DONG');
    const used = text(marker);
    await post(`/chat/branches/${w.branchA}/messages`, used, token);
    const reused = await post(
      `/chat/branches/${w.branchA}/messages`,
      { ...used, noiDung: `${marker} khác` },
      token,
    );
    expectErrorResponse(reused, 409, 'CHAT_MA_GUI_DA_DUNG');
    for (const res of [tooLong, blank, inactive, reused]) {
      expect(JSON.stringify(res.body)).not.toContain(marker);
      expect(res.headers['cache-control']).toBe('no-store');
    }
  });

  it('BCH-02: ép lỗi DB khi gửi (thông điệp lỗi của driver CHÉP nội dung tin) ⇒ 500 LOI_HE_THONG chung; thân và log không có nội dung tin', async () => {
    const marker = 'NOIDUNGBIMAT2';
    vi.spyOn(MessageRepository.prototype, 'insert').mockRejectedValue(
      Object.assign(
        new Error(
          `Incorrect string value: '${marker}' for column 'noi_dung' at row 1`,
        ),
        {
          code: 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD',
          errno: 1366,
          sqlState: 'HY000',
        },
      ),
    );
    const token = await tokenOf(w.patientC);
    const logs = captureProcessOutput();
    const res = await post(
      `/chat/doctors/${w.doctorA.taiKhoanId}/messages`,
      text(marker),
      token,
    );
    vi.restoreAllMocks();
    const body = expectErrorResponse(res, 500, 'LOI_HE_THONG');
    expect(JSON.stringify(res.body)).not.toContain(marker);
    const output = logs.join('');
    expect(output).toContain(body.requestId); // dòng log ERROR của đúng yêu cầu này đã được bắt
    expect(output).toContain('ChatInternalError');
    expect(output).toContain('errno=1366');
    expect(output).not.toContain(marker);
    expect(await tableCounts()).toEqual([0, 0, 0]);
  });
});
