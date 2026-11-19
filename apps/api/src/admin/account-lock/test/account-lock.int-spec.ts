import 'reflect-metadata';
import type { DataSource } from 'typeorm';
import { AuditService } from '../../../audit/audit.service.js';
import { insertPhienDangNhap } from '../../../auth/entities/testing/auth-fixtures.js';
import type {
  LoaiTaiKhoan,
  TrangThaiTaiKhoan,
} from '../../../auth/entities/enums.js';
import { AppException } from '../../../common/errors/app.exception.js';
import {
  createTestDataSource,
  readTestDbSettings,
  resetTables,
} from '../../../database/testing/test-database.js';
import type { AdminScope } from '../../../rbac/admin-scope.js';
import {
  SENTINELS,
  buildAccountWorld,
  type AccountWorld,
} from '../../accounts/testing/account-world.js';
import { findSecretLeaks } from '../../accounts/testing/secret-leak.js';
import { AdminFixtures } from '../../testing/admin-fixtures.js';
import { freezeTime } from '../../testing/test-helpers.js';
import { AccountLockRepository } from '../account-lock.repository.js';
import type { AccountLockService } from '../account-lock.service.js';
import type { LockAction } from '../account-lock.types.js';
import type { TrangThaiLichHen } from '../../entities/enums.js';
import {
  addActiveSessions,
  addSystemAdmin,
  auditRows,
  buildLockServices,
  fakeDeadlock,
  sessionsOf,
  setState,
  snapshot,
  stateOf,
} from '../testing/lock-testkit.js';
import type { SessionService } from '../../../auth/session/session.service.js';

const system: AdminScope = { kind: 'ToanHeThong' };
const branchScope = (chiNhanhId: string): AdminScope => ({
  kind: 'ChiNhanh',
  chiNhanhId,
});

async function failure(work: Promise<unknown>): Promise<AppException> {
  const error = await work.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(AppException);
  return error as AppException;
}

// Bản bọc repository để chèn việc của test vào ĐÚNG khe giữa hai bước (đọc thường rồi khoá) hoặc làm một bước lỗi.
class HookedRepository extends AccountLockRepository {
  afterPreRead?: () => Promise<void>;
  failDependentsOnce?: Error;

  override async preRead(
    ...args: Parameters<AccountLockRepository['preRead']>
  ) {
    const found = await super.preRead(...args);
    await this.afterPreRead?.();
    return found;
  }

  override readDependents(
    ...args: Parameters<AccountLockRepository['readDependents']>
  ) {
    if (this.failDependentsOnce) {
      const error = this.failDependentsOnce;
      this.failDependentsOnce = undefined;
      return Promise.reject(error);
    }
    return super.readDependents(...args);
  }
}

describe('B18 TK — khoá / mở khoá tài khoản trên MySQL thật', () => {
  let db: DataSource;
  let service: AccountLockService;
  let sessions: SessionService;
  let audit: AuditService;
  let repository: HookedRepository;
  let fx: AdminFixtures;
  let w: AccountWorld;
  let scopeA: AdminScope;
  let scopeB: AdminScope;

  beforeAll(async () => {
    db = await createTestDataSource(readTestDbSettings());
    repository = new HookedRepository(db);
    ({ service, sessions, audit } = buildLockServices(db, repository));
    fx = new AdminFixtures(db);
  });
  beforeEach(async () => {
    repository.afterPreRead = undefined;
    repository.failDependentsOnce = undefined;
    await resetTables(db);
    w = await buildAccountWorld(db);
    scopeA = branchScope(w.branchA.chiNhanhId);
    scopeB = branchScope(w.branchB.chiNhanhId);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });
  afterAll(async () => db?.destroy());

  const idOf = (pair: { account: { taiKhoanId: string } }) =>
    pair.account.taiKhoanId;
  const actorSystem = () => idOf(w.sysAdmin);
  const lock = (scope: AdminScope, actor: string, id: string) =>
    service.lock(scope, actor, id);
  const unlock = (scope: AdminScope, actor: string, id: string) =>
    service.unlock(scope, actor, id);
  const run = (
    action: LockAction,
    scope: AdminScope,
    actor: string,
    id: string,
  ) => (action === 'lock' ? lock(scope, actor, id) : unlock(scope, actor, id));

  describe('khoá (TK-10, TK-12, Q29)', () => {
    it('TKB18-10 (TK-10, Q29) Toàn hệ thống khoá Bác sĩ, Lễ tân, Bệnh nhân, Quản trị viên Chi nhánh: trạng thái, mọi phiên chưa thu hồi, phiên cũ giữ mốc, phiên người khác nguyên', async () => {
      const targets = [
        w.doctorA.account,
        w.receptionistA.account,
        w.onlyA.account,
        w.adminA.account,
      ];
      const bystander = w.doctorB.account.taiKhoanId;
      const bystanderBefore = await sessionsOf(db, bystander);
      for (const account of targets) {
        const id = account.taiKhoanId;
        await setState(db, id, { soLanDangNhapSai: 2 });
        await addActiveSessions(db, id, 2);
        const oldRevoke = new Date('2026-11-01T10:00:00.000Z');
        await insertPhienDangNhap(db, id, { thuHoiLuc: oldRevoke });
        const before = await sessionsOf(db, id);
        const unrevoked = before.filter((row) => row.revoked === null).length;
        expect(unrevoked).toBe(3); // một phiên của thế giới + hai phiên thêm

        const response = await lock(system, actorSystem(), id);
        expect(response).toMatchObject({
          taiKhoanId: id,
          loaiTaiKhoan: account.loaiTaiKhoan,
          trangThai: 'NgungHoatDong',
          soPhienThuHoi: 3,
        });
        const after = await sessionsOf(db, id);
        expect(after).toHaveLength(before.length);
        expect(after.every((row) => row.revoked !== null)).toBe(true);
        // Phiên đã thu hồi từ trước GIỮ mốc cũ
        const oldRow = before.find((row) => row.revoked !== null)!;
        expect(after.find((row) => row.id === oldRow.id)!.revoked).toEqual(
          oldRow.revoked,
        );
        const state = await stateOf(db, id);
        expect(state.trang_thai).toBe('NgungHoatDong');
        expect(state.so_lan_dang_nhap_sai).toBe(2); // khoá không đụng bộ đếm
      }
      expect(await sessionsOf(db, bystander)).toEqual(bystanderBefore);
    });

    it('TKB18-12 (TK-12) Chi nhánh A khoá rồi mở khoá Bác sĩ và Lễ tân của chi nhánh A', async () => {
      for (const account of [w.doctorA.account, w.receptionistA.account]) {
        const id = account.taiKhoanId;
        const locked = await lock(scopeA, idOf(w.adminA), id);
        expect(locked.trangThai).toBe('NgungHoatDong');
        expect((await stateOf(db, id)).trang_thai).toBe('NgungHoatDong');
        const opened = await unlock(scopeA, idOf(w.adminA), id);
        expect(opened.trangThai).toBe('DangHoatDong');
        expect((await stateOf(db, id)).trang_thai).toBe('DangHoatDong');
      }
    });

    it('TKB18-26 (TK-10, Q29) nhiều phiên: đang dùng, quá hạn chưa thu hồi, đã thu hồi; số thu hồi đúng', async () => {
      const id = idOf(w.onlyA);
      await addActiveSessions(db, id, 2);
      await insertPhienDangNhap(db, id, {
        hetHanLuc: new Date('2026-01-01T00:00:00.000Z'),
      });
      await insertPhienDangNhap(db, id, {
        thuHoiLuc: new Date('2026-11-01T10:00:00.000Z'),
      });
      const response = await lock(system, actorSystem(), id);
      expect(response.soPhienThuHoi).toBe(4); // 1 của thế giới + 2 đang dùng + 1 quá hạn
      const rows = await sessionsOf(db, id);
      expect(rows).toHaveLength(5);
      expect(rows.every((row) => row.revoked !== null)).toBe(true);
    });
  });

  describe('mở khoá (TK-11, Q28)', () => {
    it('TKB18-11 (TK-11) về DangHoatDong, xoá bộ đếm và khoá tạm; chỉ đổi đúng ba cột; no-show và cờ no-show không đổi', async () => {
      const id = idOf(w.lockedA); // Bệnh nhân bị khoá no-show: khoa_dat_lich_do_no_show = 1, so_lan_no_show = 3
      await setState(db, id, {
        trangThai: 'NgungHoatDong',
        soLanDangNhapSai: 5,
        khoaDangNhapDen: new Date('2030-01-01T00:00:00.000Z'),
      });
      const rowBefore = (
        await db.query('SELECT * FROM tai_khoan WHERE tai_khoan_id = ?', [id])
      )[0] as Record<string, unknown>;
      const noShowBefore = await db.query(
        'SELECT khoa_dat_lich_do_no_show, so_lan_no_show FROM benh_nhan WHERE tai_khoan_id = ?',
        [id],
      );

      const response = await unlock(system, actorSystem(), id);
      expect(response).toEqual({
        taiKhoanId: id,
        loaiTaiKhoan: 'BenhNhan',
        trangThai: 'DangHoatDong',
      });
      const rowAfter = (
        await db.query('SELECT * FROM tai_khoan WHERE tai_khoan_id = ?', [id])
      )[0] as Record<string, unknown>;
      const changed = Object.keys(rowBefore).filter(
        (key) =>
          JSON.stringify(rowBefore[key]) !== JSON.stringify(rowAfter[key]),
      );
      expect(changed.sort()).toEqual(
        ['khoa_dang_nhap_den', 'so_lan_dang_nhap_sai', 'trang_thai'].sort(),
      );
      expect(rowAfter).toMatchObject({
        trang_thai: 'DangHoatDong',
        so_lan_dang_nhap_sai: 0,
        khoa_dang_nhap_den: null,
      });
      expect(
        await db.query(
          'SELECT khoa_dat_lich_do_no_show, so_lan_no_show FROM benh_nhan WHERE tai_khoan_id = ?',
          [id],
        ),
      ).toEqual(noShowBefore);
    });
  });

  describe('phạm vi và quyền (TK-13…16, Q27, Q40)', () => {
    it('TKB18-13 (TK-13, Q40) Chi nhánh A khoá, mở khoá nhân sự chi nhánh B ⇒ 404, DB không đổi, cùng thân với id không tồn tại', async () => {
      const before = await snapshot(db);
      const missing = await failure(lock(scopeA, idOf(w.adminA), '987654321'));
      for (const account of [w.doctorB.account, w.receptionistB.account]) {
        for (const action of ['lock', 'unlock'] as const) {
          const error = await failure(
            run(action, scopeA, idOf(w.adminA), account.taiKhoanId),
          );
          expect(error.getStatus()).toBe(404);
          expect(error.getResponse()).toEqual(missing.getResponse());
        }
      }
      expect(await snapshot(db)).toBe(before);
    });

    it('TKB18-14 (TK-14, TK-16 điều chỉnh, Q27) Chi nhánh với Quản trị viên (Toàn hệ thống, chi nhánh khác, CHÍNH MÌNH) ⇒ 404 trước kiểm tự khoá', async () => {
      const before = await snapshot(db);
      for (const account of [
        w.sysAdmin.account,
        w.adminB.account,
        w.adminA.account,
      ]) {
        for (const action of ['lock', 'unlock'] as const) {
          const error = await failure(
            run(action, scopeA, idOf(w.adminA), account.taiKhoanId),
          );
          expect(error.getStatus()).toBe(404);
          expect(error.maLoi).toBe('KHONG_TIM_THAY');
        }
      }
      expect(await snapshot(db)).toBe(before);
    });

    it('TKB18-15 (TK-15) Chi nhánh với Bệnh nhân có lịch ở chi nhánh mình ⇒ 403; Bệnh nhân không có lịch ở đó ⇒ 404', async () => {
      const before = await snapshot(db);
      for (const patient of [
        w.onlyA,
        w.both,
        w.manyA,
        w.relativeA,
        w.lockedA,
      ]) {
        for (const action of ['lock', 'unlock'] as const) {
          const error = await failure(
            run(action, scopeA, idOf(w.adminA), idOf(patient)),
          );
          expect(error.getStatus()).toBe(403);
          expect(error.maLoi).toBe('KHONG_DU_QUYEN');
        }
      }
      for (const patient of [w.onlyB, w.none]) {
        const error = await failure(
          lock(scopeA, idOf(w.adminA), idOf(patient)),
        );
        expect(error.getStatus()).toBe(404);
      }
      expect(await snapshot(db)).toBe(before);
    });

    it('TKB18-16 (TK-16, A4) Toàn hệ thống tự khoá ⇒ TU_KHOA_TAI_KHOAN, DB không đổi', async () => {
      const before = await snapshot(db);
      const error = await failure(lock(system, actorSystem(), actorSystem()));
      expect(error.getStatus()).toBe(409);
      expect(error.maLoi).toBe('TU_KHOA_TAI_KHOAN');
      expect(await snapshot(db)).toBe(before);
    });

    it('TKB18-32 (TK-13, Q40) id không tồn tại và id ngoài tầm nhìn ném CÙNG lỗi (status, mã, thân)', async () => {
      const missing = await failure(lock(scopeA, idOf(w.adminA), '999999999'));
      const outside = await failure(
        lock(scopeA, idOf(w.adminA), idOf(w.doctorB)),
      );
      expect(outside.getStatus()).toBe(missing.getStatus());
      expect(outside.getResponse()).toEqual(missing.getResponse());
    });
  });

  describe('Toàn hệ thống cuối cùng (TK-17, TK-18, A5) — mức service: người gọi KHÔNG phải Toàn hệ thống đang hoạt động', () => {
    // Người gọi Toàn hệ thống qua HTTP luôn đang hoạt động nên luôn là "một người khác" (PLAN 5.6 và B18 mục 1.5); ca này dựng người
    // gọi bị khoá ngay giữa guard và giao dịch bằng một Quản trị viên Toàn hệ thống đã ngưng.
    it('TKB18-17 (TK-17) khoá Toàn hệ thống DUY NHẤT còn hoạt động ⇒ CON_IT_NHAT_MOT_ADMIN_TOAN_HE_THONG, DB không đổi', async () => {
      const gone = await addSystemAdmin(db, 'NgungHoatDong');
      const before = await snapshot(db);
      const error = await failure(lock(system, idOf(gone), actorSystem()));
      expect(error.getStatus()).toBe(409);
      expect(error.maLoi).toBe('CON_IT_NHAT_MOT_ADMIN_TOAN_HE_THONG');
      expect(await snapshot(db)).toBe(before);
    });

    it('TKB18-18 (TK-18) còn một Toàn hệ thống KHÁC: hoạt động ⇒ thành công; ngưng hay chờ kích hoạt ⇒ A5; Admin Chi nhánh đang hoạt động KHÔNG được đếm', async () => {
      const forged = idOf(w.adminA); // người gọi giả: không liên quan tới tập Toàn hệ thống
      // (a) có người khác đang hoạt động
      const other = await addSystemAdmin(db, 'DangHoatDong');
      expect((await lock(system, forged, idOf(other))).trangThai).toBe(
        'NgungHoatDong',
      );
      // (b) từ đây người khác duy nhất (`other`) đã ngưng ⇒ khoá `sysAdmin` bị chặn
      const blocked = await failure(lock(system, forged, actorSystem()));
      expect(blocked.maLoi).toBe('CON_IT_NHAT_MOT_ADMIN_TOAN_HE_THONG');
      // (c) người khác đang chờ kích hoạt
      await setState(db, idOf(other), { trangThai: 'ChoKichHoat' });
      expect((await failure(lock(system, forged, actorSystem()))).maLoi).toBe(
        'CON_IT_NHAT_MOT_ADMIN_TOAN_HE_THONG',
      );
      // Hai Admin Chi nhánh đang hoạt động của thế giới không cứu được (đã bị chặn ở các bước trên)
      expect((await stateOf(db, idOf(w.adminA))).trang_thai).toBe(
        'DangHoatDong',
      );
      expect((await stateOf(db, idOf(w.adminB))).trang_thai).toBe(
        'DangHoatDong',
      );
      expect((await stateOf(db, actorSystem())).trang_thai).toBe(
        'DangHoatDong',
      );
    });
  });

  describe('trạng thái (TK-20, TK-21, A6)', () => {
    it('TKB18-20 (TK-20, A6) khoá và mở khoá tài khoản ChoKichHoat ⇒ TAI_KHOAN_CHO_KICH_HOAT; trạng thái, liên kết kích hoạt, phiên không đổi; không audit', async () => {
      const id = idOf(w.pendingDoctorA);
      const before = await snapshot(db);
      for (const action of ['lock', 'unlock'] as const) {
        const error = await failure(run(action, system, actorSystem(), id));
        expect(error.getStatus()).toBe(409);
        expect(error.maLoi).toBe('TAI_KHOAN_CHO_KICH_HOAT');
      }
      expect(await snapshot(db)).toBe(before);
      expect((await stateOf(db, id)).trang_thai).toBe('ChoKichHoat');
      expect(await auditRows(db)).toEqual([]);
    });

    it('TKB18-21 (TK-21) khoá tài khoản đã ngưng và mở khoá tài khoản đang hoạt động ⇒ TRANG_THAI_KHONG_PHU_HOP; không đổi, không audit', async () => {
      const gone = (
        await fx.doctor(w.branchA, {}, { trangThai: 'NgungHoatDong' })
      ).account.taiKhoanId;
      const before = await snapshot(db);
      const lockGone = await failure(lock(system, actorSystem(), gone));
      expect(lockGone.maLoi).toBe('TRANG_THAI_KHONG_PHU_HOP');
      const unlockActive = await failure(
        unlock(system, actorSystem(), idOf(w.doctorA)),
      );
      expect(unlockActive.maLoi).toBe('TRANG_THAI_KHONG_PHU_HOP');
      expect(await snapshot(db)).toBe(before);
    });
  });

  describe('TKB18-22 (TK-22) ma trận người gọi × loại đích × hành động × trạng thái trên DB thật', () => {
    // Cùng BẢNG KỲ VỌNG VIẾT TAY như TKB18-01 (chiều người gọi × loại, và chiều hành động × trạng thái).
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
    const BY_STATE: Record<LockAction, Record<TrangThaiTaiKhoan, string>> = {
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
    const STATES: TrangThaiTaiKhoan[] = [
      'DangHoatDong',
      'NgungHoatDong',
      'ChoKichHoat',
    ];

    it('mọi ô cho đúng kết quả; ô bị từ chối không đổi gì', async () => {
      // Đích đại diện cho từng loại; Quản trị viên đích là Admin Chi nhánh B (không chạm tập Toàn hệ thống).
      const targets: Record<LoaiTaiKhoan, string> = {
        BenhNhan: idOf(w.onlyA),
        BacSi: idOf(w.doctorA),
        LeTan: idOf(w.receptionistA),
        QuanTriVien: idOf(w.adminB),
      };
      const callers = [
        { name: 'ToanHeThong', scope: system, actor: actorSystem() },
        { name: 'ChiNhanh', scope: scopeA, actor: idOf(w.adminA) },
      ] as const;
      let checked = 0;
      for (const caller of callers) {
        for (const kind of Object.keys(targets) as LoaiTaiKhoan[]) {
          for (const action of ['lock', 'unlock'] as const) {
            for (const status of STATES) {
              // CHECK của DB (chk_tai_khoan_cho_kich_hoat_nhan_su): Bệnh nhân không bao giờ ở ChoKichHoat; ô đó chỉ có ở TKB18-01 (U).
              if (kind === 'BenhNhan' && status === 'ChoKichHoat') continue;
              const id = targets[kind];
              await setState(db, id, { trangThai: status });
              const gate = BY_ROLE[caller.name][kind];
              const expected =
                gate === 'state' ? BY_STATE[action][status] : gate;
              const before = await snapshot(db);
              const label = `${caller.name} ${action} ${kind} ${status}`;
              const result = await run(action, caller.scope, caller.actor, id)
                .then(() => 'OK')
                .catch((error: unknown) => {
                  expect(error, label).toBeInstanceOf(AppException);
                  return (error as AppException).maLoi;
                });
              expect(result, label).toBe(expected);
              if (expected !== 'OK')
                expect(await snapshot(db), label).toBe(before);
              checked += 1;
            }
          }
        }
      }
      expect(checked).toBe(44); // 2 người gọi × 4 loại × 2 hành động × 3 trạng thái = 48, trừ 4 ô Bệnh nhân ChoKichHoat không dựng được
    });
  });

  describe('hoàn tác và audit (TK-24, TK-25)', () => {
    const unrevokedOf = async (id: string) =>
      (await sessionsOf(db, id)).filter((row) => row.revoked === null).length;

    it('TKB18-23 (TK-24, TK-25) thu hồi phiên ném lỗi ⇒ trạng thái giữ nguyên, không audit', async () => {
      const id = idOf(w.doctorA);
      const before = await snapshot(db);
      vi.spyOn(sessions, 'revokeAll').mockRejectedValueOnce(
        new Error('lỗi thu hồi giả'),
      );
      await expect(lock(system, actorSystem(), id)).rejects.toThrow(
        'lỗi thu hồi giả',
      );
      expect(await snapshot(db)).toBe(before);
      expect((await stateOf(db, id)).trang_thai).toBe('DangHoatDong');
    });

    it('TKB18-23 (TK-25) ghi audit ném lỗi ⇒ trạng thái GIỮ NGUYÊN và phiên CHƯA thu hồi (thu hồi đã chạy nhưng bị hoàn tác)', async () => {
      const id = idOf(w.doctorA);
      await addActiveSessions(db, id, 2);
      const before = await snapshot(db);
      const spy = vi
        .spyOn(audit, 'record')
        .mockImplementationOnce(() =>
          Promise.reject(new Error('lỗi audit giả')),
        );
      await expect(lock(system, actorSystem(), id)).rejects.toThrow(
        'lỗi audit giả',
      );
      expect(spy).toHaveBeenCalledTimes(1);
      expect(await snapshot(db)).toBe(before);
      expect(await unrevokedOf(id)).toBe(3);
    });

    it('TKB18-23 đọc việc phụ thuộc ném lỗi (không phải deadlock) ⇒ hoàn tác tất cả', async () => {
      const id = idOf(w.doctorA);
      const before = await snapshot(db);
      repository.failDependentsOnce = new Error('lỗi đọc giả');
      await expect(lock(system, actorSystem(), id)).rejects.toThrow(
        'lỗi đọc giả',
      );
      expect(await snapshot(db)).toBe(before);
    });

    it('TKB18-33 (độ bền) deadlock 1213 giả ở bước CUỐI của lần đầu ⇒ lần đầu hoàn tác trọn; đúng MỘT dòng audit và phiên thu hồi một lần', async () => {
      const id = idOf(w.doctorA);
      await addActiveSessions(db, id, 2); // 3 phiên chưa thu hồi
      repository.failDependentsOnce = fakeDeadlock();
      const revokeSpy = vi.spyOn(sessions, 'revokeAll');
      const auditSpy = vi.spyOn(audit, 'record');

      const response = await lock(system, actorSystem(), id);

      // Lần đầu đã chạy hết ghi trạng thái, thu hồi, audit rồi mới gặp 1213 và bị hoàn tác; lần hai làm lại từ đầu.
      expect(revokeSpy).toHaveBeenCalledTimes(2);
      expect(auditSpy).toHaveBeenCalledTimes(2);
      const rows = await auditRows(db);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        action: 'KhoaTaiKhoan',
        targetId: id,
        changes: {
          truoc: { trang_thai: 'DangHoatDong' },
          sau: { trang_thai: 'NgungHoatDong' },
          phien_thu_hoi: 3,
        },
      });
      // Số phiên thu hồi báo ra là của lần THÀNH CÔNG (3), không phải 0 hay 6.
      expect(response.soPhienThuHoi).toBe(3);
      const after = await sessionsOf(db, id);
      expect(after.every((row) => row.revoked !== null)).toBe(true);
      expect((await stateOf(db, id)).trang_thai).toBe('NgungHoatDong');
    });

    it('TKB18-24 (TK-25, SOW 3.2.4) đúng MỘT dòng audit mỗi thao tác thành công, đúng 5.10; thất bại ⇒ 0 dòng; không bí mật', async () => {
      // Lỗi trước: 0 dòng
      await failure(lock(scopeA, idOf(w.adminA), idOf(w.doctorB)));
      await failure(lock(scopeA, idOf(w.adminA), idOf(w.onlyA)));
      await failure(unlock(system, actorSystem(), idOf(w.doctorA)));
      expect(await auditRows(db)).toEqual([]);

      const doctor = idOf(w.doctorA);
      await addActiveSessions(db, doctor, 1);
      await lock(system, actorSystem(), doctor); // 2 phiên
      await unlock(system, actorSystem(), doctor);
      await lock(system, actorSystem(), idOf(w.onlyA)); // Bệnh nhân
      await lock(system, actorSystem(), idOf(w.adminB)); // Quản trị viên Chi nhánh
      await lock(scopeA, idOf(w.adminA), idOf(w.receptionistA)); // Chi nhánh khoá Lễ tân

      const rows = await auditRows(db);
      expect(rows).toHaveLength(5);
      const branchA = w.branchA.chiNhanhId;
      expect(rows[0]).toEqual({
        actor: actorSystem(),
        branch: branchA,
        action: 'KhoaTaiKhoan',
        targetType: 'tai_khoan',
        targetId: doctor,
        result: 'ThanhCong',
        changes: {
          truoc: { trang_thai: 'DangHoatDong' },
          sau: { trang_thai: 'NgungHoatDong' },
          phien_thu_hoi: 2,
        },
      });
      expect(rows[1]).toEqual({
        actor: actorSystem(),
        branch: branchA,
        action: 'MoKhoaTaiKhoan',
        targetType: 'tai_khoan',
        targetId: doctor,
        result: 'ThanhCong',
        changes: {
          truoc: { trang_thai: 'NgungHoatDong' },
          sau: { trang_thai: 'DangHoatDong' },
          phien_thu_hoi: 0,
        },
      });
      expect(rows[2]!.branch).toBeNull(); // Bệnh nhân
      expect(rows[3]!.branch).toBeNull(); // Quản trị viên
      expect(rows[4]).toMatchObject({
        actor: idOf(w.adminA),
        branch: branchA,
        targetId: idOf(w.receptionistA),
      });
      // Không bí mật, không thông tin cá nhân của đích
      expect(findSecretLeaks(rows, SENTINELS)).toEqual([]);
      const text = JSON.stringify(rows);
      for (const account of w.all) {
        expect(text).not.toContain(account.email);
        expect(text).not.toContain(account.hoTen);
      }
    });
  });

  describe('việc phụ thuộc khi khoá Bác sĩ (TK-10, Q28)', () => {
    // Thêm `count` lịch hẹn ở trạng thái `status` cho bác sĩ, mỗi lịch một khung giờ riêng của MỘT ca.
    let counter = 0;
    async function addAppointments(
      doctor: { taiKhoanId: string; chiNhanhId: string; dichVuKhamId: string },
      count: number,
      status: TrangThaiLichHen,
      ngay = '2026-12-01',
    ) {
      const profile = doctor as Parameters<AdminFixtures['shift']>[0];
      const shift = await fx.shift(profile, { ngay, ca: 'CaChieu' });
      for (let index = 0; index < count; index += 1) {
        counter += 1;
        const slot = await fx.slot(shift, {
          ngayGio: new Date(
            Date.parse(`${ngay}T10:00:00.000Z`) + counter * 60 * 1000,
          ),
        });
        await fx.appointment(profile, slot, idOf(w.onlyA), {
          trangThai: status,
        });
      }
    }

    it('TKB18-25 chỉ ba trạng thái hoạt động; bác sĩ khác không lẫn; ca từ hôm nay; không đổi lịch hẹn hay ca', async () => {
      freezeTime(new Date('2026-11-19T10:00:00.000Z')); // 17:00 ngày 19/11 giờ VN
      const doctor = await fx.doctor(w.branchA);
      const profile = doctor.profile;
      // Mỗi trạng thái một lịch (mỗi lịch một ca ở một ngày tháng 12 riêng)
      const statuses = [
        'ChoThanhToan',
        'DaXacNhan',
        'DaTiepDon',
        'HoanThanh',
        'DaHuy',
        'DaDoiLich',
        'VangMat',
      ] as const;
      for (const [index, status] of statuses.entries())
        await addAppointments(
          profile,
          1,
          status,
          `2026-12-0${String(index + 1)}`,
        );
      // Lịch hoạt động của bác sĩ KHÁC đã có sẵn trong thế giới (doctorA, doctorB) và KHÔNG được lẫn vào.
      // Ca: hôm qua (loại), hôm nay (lấy), ngày mai (lấy); một ca của bác sĩ khác (loại)
      await fx.shift(profile, { ngay: '2026-11-18', ca: 'CaSang' });
      await fx.shift(profile, { ngay: '2026-11-19', ca: 'CaSang' });
      await fx.shift(profile, { ngay: '2026-11-20', ca: 'CaToi' });
      await fx.shift(w.doctorB.profile, { ngay: '2026-11-25', ca: 'CaSang' });
      const lichHenBefore = JSON.stringify(
        await db.query('SELECT * FROM lich_hen ORDER BY 1'),
      );
      const shiftsBefore = JSON.stringify(
        await db.query('SELECT * FROM lich_lam_viec ORDER BY 1'),
      );

      const response = await lock(
        system,
        actorSystem(),
        doctor.account.taiKhoanId,
      );
      const dependents = response.phuThuoc!;
      expect(dependents.lichHen.tong).toBe(3);
      expect(dependents.lichHen.muc.map((row) => row.trangThai).sort()).toEqual(
        ['ChoThanhToan', 'DaTiepDon', 'DaXacNhan'],
      );
      // Sắp theo thời gian tăng dần
      const times = dependents.lichHen.muc.map((row) => row.thoiGian);
      expect([...times].sort()).toEqual(times);
      expect(dependents.lichHen.muc[0]).toEqual({
        lichHenId: expect.stringMatching(/^\d+$/) as string,
        maLichHen: expect.any(String) as string,
        thoiGian: expect.stringMatching(
          /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
        ) as string,
        trangThai: expect.any(String) as string,
      });
      // Ca: từ 19/11 trở đi (gồm ca ở các lịch hẹn đã thêm ở tháng 12, vì mỗi lịch tạo ca của nó)
      const shiftDays = dependents.caLamViec.muc.map((row) => row.ngay);
      expect(shiftDays).not.toContain('2026-11-18');
      expect(shiftDays).toContain('2026-11-19');
      expect(shiftDays).toContain('2026-11-20');
      expect([...shiftDays].sort()).toEqual(shiftDays);
      expect(dependents.caLamViec.tong).toBe(shiftDays.length);
      // Không đổi lịch hẹn hay ca (Q28)
      expect(
        JSON.stringify(await db.query('SELECT * FROM lich_hen ORDER BY 1')),
      ).toBe(lichHenBefore);
      expect(
        JSON.stringify(
          await db.query('SELECT * FROM lich_lam_viec ORDER BY 1'),
        ),
      ).toBe(shiftsBefore);
      expect(findSecretLeaks(response, SENTINELS)).toEqual([]);
    });

    it('TKB18-25 biên 0, 1, 50, 51 lịch hoạt động ⇒ 0, 1, 50, 50 mục với tổng 0, 1, 50, 51', async () => {
      for (const [count, items] of [
        [0, 0],
        [1, 1],
        [50, 50],
        [51, 50],
      ] as const) {
        const doctor = await fx.doctor(w.branchA);
        await addAppointments(doctor.profile, count, 'DaXacNhan');
        const response = await lock(
          system,
          actorSystem(),
          doctor.account.taiKhoanId,
        );
        expect(response.phuThuoc!.lichHen.tong, `tổng ${String(count)}`).toBe(
          count,
        );
        expect(
          response.phuThuoc!.lichHen.muc,
          `mục ${String(count)}`,
        ).toHaveLength(items);
      }
    }, 120_000);

    it('TKB18-25 biên ngày giờ Việt Nam: 23:59:59 ngày 19/11 còn lấy ca hôm nay, 00:00:00 ngày 20/11 thì không', async () => {
      const lockAt = async (instant: string) => {
        const doctor = await fx.doctor(w.branchA);
        await fx.shift(doctor.profile, { ngay: '2026-11-19', ca: 'CaSang' });
        const clock = freezeTime(new Date(instant));
        try {
          return (await lock(system, actorSystem(), doctor.account.taiKhoanId))
            .phuThuoc!.caLamViec;
        } finally {
          clock.restore();
        }
      };
      expect((await lockAt('2026-11-19T16:59:59.000Z')).tong).toBe(1);
      expect((await lockAt('2026-11-19T17:00:00.000Z')).tong).toBe(0);
    });

    it('TKB18-25 Lễ tân, Bệnh nhân, Quản trị viên: phản hồi KHÔNG có `phuThuoc`', async () => {
      for (const account of [
        w.receptionistA.account,
        w.onlyA.account,
        w.adminA.account,
      ]) {
        const response = await lock(system, actorSystem(), account.taiKhoanId);
        expect(Object.keys(response).sort()).toEqual([
          'loaiTaiKhoan',
          'soPhienThuHoi',
          'taiKhoanId',
          'trangThai',
        ]);
      }
    });
  });

  describe('đọc lại dưới khoá (PQ-09)', () => {
    it('TKB18-31 trạng thái đổi GIỮA đọc thường và khoá ⇒ quyết định theo dữ liệu MỚI (TRANG_THAI_KHONG_PHU_HOP)', async () => {
      const id = idOf(w.doctorA);
      repository.afterPreRead = async () => {
        await setState(db, id, { trangThai: 'NgungHoatDong' });
      };
      const error = await failure(lock(system, actorSystem(), id));
      expect(error.maLoi).toBe('TRANG_THAI_KHONG_PHU_HOP');
      expect(await auditRows(db)).toEqual([]);
    });

    it('TKB18-31 (PQ-09) bác sĩ đổi chi nhánh GIỮA hai bước ⇒ Chi nhánh cũ nhận 404, không đổi gì', async () => {
      const id = idOf(w.doctorA);
      let before = '';
      repository.afterPreRead = async () => {
        await db.query(
          'UPDATE bac_si SET chi_nhanh_id = ? WHERE tai_khoan_id = ?',
          [w.branchB.chiNhanhId, id],
        );
        // Ảnh chụp lấy SAU thay đổi của chính hook: B18 không được đổi thêm gì.
        before = await snapshot(db);
      };
      const error = await failure(lock(scopeA, idOf(w.adminA), id));
      expect(error.getStatus()).toBe(404);
      expect(before).not.toBe('');
      expect(await snapshot(db)).toBe(before);
      // Chi nhánh mới (B) thấy và khoá được
      repository.afterPreRead = undefined;
      expect((await lock(scopeB, idOf(w.adminB), id)).trangThai).toBe(
        'NgungHoatDong',
      );
    });
  });

  it('khoá không động tới tài khoản khác (đếm số hàng đổi)', async () => {
    const before = await db.query<{ id: string; s: string }[]>(
      'SELECT CAST(tai_khoan_id AS CHAR) AS id, trang_thai AS s FROM tai_khoan ORDER BY tai_khoan_id',
    );
    await lock(system, actorSystem(), idOf(w.doctorA));
    const after = await db.query<{ id: string; s: string }[]>(
      'SELECT CAST(tai_khoan_id AS CHAR) AS id, trang_thai AS s FROM tai_khoan ORDER BY tai_khoan_id',
    );
    const changed = after.filter((row, index) => row.s !== before[index]!.s);
    expect(changed.map((row) => row.id)).toEqual([idOf(w.doctorA)]);
  });
});
