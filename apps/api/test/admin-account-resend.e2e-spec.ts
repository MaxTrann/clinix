import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { ModulesContainer } from '@nestjs/core';
import request from 'supertest';
import { vi } from 'vitest';
import { AccountResendController } from '../src/admin/account-resend/account-resend.controller.js';
import {
  auditRowCount,
  pendingAdmin,
  pendingDoctor,
  pendingReceptionist,
} from '../src/admin/account-resend/testing/resend-world.js';
import {
  linkRowsOf,
  parseActivationMail,
} from '../src/admin/staff-activation/testing/activation-link-fixtures.js';
import { AdminFixtures } from '../src/admin/testing/admin-fixtures.js';
import { T0, at } from '../src/auth/testing/otp-int-helpers.js';
import {
  openRefreshHarness,
  type RefreshHarness,
} from '../src/auth/testing/refresh-http-helpers.js';
import { expectErrorResponse } from '../src/common/testing/error-assertions.js';
import { resetTables } from '../src/database/testing/test-database.js';
import { auditAdminControllers } from '../src/rbac/testing/admin-route-audit.js';

// Task B20 — "Gửi lại liên kết kích hoạt" qua HTTP THẬT: AppModule + Auth + C1 + B14 + B15 + B16 + MySQL thật, MailService giả (KHÔNG gửi email thật). Mã
// TKB20-nn là [đề xuất]; mã PLAN: TK-23, TK-40…49, NS-20, NS-34, PQ-01, PQ-02, PQ-11, PQ-13, SE-A13. Gọi HTTP, không nhập mã B15/B16 nào ngoài hàm thử.
const CREATE = '/admin/staff-accounts';
const VALIDATE = '/staff-activation/validate';
const COMPLETE = '/staff-activation/complete';
const HOUR = 3600;
const TTL_MS = 24 * HOUR * 1000;
const BIGINT_MAX = '9223372036854775807';

type Who =
  'system' | 'adminA' | 'adminB' | 'doctor' | 'receptionist' | 'patient';

let h: RefreshHarness;
let fx: AdminFixtures;
let branchA: Awaited<ReturnType<AdminFixtures['branch']>>;
let branchB: Awaited<ReturnType<AdminFixtures['branch']>>;
const token = {} as Record<Who, string>;

beforeAll(async () => {
  h = await openRefreshHarness();
});

beforeEach(async () => {
  await resetTables(h.db);
  h.mail.reset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  fx = new AdminFixtures(h.db);
  branchA = await fx.branch({ ten: 'Chi nhánh A' });
  branchB = await fx.branch({ ten: 'Chi nhánh B' });
  const issue = async (accountId: string): Promise<string> =>
    (await h.sessions.create(accountId)).accessToken;
  token.system = await issue((await fx.admin()).account.taiKhoanId);
  token.adminA = await issue((await fx.admin(branchA)).account.taiKhoanId);
  token.adminB = await issue((await fx.admin(branchB)).account.taiKhoanId);
  token.doctor = await issue((await fx.doctor(branchA)).account.taiKhoanId);
  token.receptionist = await issue(
    (await fx.receptionist(branchA)).account.taiKhoanId,
  );
  token.patient = await issue((await fx.patient()).account.taiKhoanId);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await h.close();
});

const url = (id: string): string => `/admin/accounts/${id}/resend-activation`;
const resend = (id: string, who: string | null = token.system) => {
  const call = request(h.app.getHttpServer()).post(url(id));
  if (who !== null) call.auth(who, { type: 'bearer' });
  return call;
};
const post = (path: string, body: unknown) =>
  request(h.app.getHttpServer())
    .post(path)
    .send(body as object);
/** Mật khẩu hợp lệ sinh lúc chạy (không ghi cứng chuỗi trông như bí mật). */
const newCredential = (): string => `${randomBytes(6).toString('hex')}Aa1!`;
const createReceptionist = (email: string) =>
  request(h.app.getHttpServer())
    .post(CREATE)
    .auth(token.system, { type: 'bearer' })
    .send({
      vaiTro: 'LeTan',
      hoTen: 'Đặng Thị Hạnh',
      email,
      soDienThoai: '0944556677',
      chiNhanhId: branchA.chiNhanhId,
    });
const linkCount = async (id: string): Promise<number> =>
  (await linkRowsOf(h.db, id)).length;

describe('TKB20-30 (TK-23, PQ-01, PQ-02) — vai trò và đăng nhập', () => {
  it('khách và token hỏng ⇒ 401; Bệnh nhân, Bác sĩ, Lễ tân ⇒ 403; thân lỗi chỉ maLoi và thongBao; không hàng mới, không thư', async () => {
    const target = await pendingReceptionist({ fx }, branchA);
    const id = target.taiKhoanId;
    expectErrorResponse(await resend(id, null), 401, 'CHUA_DANG_NHAP');
    expectErrorResponse(
      await resend(id, 'khong.phai.token'),
      401,
      'TOKEN_KHONG_HOP_LE',
    );
    for (const who of [token.patient, token.doctor, token.receptionist]) {
      const denied = await resend(id, who);
      expectErrorResponse(denied, 403, 'KHONG_DU_QUYEN');
      expect(Object.keys(denied.body as object).sort()).toEqual([
        'maLoi',
        'thongBao',
      ]);
    }
    expect(await linkCount(id)).toBe(0);
    expect(h.mail.attempts).toHaveLength(0);
  });
});

describe('TKB20-31 (TK-40, NS-20, NS-34) — Toàn hệ thống ⇒ 200 và LIÊN THÔNG với B15, B16', () => {
  it('tạo (B15) rồi gửi lại sau 61 giây: 200 đúng ba khoá, thân gửi kèm bị bỏ qua; token trong thư MỚI kích hoạt được rồi đăng nhập được; token CŨ ⇒ LIEN_KET_KHONG_HOP_LE', async () => {
    const email = 'gui.lai.b20@example.com';
    const created = await createReceptionist(email);
    expect(created.status).toBe(201);
    const id = (created.body as { taiKhoanId: string }).taiKhoanId;
    const oldLink = parseActivationMail(h.mail.sent[0]);
    // Tạo tài khoản (B15) tự ghi MỘT dòng audit `TaoTaiKhoanNhanSu`; "gửi lại" không được ghi thêm dòng nào
    const auditAfterCreate = await auditRowCount(h.db);
    vi.setSystemTime(at(61));

    // Thân gửi kèm (cố đổi email người nhận): không có @Body nên bị bỏ qua hoàn toàn
    const response = await resend(id).send({
      email: 'nguoi.khac@example.com',
      ghiChu: 'bỏ qua',
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      taiKhoanId: id,
      guiEmail: { ketQua: 'DaGui' },
      hanLienKet: new Date(at(61).getTime() + TTL_MS).toISOString(),
    });
    expect(Object.keys(response.body as object).sort()).toEqual([
      'guiEmail',
      'hanLienKet',
      'taiKhoanId',
    ]);
    expect(h.mail.sent.map((message) => message.to)).toEqual([email, email]);
    const newLink = parseActivationMail(h.mail.sent[1]);
    expect(newLink.id).not.toBe(oldLink.id);

    // Token CŨ không còn dùng được (NS-34); token MỚI dùng được (NS-20)
    expectErrorResponse(
      await post(VALIDATE, { id: oldLink.id, token: oldLink.token }),
      400,
      'LIEN_KET_KHONG_HOP_LE',
    );
    const validated = await post(VALIDATE, {
      id: newLink.id,
      token: newLink.token,
    });
    expect(validated.status).toBe(200);
    expect(validated.body).toEqual({ hopLe: true });

    const credential = newCredential();
    const done = await post(COMPLETE, {
      id: newLink.id,
      token: newLink.token,
      matKhauMoi: credential,
      xacNhan: credential,
    });
    expect(done.status).toBe(200);
    const session = await post('/auth/login', { email, matKhau: credential });
    expect(session.status).toBe(200);
    expect(await auditRowCount(h.db)).toBe(auditAfterCreate);
  });
});

describe('TKB20-32 (TK-41, TK-42) — thư lỗi: liên kết cũ GIỮ NGUYÊN; lần sau thành công', () => {
  it('thư lỗi ⇒ 200 ThatBai, hanLienKet null; token cũ VẪN dùng được, token của thư lỗi thì không; sau 61 giây gửi lại ⇒ DaGui và token cũ hết dùng', async () => {
    const email = 'thu.loi.b20@example.com';
    const created = await createReceptionist(email);
    const id = (created.body as { taiKhoanId: string }).taiKhoanId;
    const oldLink = parseActivationMail(h.mail.sent[0]);

    vi.setSystemTime(at(61));
    h.mail.failNextWith('TIMEOUT');
    const failed = await resend(id);
    expect(failed.status).toBe(200);
    expect(failed.body).toEqual({
      taiKhoanId: id,
      guiEmail: { ketQua: 'ThatBai', maLoi: 'GUI_MAIL_LOI' },
      hanLienKet: null,
    });
    const attempted = parseActivationMail(h.mail.attempts[1]);

    expect(
      (await post(VALIDATE, { id: oldLink.id, token: oldLink.token })).status,
    ).toBe(200);
    expectErrorResponse(
      await post(VALIDATE, { id: attempted.id, token: attempted.token }),
      400,
      'LIEN_KET_KHONG_HOP_LE',
    );

    vi.setSystemTime(at(122));
    const ok = await resend(id);
    expect(ok.status).toBe(200);
    expect((ok.body as { guiEmail: unknown }).guiEmail).toEqual({
      ketQua: 'DaGui',
    });
    expectErrorResponse(
      await post(VALIDATE, { id: oldLink.id, token: oldLink.token }),
      400,
      'LIEN_KET_KHONG_HOP_LE',
    );
    const newLink = parseActivationMail(h.mail.sent[1]);
    expect(
      (await post(VALIDATE, { id: newLink.id, token: newLink.token })).status,
    ).toBe(200);
  });
});

describe('TKB20-33 (TK-44, PQ-13) — Chi nhánh qua HTTP', () => {
  it('nhân sự chi nhánh mình ⇒ 200; Bệnh nhân có lịch tại chi nhánh ⇒ 403; chi nhánh khác, Quản trị viên chờ kích hoạt, id không tồn tại ⇒ cùng 404 (cùng thân, cùng content-type)', async () => {
    const doctorA = await pendingDoctor({ fx }, branchA);
    const doctorB = await pendingDoctor({ fx }, branchB);
    const adminPending = await pendingAdmin({ fx });
    const patient = await fx.patient();
    const doctorProfile = await fx.doctor(branchA);
    const shift = await fx.shift(doctorProfile.profile);
    const slot = await fx.slot(shift);
    await fx.appointment(
      doctorProfile.profile,
      slot,
      patient.account.taiKhoanId,
    );

    const ok = await resend(doctorA.taiKhoanId, token.adminA);
    expect(ok.status).toBe(200);
    expect((ok.body as { guiEmail: unknown }).guiEmail).toEqual({
      ketQua: 'DaGui',
    });
    expectErrorResponse(
      await resend(patient.account.taiKhoanId, token.adminA),
      403,
      'KHONG_DU_QUYEN',
    );

    const missing = await resend(BIGINT_MAX, token.adminA);
    const missingBody = expectErrorResponse(missing, 404, 'KHONG_TIM_THAY');
    const hidden = [
      await resend(doctorB.taiKhoanId, token.adminA),
      await resend(adminPending.taiKhoanId, token.adminA),
      await resend(doctorA.taiKhoanId, token.adminB),
    ];
    for (const response of hidden) {
      expectErrorResponse(response, 404, 'KHONG_TIM_THAY');
      expect(response.body).toEqual(missingBody);
      expect(response.headers['content-type']).toBe(
        missing.headers['content-type'],
      );
    }
    expect(await linkCount(doctorB.taiKhoanId)).toBe(0);
    expect(await linkCount(adminPending.taiKhoanId)).toBe(0);
    expect(h.mail.attempts).toHaveLength(1);
  });
});

describe('TKB20-34 (TK-43, TK-47) — 429, 409 và id sai dạng', () => {
  it('429 sau 59 giây (chiTiet.soGiayCho số nguyên), 409 với tài khoản đã kích hoạt; :id sai dạng ⇒ 400 MA_TAI_KHOAN_KHONG_HOP_LE; GET vào đường dẫn ⇒ 404; không hàng mới ở các nhánh lỗi', async () => {
    const created = await createReceptionist('qua.som.b20@example.com');
    const id = (created.body as { taiKhoanId: string }).taiKhoanId;
    const auditAfterCreate = await auditRowCount(h.db); // dòng audit của B15 lúc tạo; B20 không thêm dòng nào
    vi.setSystemTime(at(59));
    const tooSoon = await resend(id);
    const body = expectErrorResponse(tooSoon, 429, 'GUI_LAI_QUA_SOM');
    expect(body.thongBao).toBe('Vui lòng thử lại sau.');
    expect(body.chiTiet).toEqual({ soGiayCho: 1 });
    expect(
      Number.isInteger((body.chiTiet as { soGiayCho: number }).soGiayCho),
    ).toBe(true);
    expect(await linkCount(id)).toBe(1);
    expect(h.mail.attempts).toHaveLength(1);

    const active = (await fx.doctor(branchA)).account;
    const notPending = expectErrorResponse(
      await resend(active.taiKhoanId),
      409,
      'TAI_KHOAN_KHONG_CHO_KICH_HOAT',
    );
    expect(notPending.chiTiet).toBeUndefined();
    expect(await linkCount(active.taiKhoanId)).toBe(0);

    for (const bad of [
      '0',
      '-1',
      'abc',
      '1e3',
      '01',
      '9223372036854775808',
      '%20',
    ]) {
      const response = await resend(bad);
      const error = expectErrorResponse(response, 400, 'DU_LIEU_KHONG_HOP_LE');
      expect(error.loi?.map((item) => item.ma)).toContain(
        'MA_TAI_KHOAN_KHONG_HOP_LE',
      );
    }
    expectErrorResponse(
      await request(h.app.getHttpServer())
        .get(url(id))
        .auth(token.system, { type: 'bearer' }),
      404,
      'KHONG_TIM_THAY',
    );
    expect(await linkCount(id)).toBe(1);
    expect(await auditRowCount(h.db)).toBe(auditAfterCreate);
  });
});

describe('TKB20-35 (SE-A13, H6, NS-21) — không lộ bí mật', () => {
  it('không đặt cookie; phản hồi (thành công, thư lỗi, lỗi) và log trong lúc chạy không chứa token, URL kích hoạt, băm liên kết, email người nhận hay token phiên', async () => {
    const email = 'khong.lo.b20@example.com';
    const created = await createReceptionist(email);
    const id = (created.body as { taiKhoanId: string }).taiKhoanId;
    const captured: string[] = [];
    const spies = (['stdout', 'stderr'] as const).map((name) => {
      const original = process[name].write.bind(process[name]) as (
        ...args: unknown[]
      ) => boolean;
      process[name].write = ((chunk: unknown, ...rest: unknown[]) => {
        captured.push(
          typeof chunk === 'string'
            ? chunk
            : Buffer.from(chunk as Uint8Array).toString('utf8'),
        );
        return original(chunk, ...rest);
      }) as typeof process.stdout.write;
      return { name, original };
    });
    const responses = [];
    try {
      vi.setSystemTime(at(61));
      responses.push(await resend(id)); // thành công
      vi.setSystemTime(at(122));
      h.mail.failNextWith('CONNECTION');
      responses.push(await resend(id)); // thư lỗi
      responses.push(await resend(id)); // 429 (hàng gửi lỗi vẫn tính)
      responses.push(await resend(id, token.doctor)); // 403
      responses.push(await resend(BIGINT_MAX)); // 404
    } finally {
      for (const spy of spies)
        process[spy.name].write =
          spy.original as unknown as typeof process.stdout.write;
    }

    const secrets: string[] = [];
    for (const message of h.mail.attempts) {
      const link = parseActivationMail(message);
      secrets.push(link.token, link.url);
    }
    for (const row of await linkRowsOf(h.db, id)) secrets.push(row.maBam);
    expect(secrets.length).toBeGreaterThanOrEqual(6);

    for (const response of responses) {
      expect(response.headers['set-cookie']).toBeUndefined();
      for (const secret of [...secrets, email])
        expect(response.text).not.toContain(secret);
      expect(response.text).not.toMatch(/kich-hoat|argon2|mat_?khau|ma_?bam/i);
    }
    const log = captured.join('');
    for (const secret of [...secrets, email, ...Object.values(token)])
      expect(log).not.toContain(secret);
    expect(log).not.toContain('kich-hoat#');
  });
});

describe('TKB20-36 (PQ-11) — bộ quét controller admin', () => {
  it('controller có trong sổ tuyến module graph và bộ quét duyệt TOÀN BỘ controller admin không báo lỗi', () => {
    const controllers = [...h.app.get(ModulesContainer).values()].flatMap(
      (module) =>
        [...module.controllers.values()].flatMap((wrapper) =>
          wrapper.metatype ? [wrapper.metatype] : [],
        ),
    );
    expect(controllers).toContain(AccountResendController);
    expect(controllers.map((item) => item.name)).toContain('AccountController');
    expect(auditAdminControllers(controllers)).toEqual([]);
  });
});

describe('TKB20-37 (TK-49) — chéo auth: nhân sự chờ kích hoạt không dùng được "Quên mật khẩu"', () => {
  it('POST /auth/forgot-password với email nhân sự ChoKichHoat ⇒ 403 TAI_KHOAN_CHUA_KICH_HOAT, không thư', async () => {
    const created = await createReceptionist('quen.mk.b20@example.com');
    expect(created.status).toBe(201);
    h.mail.reset();
    const response = await post('/auth/forgot-password', {
      email: 'quen.mk.b20@example.com',
    });
    expectErrorResponse(response, 403, 'TAI_KHOAN_CHUA_KICH_HOAT');
    expect(h.mail.attempts).toHaveLength(0);
  });
});
