import 'reflect-metadata';
import { ModulesContainer } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AccountLockController } from '../src/admin/account-lock/account-lock.controller.js';
import {
  auditRows,
  setState,
  snapshot,
  stateOf,
  sessionsOf,
} from '../src/admin/account-lock/testing/lock-testkit.js';
import {
  SENTINELS,
  buildAccountWorld,
  type AccountWorld,
} from '../src/admin/accounts/testing/account-world.js';
import { findSecretLeaks } from '../src/admin/accounts/testing/secret-leak.js';
import { AdminFixtures } from '../src/admin/testing/admin-fixtures.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { LOGIN_MAX_FAILURES } from '../src/auth/auth.constants.js';
import { SessionService } from '../src/auth/session/session.service.js';
import { TEST_AUTH_ENV } from '../src/auth/testing/auth-test-env.js';
import {
  LOGIN_PASSWORD,
  WRONG_PASSWORD,
  loginPasswordHash,
} from '../src/auth/testing/login-int-helpers.js';
import type {
  LoaiTaiKhoan,
  TrangThaiTaiKhoan,
} from '../src/auth/entities/enums.js';
import type { ErrorBody } from '../src/common/errors/app.exception.js';
import { expectErrorResponse } from '../src/common/testing/error-assertions.js';
import { resetTables } from '../src/database/testing/test-database.js';
import { auditAdminControllers } from '../src/rbac/testing/admin-route-audit.js';

type Pair = { account: { taiKhoanId: string } };
const idOf = (pair: Pair) => pair.account.taiKhoanId;

// Hợp đồng HTTP của khoá / mở khoá tài khoản (admin B18): AppModule + MySQL thật + configureApp như main.ts, đăng nhập THẬT của auth,
// guard thật, MailService mặc định (cấu hình rỗng của test nên không gửi thư thật). Mã TKB18-nn là [đề xuất].
describe('B18 TK — HTTP AppModule + Auth + C1 + MySQL thật', () => {
  let app: NestExpressApplication;
  let db: DataSource;
  let sessions: SessionService;
  let fx: AdminFixtures;
  let w: AccountWorld;
  const token: Record<
    'system' | 'adminA' | 'adminB' | 'patient' | 'doctor' | 'receptionist',
    string
  > = {
    system: '',
    adminA: '',
    adminB: '',
    patient: '',
    doctor: '',
    receptionist: '',
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    db = app.get(DataSource);
    sessions = app.get(SessionService);
    fx = new AdminFixtures(db);
  });
  beforeEach(async () => {
    await resetTables(db);
    w = await buildAccountWorld(db);
    const issue = async (pair: Pair) =>
      (await sessions.create(idOf(pair))).accessToken;
    token.system = await issue(w.sysAdmin);
    token.adminA = await issue(w.adminA);
    token.adminB = await issue(w.adminB);
    token.patient = await issue(w.onlyA);
    token.doctor = await issue(w.doctorA);
    token.receptionist = await issue(w.receptionistA);
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => app?.close());

  const act = (
    action: 'lock' | 'unlock',
    id: string,
    bearer: string | null,
    body?: object,
  ) => {
    let req = request(app.getHttpServer()).post(
      `/admin/accounts/${id}/${action}`,
    );
    if (bearer !== null) req = req.set('Authorization', `Bearer ${bearer}`);
    return body === undefined ? req : req.send(body);
  };
  const login = (email: string, matKhau: string = LOGIN_PASSWORD) =>
    request(app.getHttpServer()).post('/auth/login').send({ email, matKhau });
  const me = (accessToken: string) =>
    request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
  const refresh = (refreshToken: string) =>
    request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Origin', TEST_AUTH_ENV.WEB_ORIGIN)
      .set('Cookie', `refresh_token=${encodeURIComponent(refreshToken)}`);
  const refreshTokenOf = (res: {
    headers: Record<string, unknown>;
  }): string => {
    const header = res.headers['set-cookie'];
    const cookie = Array.isArray(header) ? String(header[0]) : '';
    const match = /^refresh_token=([^;]+);/.exec(cookie);
    expect(match, 'Set-Cookie phải mang refresh_token').not.toBeNull();
    return decodeURIComponent(match?.[1] ?? '');
  };

  describe('quyền truy cập', () => {
    it('TKB18-40 (TK-23) khách, token hỏng, phiên đã thu hồi ⇒ 401; Bệnh nhân, Bác sĩ, Lễ tân ⇒ 403 cho CẢ lock và unlock; DB không đổi', async () => {
      const before = await snapshot(db);
      const id = idOf(w.doctorB);
      for (const action of ['lock', 'unlock'] as const) {
        expectErrorResponse(await act(action, id, null), 401, 'CHUA_DANG_NHAP');
        expectErrorResponse(
          await act(action, id, 'khong.phai.token'),
          401,
          'TOKEN_KHONG_HOP_LE',
        );
        for (const who of [token.patient, token.doctor, token.receptionist]) {
          const res = await act(action, id, who);
          expectErrorResponse(res, 403, 'KHONG_DU_QUYEN');
        }
      }
      // 401 và 403 không đổi gì: ảnh chụp mọi bảng liên quan nguyên vẹn
      expect(await snapshot(db)).toBe(before);
      expect(await auditRows(db)).toEqual([]);
      expect((await stateOf(db, id)).trang_thai).toBe('DangHoatDong');

      // Phiên của Quản trị viên đã bị thu hồi ⇒ 401 (không còn quyền dù token chưa hết hạn)
      const adminSession = await sessions.create(idOf(w.sysAdmin));
      await sessions.revoke(adminSession.sessionId);
      expectErrorResponse(
        await act('lock', id, adminSession.accessToken),
        401,
        'PHIEN_HET_HIEU_LUC',
      );
      expect((await stateOf(db, id)).trang_thai).toBe('DangHoatDong');
    });
  });

  describe('hình dạng phản hồi', () => {
    it('TKB18-41 (TK-10, TK-11, Q28) Toàn hệ thống: 200 với khoá CHẶT cho từng loại × hai hành động; chỉ Bác sĩ có phuThuoc', async () => {
      const cases = [
        ['BacSi', w.doctorA],
        ['LeTan', w.receptionistA],
        ['BenhNhan', w.onlyA],
        ['QuanTriVien', w.adminA],
      ] as const;
      for (const [kind, pair] of cases) {
        const id = idOf(pair);
        const locked = await act('lock', id, token.system).expect(200);
        const lockedBody = locked.body as Record<string, unknown>;
        expect(Object.keys(lockedBody).sort(), kind).toEqual(
          (kind === 'BacSi'
            ? [
                'loaiTaiKhoan',
                'phuThuoc',
                'soPhienThuHoi',
                'taiKhoanId',
                'trangThai',
              ]
            : ['loaiTaiKhoan', 'soPhienThuHoi', 'taiKhoanId', 'trangThai']
          ).sort(),
        );
        expect(lockedBody).toMatchObject({
          taiKhoanId: id,
          loaiTaiKhoan: kind,
          trangThai: 'NgungHoatDong',
        });
        expect(typeof lockedBody.soPhienThuHoi).toBe('number');
        if (kind === 'BacSi') {
          const dependents = lockedBody.phuThuoc as Record<
            string,
            { tong: number; muc: unknown[] }
          >;
          expect(Object.keys(dependents).sort()).toEqual([
            'caLamViec',
            'lichHen',
          ]);
          for (const list of Object.values(dependents)) {
            expect(Object.keys(list).sort()).toEqual(['muc', 'tong']);
            expect(list.muc.length).toBeLessThanOrEqual(50);
            expect(list.tong).toBeGreaterThanOrEqual(list.muc.length);
          }
          // doctorA của thế giới có 5 lịch hẹn đang hoạt động (DaXacNhan) và 1 ca ngày 02/11/2026 (đã qua nếu hôm nay muộn hơn)
          expect(dependents.lichHen!.tong).toBe(5);
        }
        const opened = await act('unlock', id, token.system).expect(200);
        expect(opened.body).toEqual({
          taiKhoanId: id,
          loaiTaiKhoan: kind,
          trangThai: 'DangHoatDong',
        });
        expect(findSecretLeaks(locked.body, SENTINELS)).toEqual([]);
        expect(findSecretLeaks(opened.body, SENTINELS)).toEqual([]);
      }
    });
  });

  describe('đăng nhập thật, khoá, token cũ, mở khoá', () => {
    // Tài khoản có băm Argon2id THẬT để đăng nhập qua HTTP; hồ sơ đầy đủ như tài khoản thật.
    async function loginablePatient() {
      const made = await fx.patient({
        email: 'khoa.thu.benh.nhan@example.com',
        matKhauBam: await loginPasswordHash(),
        daXacMinhEmail: true,
        thoiDiemTao: new Date(Date.now() - 3600_000),
      });
      return made.account;
    }

    it('TKB18-42 (TK-10, TK-11, Q29) đăng nhập thật → khoá → access token cũ 401 NGAY, refresh cũ bị từ chối, đăng nhập mới bị từ chối → mở khoá → đăng nhập lại được, token cũ vẫn chết', async () => {
      const target = await loginablePatient();
      const first = await login(target.email);
      expect(first.status).toBe(200);
      const oldAccess = (first.body as { accessToken: string }).accessToken;
      const oldRefresh = refreshTokenOf(first);
      expect((await me(oldAccess)).status).toBe(200);

      const locked = await act('lock', target.taiKhoanId, token.system).expect(
        200,
      );
      expect((locked.body as { soPhienThuHoi: number }).soPhienThuHoi).toBe(1);

      // (1) access token cũ chết NGAY (guard kiểm trạng thái mỗi request), (2) refresh cũ bị từ chối, (3) đăng nhập mới bị từ chối
      expectErrorResponse(await me(oldAccess), 401, 'PHIEN_HET_HIEU_LUC');
      expectErrorResponse(await refresh(oldRefresh), 401, 'PHIEN_HET_HIEU_LUC');
      const denied = await login(target.email);
      expect(denied.status).toBe(403);
      expect((denied.body as ErrorBody).maLoi).toBe('TAI_KHOAN_NGUNG');
      expect(
        (await sessionsOf(db, target.taiKhoanId)).every(
          (s) => s.revoked !== null,
        ),
      ).toBe(true);

      await act('unlock', target.taiKhoanId, token.system).expect(200);
      const again = await login(target.email);
      expect(again.status).toBe(200);
      const newAccess = (again.body as { accessToken: string }).accessToken;
      expect((await me(newAccess)).status).toBe(200);
      // Token CŨ vẫn chết sau khi mở khoá (phiên đã thu hồi, không sống lại)
      expectErrorResponse(await me(oldAccess), 401, 'PHIEN_HET_HIEU_LUC');
      expectErrorResponse(await refresh(oldRefresh), 401, 'PHIEN_HET_HIEU_LUC');
    });

    it('TKB18-43 (TK-11, Q28) sai mật khẩu đủ số lần ⇒ khoá tạm; admin khoá rồi mở khoá ⇒ bộ đếm và khoá tạm về rỗng, đăng nhập ĐÚNG được ngay', async () => {
      const target = await loginablePatient();
      // Lần sai 1 đến 4 trả 401; lần thứ LOGIN_MAX_FAILURES đã áp khoá tạm nên trả luôn 429 (hành vi của auth A8).
      for (let attempt = 1; attempt <= LOGIN_MAX_FAILURES; attempt += 1)
        expect((await login(target.email, WRONG_PASSWORD)).status).toBe(
          attempt < LOGIN_MAX_FAILURES ? 401 : 429,
        );
      const stuck = await stateOf(db, target.taiKhoanId);
      expect(stuck.so_lan_dang_nhap_sai).toBe(LOGIN_MAX_FAILURES);
      expect(stuck.khoa_dang_nhap_den).not.toBeNull();
      const blocked = await login(target.email);
      expect(blocked.status).toBe(429);
      expect((blocked.body as ErrorBody).maLoi).toBe('TAI_KHOAN_BI_KHOA_TAM');

      await act('lock', target.taiKhoanId, token.system).expect(200);
      await act('unlock', target.taiKhoanId, token.system).expect(200);
      expect(await stateOf(db, target.taiKhoanId)).toMatchObject({
        trang_thai: 'DangHoatDong',
        so_lan_dang_nhap_sai: 0,
        khoa_dang_nhap_den: null,
      });
      expect((await login(target.email)).status).toBe(200);
    });
  });

  describe('lỗi và ma trận', () => {
    it('TKB18-44 (TK-13…16, 20, 21) lỗi qua HTTP: đúng status, maLoi và thông báo', async () => {
      const body = (
        res: Parameters<typeof expectErrorResponse>[0],
        status: number,
        code: string,
      ) => expectErrorResponse(res, status, code);
      body(await act('lock', '987654321', token.system), 404, 'KHONG_TIM_THAY');
      body(
        await act('lock', idOf(w.doctorB), token.adminA),
        404,
        'KHONG_TIM_THAY',
      );
      body(
        await act('lock', idOf(w.adminA), token.adminA),
        404,
        'KHONG_TIM_THAY',
      );
      body(
        await act('lock', idOf(w.onlyA), token.adminA),
        403,
        'KHONG_DU_QUYEN',
      );
      const self = body(
        await act('lock', idOf(w.sysAdmin), token.system),
        409,
        'TU_KHOA_TAI_KHOAN',
      );
      expect(self.thongBao).toBe('Không thể tự khoá tài khoản của chính mình.');
      const pending = body(
        await act('lock', idOf(w.pendingDoctorA), token.system),
        409,
        'TAI_KHOAN_CHO_KICH_HOAT',
      );
      expect(pending.thongBao).toBe(
        'Tài khoản đang chờ kích hoạt. Hãy dùng "Gửi lại liên kết kích hoạt".',
      );
      body(
        await act('unlock', idOf(w.pendingDoctorA), token.system),
        409,
        'TAI_KHOAN_CHO_KICH_HOAT',
      );
      const state = body(
        await act('unlock', idOf(w.doctorA), token.system),
        409,
        'TRANG_THAI_KHONG_PHU_HOP',
      );
      expect(state.thongBao).toBe(
        'Trạng thái hiện tại của tài khoản không cho phép thao tác này.',
      );
      await act('lock', idOf(w.doctorA), token.system).expect(200);
      body(
        await act('lock', idOf(w.doctorA), token.system),
        409,
        'TRANG_THAI_KHONG_PHU_HOP',
      );
    });

    it('TKB18-45 (TK-22) mọi ô (người gọi × loại × hành động × trạng thái) gọi TRỰC TIẾP API: đúng kết quả; vi phạm không đổi gì', async () => {
      const BY_ROLE = {
        ToanHeThong: {
          BenhNhan: 'state',
          BacSi: 'state',
          LeTan: 'state',
          QuanTriVien: 'state',
        },
        ChiNhanh: {
          BenhNhan: 'KHONG_DU_QUYEN',
          BacSi: 'state',
          LeTan: 'state',
          QuanTriVien: 'KHONG_TIM_THAY',
        },
      } as const;
      const BY_STATE: Record<
        'lock' | 'unlock',
        Record<TrangThaiTaiKhoan, string>
      > = {
        lock: {
          DangHoatDong: 'OK',
          NgungHoatDong: 'TRANG_THAI_KHONG_PHU_HOP',
          ChoKichHoat: 'TAI_KHOAN_CHO_KICH_HOAT',
        },
        unlock: {
          DangHoatDong: 'TRANG_THAI_KHONG_PHU_HOP',
          NgungHoatDong: 'OK',
          ChoKichHoat: 'TAI_KHOAN_CHO_KICH_HOAT',
        },
      };
      const HTTP: Record<string, number> = {
        OK: 200,
        KHONG_DU_QUYEN: 403,
        KHONG_TIM_THAY: 404,
        TAI_KHOAN_CHO_KICH_HOAT: 409,
        TRANG_THAI_KHONG_PHU_HOP: 409,
      };
      const targets: Record<LoaiTaiKhoan, string> = {
        BenhNhan: idOf(w.onlyA),
        BacSi: idOf(w.doctorA),
        LeTan: idOf(w.receptionistA),
        QuanTriVien: idOf(w.adminB),
      };
      const callers = [
        { name: 'ToanHeThong', bearer: token.system },
        { name: 'ChiNhanh', bearer: token.adminA },
      ] as const;
      let checked = 0;
      for (const caller of callers)
        for (const kind of Object.keys(targets) as LoaiTaiKhoan[])
          for (const action of ['lock', 'unlock'] as const)
            for (const status of [
              'DangHoatDong',
              'NgungHoatDong',
              'ChoKichHoat',
            ] as const) {
              if (kind === 'BenhNhan' && status === 'ChoKichHoat') continue; // CHECK của DB
              const id = targets[kind];
              await setState(db, id, { trangThai: status });
              const gate = BY_ROLE[caller.name][kind];
              const expected =
                gate === 'state' ? BY_STATE[action][status] : gate;
              const before = await snapshot(db);
              const label = `${caller.name} ${action} ${kind} ${status}`;
              const res = await act(action, id, caller.bearer);
              expect(res.status, label).toBe(HTTP[expected]);
              if (expected === 'OK') {
                expect(
                  (res.body as { trangThai: string }).trangThai,
                  label,
                ).toBe(action === 'lock' ? 'NgungHoatDong' : 'DangHoatDong');
              } else {
                expect((res.body as ErrorBody).maLoi, label).toBe(expected);
                expect(await snapshot(db), label).toBe(before);
              }
              checked += 1;
            }
      expect(checked).toBe(44);
    }, 120_000);

    it('TKB18-46 (TK-13, TK-14, PQ-13) 404 ĐỒNG NHẤT: ngoài phạm vi, Quản trị viên, chính mình, không tồn tại ⇒ cùng status, maLoi, thân, content-type; DB không đổi', async () => {
      const before = await snapshot(db);
      const ids = [
        idOf(w.doctorB),
        idOf(w.receptionistB),
        idOf(w.onlyB),
        idOf(w.none),
        idOf(w.sysAdmin),
        idOf(w.adminB),
        idOf(w.adminA), // chính người gọi
        '987654321',
        '9223372036854775807',
      ];
      const seen = [];
      for (const action of ['lock', 'unlock'] as const)
        for (const id of ids) {
          const res = await act(action, id, token.adminA);
          expectErrorResponse(res, 404, 'KHONG_TIM_THAY');
          seen.push({
            status: res.status,
            body: res.body as unknown,
            type: String(res.headers['content-type']),
          });
        }
      for (const entry of seen) expect(entry).toEqual(seen[0]);
      expect(await snapshot(db)).toBe(before);
    });

    it('TKB18-47 (SE-A2, SE-A10) id sai dạng ⇒ 400 MA_TAI_KHOAN_KHONG_HOP_LE; thân gửi thêm bị bỏ qua; GET vào hai route không thực hiện hành động', async () => {
      for (const id of ['abc', '0', '-1', '01', '1e3', '9223372036854775808'])
        for (const action of ['lock', 'unlock'] as const) {
          const body = expectErrorResponse(
            await act(action, id, token.system),
            400,
            'DU_LIEU_KHONG_HOP_LE',
          );
          expect(body.loi).toContainEqual({
            truong: 'id',
            ma: 'MA_TAI_KHOAN_KHONG_HOP_LE',
          });
        }
      // Thân có `lyDo` và `trangThai` bị bỏ qua: khoá vẫn đúng, audit không có `ly_do`, không có bản ghi nào lạ
      const id = idOf(w.doctorA);
      await act('lock', id, token.system, {
        lyDo: 'không được lưu',
        trangThai: 'DangHoatDong',
        soPhienThuHoi: 99,
      }).expect(200);
      expect((await stateOf(db, id)).trang_thai).toBe('NgungHoatDong');
      const rows = await auditRows(db);
      expect(rows).toHaveLength(1);
      expect(JSON.stringify(rows[0])).not.toContain('không được lưu');
      expect(Object.keys(rows[0]!.changes as object).sort()).toEqual([
        'phien_thu_hoi',
        'sau',
        'truoc',
      ]);
      // GET vào route POST không đổi gì (404 vì GET /admin/accounts/:id/lock không tồn tại)
      await act('unlock', id, token.system).expect(200);
      const before = await snapshot(db);
      for (const action of ['lock', 'unlock']) {
        const res = await request(app.getHttpServer())
          .get(`/admin/accounts/${id}/${action}`)
          .set('Authorization', `Bearer ${token.system}`);
        expect(res.status).toBe(404);
      }
      expect(await snapshot(db)).toBe(before);
    });

    it('TKB18-48 (SE-A12, SE-A13) mọi phản hồi và log của một lượt khoá không lộ bí mật; không có set-cookie', async () => {
      const output: string[] = [];
      const capture = (chunk: unknown): boolean => {
        output.push(String(chunk));
        return true;
      };
      vi.spyOn(process.stderr, 'write').mockImplementation(capture);
      vi.spyOn(process.stdout, 'write').mockImplementation(capture);
      const target = w.doctorA.account;
      const responses = [
        await act('lock', idOf(w.doctorA), token.system),
        await act('unlock', idOf(w.doctorA), token.system),
        await act('lock', idOf(w.onlyA), token.system),
        await act('lock', idOf(w.doctorB), token.adminA), // 404
        await act('lock', idOf(w.onlyA), token.adminA), // 403 (Chi nhánh với Bệnh nhân, kiểm quyền đứng trước kiểm trạng thái)
        await act('lock', idOf(w.pendingDoctorA), token.system), // 409
      ];
      vi.restoreAllMocks();
      for (const res of responses) {
        expect(res.headers['set-cookie']).toBeUndefined();
        expect(findSecretLeaks(res.body, SENTINELS)).toEqual([]);
      }
      const logs = output.join('');
      for (const forbidden of [
        target.email,
        target.matKhauBam ?? '',
        '$argon2',
        token.system,
        token.adminA,
        ...SENTINELS,
      ])
        if (forbidden !== '') expect(logs).not.toContain(forbidden);
      const audits = await auditRows(db);
      expect(findSecretLeaks(audits, SENTINELS)).toEqual([]);
      expect(JSON.stringify(audits)).not.toContain(target.email);
    });
  });

  describe('bộ quét controller và đua', () => {
    it('TKB18-49 (PQ-11) AccountLockController có trong sổ tuyến và bộ quét duyệt TOÀN BỘ controller admin không báo lỗi', () => {
      const controllers = [...app.get(ModulesContainer).values()].flatMap(
        (module) =>
          [...module.controllers.values()].flatMap((wrapper) =>
            wrapper.metatype ? [wrapper.metatype] : [],
          ),
      );
      expect(controllers.map((item) => item.name)).toContain(
        'AccountLockController',
      );
      expect(auditAdminControllers([AccountLockController])).toEqual([]);
      expect(auditAdminControllers(controllers)).toEqual([]);
    });

    it('TKB18-50 (TK-19, H3) hai Toàn hệ thống khoá NHAU qua HTTP cùng lúc, nhiều vòng: không bao giờ cả hai bị khoá; không 500', async () => {
      const second = (
        await fx.admin(undefined, {
          hoTen: 'Admin Toàn hệ thống hai',
          email: 'toan.he.thong.hai@example.com',
        })
      ).account;
      const a = idOf(w.sysAdmin);
      const b = second.taiKhoanId;
      for (let round = 1; round <= 8; round += 1) {
        await setState(db, a, { trangThai: 'DangHoatDong' });
        await setState(db, b, { trangThai: 'DangHoatDong' });
        const tokenA = (await sessions.create(a)).accessToken;
        const tokenB = (await sessions.create(b)).accessToken;
        const [lockB, lockA] = await Promise.all([
          act('lock', b, tokenA),
          act('lock', a, tokenB),
        ]);
        const label = `vòng ${String(round)}`;
        const statuses = [lockB.status, lockA.status].sort((x, y) => x - y);
        // Một bên 200; bên kia 409 A5 (cùng qua guard) hoặc 401 (bên kia đã commit trước khi guard của nó chạy)
        expect(statuses[0], label).toBe(200);
        expect([401, 409], label).toContain(statuses[1]);
        for (const res of [lockA, lockB])
          if (res.status === 409)
            expect((res.body as ErrorBody).maLoi, label).toBe(
              'CON_IT_NHAT_MOT_ADMIN_TOAN_HE_THONG',
            );
        const active: { n: string }[] = await db.query(
          `SELECT COUNT(*) AS n FROM tai_khoan t JOIN quan_tri_vien qv ON qv.tai_khoan_id = t.tai_khoan_id
           WHERE qv.pham_vi_quan_tri = 'ToanHeThong' AND t.trang_thai = 'DangHoatDong'`,
        );
        expect(Number(active[0]!.n), label).toBe(1);
      }
    }, 120_000);
  });
});
