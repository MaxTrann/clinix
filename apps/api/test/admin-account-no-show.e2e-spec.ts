import 'reflect-metadata';
import { ModulesContainer } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AccountNoShowController } from '../src/admin/account-no-show/account-no-show.controller.js';
import {
  accountNotPatient,
  accountStateNotAllowed,
} from '../src/admin/account-no-show/account-no-show.errors.js';
import {
  SENTINELS,
  buildAccountWorld,
  type AccountWorld,
} from '../src/admin/accounts/testing/account-world.js';
import { findSecretLeaks } from '../src/admin/accounts/testing/secret-leak.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { SessionService } from '../src/auth/session/session.service.js';
import { expectErrorResponse } from '../src/common/testing/error-assertions.js';
import { resetTables } from '../src/database/testing/test-database.js';
import { auditAdminControllers } from '../src/rbac/testing/admin-route-audit.js';

type Pair = { account: { taiKhoanId: string } };
type Who =
  'system' | 'adminA' | 'adminB' | 'lockedPatient' | 'doctor' | 'receptionist';

const idOf = (value: Pair | { taiKhoanId: string }): string =>
  'account' in value ? value.account.taiKhoanId : value.taiKhoanId;
const BIGINT_MAX = '9223372036854775807';

describe('B19 TK — mở khoá no-show qua HTTP: AppModule + Auth + C1 + MySQL thật', () => {
  let app: NestExpressApplication;
  let db: DataSource;
  let sessions: SessionService;
  let w: AccountWorld;
  const token = {} as Record<Who, string>;

  const url = (id: string) => `/admin/accounts/${id}/unlock-no-show`;
  const unlock = (id: string, who: string | null = token.system) => {
    const call = request(app.getHttpServer()).post(url(id));
    if (who !== null) call.auth(who, { type: 'bearer' });
    return call;
  };
  const flagOf = async (id: string) => {
    const rows: { khoa: number; soLan: number }[] = await db.query(
      'SELECT khoa_dat_lich_do_no_show AS khoa, so_lan_no_show AS soLan FROM benh_nhan WHERE tai_khoan_id = ?',
      [id],
    );
    return rows[0];
  };
  const auditCount = async (): Promise<number> => {
    const rows: { total: string | number }[] = await db.query(
      'SELECT COUNT(*) AS total FROM nhat_ky_hanh_dong',
    );
    return Number(rows[0]!.total);
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    db = app.get(DataSource);
    sessions = app.get(SessionService);
  });
  afterAll(async () => app?.close());

  // Mỗi ca có thể đổi DB: dựng lại thế giới và cấp lại token trước từng ca.
  beforeEach(async () => {
    await resetTables(db);
    w = await buildAccountWorld(db);
    const issue = async (pair: Pair) =>
      (await sessions.create(pair.account.taiKhoanId)).accessToken;
    token.system = await issue(w.sysAdmin);
    token.adminA = await issue(w.adminA);
    token.adminB = await issue(w.adminB);
    token.lockedPatient = await issue(w.lockedA);
    token.doctor = await issue(w.doctorA);
    token.receptionist = await issue(w.receptionistA);
  });

  it('TKB19-30 (TK-23, PQ-01, PQ-02) khách và token hỏng ⇒ 401; Bệnh nhân (kể cả CHÍNH Bệnh nhân bị khoá), Bác sĩ, Lễ tân ⇒ 403; thân lỗi chỉ maLoi và thongBao; cờ không đổi', async () => {
    const id = idOf(w.lockedA);
    expectErrorResponse(await unlock(id, null), 401, 'CHUA_DANG_NHAP');
    expectErrorResponse(
      await unlock(id, 'khong.phai.token'),
      401,
      'TOKEN_KHONG_HOP_LE',
    );
    for (const who of [token.lockedPatient, token.doctor, token.receptionist]) {
      const denied = await unlock(id, who);
      expectErrorResponse(denied, 403, 'KHONG_DU_QUYEN');
      expect(Object.keys(denied.body as object).sort()).toEqual([
        'maLoi',
        'thongBao',
      ]);
    }
    expect(await flagOf(id)).toEqual({ khoa: 1, soLan: 3 });
    expect(await auditCount()).toBe(0);
  });

  it('TKB19-31 (TK-30) Toàn hệ thống ⇒ 200 đúng ba khoá; đọc lại bằng chi tiết khớp; thân gửi kèm bị bỏ qua', async () => {
    const id = idOf(w.lockedA);
    // Thân cố ép giá trị cờ và số lần: không có @Body nên bị bỏ qua hoàn toàn.
    const response = await unlock(id)
      .send({ khoaDatLichDoNoShow: true, soLanNoShow: 0 })
      .expect(200);
    expect(response.body).toEqual({
      taiKhoanId: id,
      khoaDatLichDoNoShow: false,
      soLanNoShow: 3,
    });
    expect(Object.keys(response.body as object)).toHaveLength(3);
    expect(await flagOf(id)).toEqual({ khoa: 0, soLan: 3 });
    expect(await auditCount()).toBe(1);

    const detail = (
      await request(app.getHttpServer())
        .get(`/admin/accounts/${id}`)
        .auth(token.system, { type: 'bearer' })
        .expect(200)
    ).body as Record<string, unknown>;
    expect(detail).toMatchObject({
      taiKhoanId: id,
      khoaDatLichDoNoShow: false,
      soLanNoShow: 3,
      trangThai: 'DangHoatDong',
    });
  });

  it('TKB19-32 (TK-33, PQ-13) Chi nhánh: thấy được ⇒ 403; ngoài tầm nhìn, không tồn tại, Quản trị viên ⇒ cùng 404 (cùng thân, cùng content-type); DB không đổi', async () => {
    for (const target of [w.lockedA, w.onlyA, w.doctorA, w.receptionistA])
      expectErrorResponse(
        await unlock(idOf(target), token.adminA),
        403,
        'KHONG_DU_QUYEN',
      );

    const missing = await unlock(BIGINT_MAX, token.adminA);
    const missingBody = expectErrorResponse(missing, 404, 'KHONG_TIM_THAY');
    const hidden = [
      await unlock(idOf(w.onlyB), token.adminA),
      await unlock(idOf(w.doctorB), token.adminA),
      await unlock(idOf(w.none), token.adminA),
      await unlock(idOf(w.sysAdmin), token.adminA),
      await unlock(idOf(w.adminA), token.adminA),
      await unlock(idOf(w.lockedA), token.adminB),
    ];
    for (const response of hidden) {
      expectErrorResponse(response, 404, 'KHONG_TIM_THAY');
      expect(response.body).toEqual(missingBody);
      expect(response.headers['content-type']).toBe(
        missing.headers['content-type'],
      );
    }
    expect(await flagOf(idOf(w.lockedA))).toEqual({ khoa: 1, soLan: 3 });
    expect(await auditCount()).toBe(0);
  });

  it('TKB19-33 (TK-31, TK-32) 409 và 400 qua HTTP; :id sai dạng ⇒ 400 MA_TAI_KHOAN_KHONG_HOP_LE; GET vào đường dẫn mở khoá không đổi gì', async () => {
    for (const target of [w.onlyA, w.unverified]) {
      const response = await unlock(idOf(target));
      expectErrorResponse(response, 409, 'TRANG_THAI_KHONG_PHU_HOP');
      expect(response.body).toEqual(accountStateNotAllowed().getResponse());
    }
    const notPatient = await unlock(idOf(w.doctorA));
    expectErrorResponse(notPatient, 400, 'DU_LIEU_KHONG_HOP_LE');
    expect(notPatient.body).toEqual(accountNotPatient().getResponse());

    for (const bad of [
      '0',
      '-1',
      'abc',
      '1e3',
      '01',
      '9223372036854775808',
      '%20',
    ]) {
      const response = await unlock(bad);
      const body = expectErrorResponse(response, 400, 'DU_LIEU_KHONG_HOP_LE');
      expect(body.loi?.map((item) => item.ma)).toContain(
        'MA_TAI_KHOAN_KHONG_HOP_LE',
      );
    }

    // `GET` không phải thao tác mở khoá: không có route, và cờ không đổi.
    const get = await request(app.getHttpServer())
      .get(url(idOf(w.lockedA)))
      .auth(token.system, { type: 'bearer' });
    expectErrorResponse(get, 404, 'KHONG_TIM_THAY');
    expect(await flagOf(idOf(w.lockedA))).toEqual({ khoa: 1, soLan: 3 });
    expect(await auditCount()).toBe(0);
  });

  it('TKB19-34 (SE-A13, SE-A15) không đặt cookie; phản hồi (thành công và lỗi) và log trong lúc chạy không chứa chuỗi mồi bí mật hay token', async () => {
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
    try {
      const ok = await unlock(idOf(w.lockedA));
      const errors = [
        await unlock(idOf(w.onlyA)),
        await unlock(idOf(w.doctorA)),
        await unlock(idOf(w.onlyB), token.adminA),
        await unlock(idOf(w.lockedA), token.adminA),
        await unlock(idOf(w.lockedA), token.doctor),
      ];
      for (const response of [ok, ...errors]) {
        expect(response.headers['set-cookie']).toBeUndefined();
        expect(findSecretLeaks(response.body, SENTINELS)).toEqual([]);
        expect(response.text).not.toMatch(/argon2|mat_?khau|ma_?bam/i);
      }
    } finally {
      for (const spy of spies)
        process[spy.name].write =
          spy.original as unknown as typeof process.stdout.write;
    }
    const log = captured.join('');
    for (const secret of [...SENTINELS, ...Object.values(token)])
      expect(log).not.toContain(secret);
  });

  it('TKB19-35 (PQ-11) controller có trong sổ tuyến module graph và bộ quét duyệt TOÀN BỘ controller admin không báo lỗi', () => {
    const controllers = [...app.get(ModulesContainer).values()].flatMap(
      (module) =>
        [...module.controllers.values()].flatMap((wrapper) =>
          wrapper.metatype ? [wrapper.metatype] : [],
        ),
    );
    expect(controllers).toContain(AccountNoShowController);
    expect(controllers.map((item) => item.name)).toContain('AccountController');
    expect(auditAdminControllers(controllers)).toEqual([]);
  });
});
