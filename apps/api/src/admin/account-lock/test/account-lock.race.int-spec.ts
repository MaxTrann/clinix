import 'reflect-metadata';
import type { DataSource } from 'typeorm';
import { AppException } from '../../../common/errors/app.exception.js';
import {
  createTestDataSource,
  readTestDbSettings,
  resetTables,
} from '../../../database/testing/test-database.js';
import type { SessionService } from '../../../auth/session/session.service.js';
import type { AdminScope } from '../../../rbac/admin-scope.js';
import {
  buildAccountWorld,
  type AccountWorld,
} from '../../accounts/testing/account-world.js';
import { runConcurrently } from '../../testing/test-helpers.js';
import type { AccountLockService } from '../account-lock.service.js';
import {
  addActiveSessions,
  addSystemAdmin,
  auditRows,
  buildLockServices,
  sessionsOf,
  setState,
  stateOf,
} from '../testing/lock-testkit.js';

// CHẠY MỘT MÌNH (xin lượt RACE): các ca này tạo nhiều giao dịch giữ khoá chờ nhau; một ca đỏ làm hỏng hook TRUNCATE của ca sau.
const ROUNDS = 12;
const system: AdminScope = { kind: 'ToanHeThong' };

describe('B18 TK — đua khoá / mở khoá trên MySQL thật', () => {
  let db: DataSource;
  let service: AccountLockService;
  let sessions: SessionService;
  let w: AccountWorld;

  beforeAll(async () => {
    db = await createTestDataSource(readTestDbSettings());
    ({ service, sessions } = buildLockServices(db));
  });
  beforeEach(async () => {
    await resetTables(db);
    w = await buildAccountWorld(db);
  });
  afterAll(async () => db?.destroy());

  const idOf = (pair: { account: { taiKhoanId: string } }) =>
    pair.account.taiKhoanId;

  const activeSystemAdmins = async (): Promise<number> => {
    const rows: { n: string }[] = await db.query(
      `SELECT COUNT(*) AS n FROM tai_khoan t JOIN quan_tri_vien qv ON qv.tai_khoan_id = t.tai_khoan_id
       WHERE qv.pham_vi_quan_tri = 'ToanHeThong' AND t.trang_thai = 'DangHoatDong'`,
    );
    return Number(rows[0]!.n);
  };

  it('TKB18-19 (TK-19, H3) chỉ còn hai Toàn hệ thống khoá NHAU cùng lúc, nhiều vòng: không bao giờ về 0; một bên thành công, bên kia A5; không 1213 lọt ra', async () => {
    const a = idOf(w.sysAdmin);
    const b = idOf(await addSystemAdmin(db));
    for (let round = 1; round <= ROUNDS; round += 1) {
      await setState(db, a, { trangThai: 'DangHoatDong' });
      await setState(db, b, { trangThai: 'DangHoatDong' });
      const results = await runConcurrently([
        () => service.lock(system, a, b),
        () => service.lock(system, b, a),
      ]);
      const label = `vòng ${String(round)}`;
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled, label).toHaveLength(1);
      expect(rejected, label).toHaveLength(1);
      const reason = (rejected[0] as PromiseRejectedResult).reason as unknown;
      expect(reason, label).toBeInstanceOf(AppException);
      expect((reason as AppException).maLoi, label).toBe(
        'CON_IT_NHAT_MOT_ADMIN_TOAN_HE_THONG',
      );
      expect(await activeSystemAdmins(), label).toBe(1);
    }
  }, 120_000);

  it('TKB18-28 (TK-21, H4) hai Toàn hệ thống cùng khoá MỘT Bác sĩ: đúng một thành công, một TRANG_THAI_KHONG_PHU_HOP; audit một dòng; số phiên không đếm trùng', async () => {
    const a = idOf(w.sysAdmin);
    const b = idOf(await addSystemAdmin(db));
    const doctor = idOf(w.doctorA);
    for (let round = 1; round <= ROUNDS; round += 1) {
      await setState(db, doctor, { trangThai: 'DangHoatDong' });
      await addActiveSessions(db, doctor, 2);
      const unrevoked = (await sessionsOf(db, doctor)).filter(
        (row) => row.revoked === null,
      ).length;
      const auditBefore = (await auditRows(db)).length;
      const results = await runConcurrently([
        () => service.lock(system, a, doctor),
        () => service.lock(system, b, doctor),
      ]);
      const label = `vòng ${String(round)}`;
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled, label).toHaveLength(1);
      expect(rejected, label).toHaveLength(1);
      const reason = (rejected[0] as PromiseRejectedResult).reason as unknown;
      expect(reason, label).toBeInstanceOf(AppException);
      expect((reason as AppException).maLoi, label).toBe(
        'TRANG_THAI_KHONG_PHU_HOP',
      );
      const winner = (
        fulfilled[0] as PromiseFulfilledResult<
          Awaited<ReturnType<AccountLockService['lock']>>
        >
      ).value;
      expect(winner.soPhienThuHoi, label).toBe(unrevoked);
      expect((await auditRows(db)).length - auditBefore, label).toBe(1);
      expect((await stateOf(db, doctor)).trang_thai, label).toBe(
        'NgungHoatDong',
      );
    }
  }, 120_000);

  it('TKB18-29 khoá và mở khoá CÙNG một đích đồng thời: kết quả khớp đúng MỘT thứ tự tuần tự, audit khớp', async () => {
    const actor = idOf(w.sysAdmin);
    const target = idOf(w.doctorA);
    const seen = new Set<string>();
    for (let round = 1; round <= ROUNDS; round += 1) {
      await setState(db, target, { trangThai: 'DangHoatDong' });
      const auditBefore = (await auditRows(db)).length;
      const [lockResult, unlockResult] = await runConcurrently<unknown>([
        () => service.lock(system, actor, target),
        () => service.unlock(system, actor, target),
      ]);
      const label = `vòng ${String(round)}`;
      const added = (await auditRows(db)).slice(auditBefore);
      const finalState = (await stateOf(db, target)).trang_thai;
      expect(lockResult!.status, label).toBe('fulfilled'); // khoá luôn thành công
      if (unlockResult!.status === 'fulfilled') {
        // khoá rồi mở khoá
        seen.add('khoa-roi-mo');
        expect(finalState, label).toBe('DangHoatDong');
        expect(
          added.map((row) => row.action),
          label,
        ).toEqual(['KhoaTaiKhoan', 'MoKhoaTaiKhoan']);
      } else {
        // mở khoá chạy trước và bị từ chối (đang hoạt động), rồi khoá
        seen.add('mo-bi-tu-choi-roi-khoa');
        const reason = unlockResult!.reason as unknown;
        expect(reason, label).toBeInstanceOf(AppException);
        expect((reason as AppException).maLoi, label).toBe(
          'TRANG_THAI_KHONG_PHU_HOP',
        );
        expect(finalState, label).toBe('NgungHoatDong');
        expect(
          added.map((row) => row.action),
          label,
        ).toEqual(['KhoaTaiKhoan']);
      }
    }
    expect(seen.size).toBeGreaterThan(0);
  }, 120_000);

  it('TKB18-27 (Q29, auth A9) khoá và làm mới token CÙNG lúc: sau khi khoá commit không còn phiên hiệu lực nào; không 1213 lọt ra', async () => {
    const actor = idOf(w.sysAdmin);
    const target = idOf(w.doctorA);
    for (let round = 1; round <= ROUNDS; round += 1) {
      await setState(db, target, { trangThai: 'DangHoatDong' });
      const issued = await sessions.create(target);
      const [lockResult, refreshResult] = await runConcurrently<unknown>([
        () => service.lock(system, actor, target),
        () => sessions.refresh(issued.refreshToken),
      ]);
      const label = `vòng ${String(round)}`;
      expect(lockResult!.status, label).toBe('fulfilled');
      expect(refreshResult!.status, label).toBe('fulfilled'); // làm mới trả kết quả, không ném (kể cả 1213)
      expect((await stateOf(db, target)).trang_thai, label).toBe(
        'NgungHoatDong',
      );
      const rows = await sessionsOf(db, target);
      expect(
        rows.filter((row) => row.revoked === null),
        label,
      ).toEqual([]);
      const refreshed = (
        refreshResult as PromiseFulfilledResult<
          Awaited<ReturnType<SessionService['refresh']>>
        >
      ).value;
      if (refreshed.ok) {
        // Token mới (nếu lọt vào trước khi khoá commit) chết ngay: phiên đã thu hồi, tài khoản đã ngưng
        expect(
          await sessions.resolveActive({
            accountId: target,
            sessionId: refreshed.tokens.sessionId,
          }),
          label,
        ).toBeNull();
        const again = await sessions.refresh(refreshed.tokens.refreshToken);
        expect(again.ok, label).toBe(false);
      }
    }
  }, 120_000);
});
