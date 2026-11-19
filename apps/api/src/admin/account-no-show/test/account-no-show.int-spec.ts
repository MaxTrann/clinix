import 'reflect-metadata';
import type { DataSource, QueryRunner } from 'typeorm';
import { AuditError } from '../../../audit/audit-error.js';
import { AuditRepository } from '../../../audit/audit.repository.js';
import { AuditService } from '../../../audit/audit.service.js';
import type { TaiKhoan } from '../../../auth/entities/tai-khoan.entity.js';
import { AppException } from '../../../common/errors/app.exception.js';
import {
  createTestDataSource,
  readTestDbSettings,
  resetTables,
} from '../../../database/testing/test-database.js';
import type { AdminScope } from '../../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../../rbac/branch-access.policy.js';
import { AccountRepository } from '../../accounts/account.repository.js';
import { AccountService } from '../../accounts/account.service.js';
import {
  SENTINELS,
  buildAccountWorld,
  type AccountWorld,
} from '../../accounts/testing/account-world.js';
import { findSecretLeaks } from '../../accounts/testing/secret-leak.js';
import { AdminFixtures } from '../../testing/admin-fixtures.js';
import { freezeTime, runConcurrently } from '../../testing/test-helpers.js';
import {
  accountNotPatient,
  accountStateNotAllowed,
} from '../account-no-show.errors.js';
import { AccountNoShowRepository } from '../account-no-show.repository.js';
import { AccountNoShowService } from '../account-no-show.service.js';

const system: AdminScope = { kind: 'ToanHeThong' };
const branchScope = (chiNhanhId: string): AdminScope => ({
  kind: 'ChiNhanh',
  chiNhanhId,
});
const BIGINT_MAX = '9223372036854775807';
const idOf = (value: { account: TaiKhoan } | TaiKhoan): string =>
  'account' in value ? value.account.taiKhoanId : value.taiKhoanId;

type Snapshot = Record<string, Record<string, unknown>[]>;
// Mọi bảng mà một lần mở khoá có thể (sai) đụng tới. `nhat_ky_hanh_dong` có mặt để thấy đúng +1 dòng.
const TABLES = [
  'tai_khoan',
  'benh_nhan',
  'bac_si',
  'le_tan',
  'quan_tri_vien',
  'lich_hen',
  'ma_xac_thuc',
  'phien_dang_nhap',
  'vi_noi_bo',
  'nhat_ky_hanh_dong',
] as const;

interface AuditRow {
  actor: string;
  branch: string | null;
  action: string;
  targetType: string;
  target: string;
  result: string;
  at: string;
  changes: unknown;
}

describe('B19 TK — mở khoá no-show trên MySQL thật (TKB19-10…19)', () => {
  let db: DataSource;
  let service: AccountNoShowService;
  let reader: AccountService;
  let w: AccountWorld;
  let actor: string;
  let scopeA: AdminScope;
  let scopeB: AdminScope;

  const unlock = (
    scope: AdminScope,
    target: string | TaiKhoan | AccountWorld['onlyA'],
  ) =>
    service.unlock(
      scope,
      actor,
      typeof target === 'string' ? target : idOf(target),
    );

  async function snapshot(): Promise<Snapshot> {
    const result: Snapshot = {};
    for (const table of TABLES)
      result[table] = await db.query(`SELECT * FROM \`${table}\` ORDER BY 1`);
    return result;
  }
  const sameTable = (before: Snapshot, after: Snapshot, table: string) =>
    JSON.stringify(before[table]) === JSON.stringify(after[table]);
  // Mọi bảng KHÔNG nằm trong `except` phải giống hệt trước và sau.
  const unchangedTables = (
    before: Snapshot,
    after: Snapshot,
    except: readonly string[] = [],
  ) =>
    TABLES.filter(
      (table) => !except.includes(table) && !sameTable(before, after, table),
    );
  // Từng ô của `benh_nhan` đã đổi, dạng `<id>.<cột>: <trước> -> <sau>`.
  function changedCells(before: Snapshot, after: Snapshot): string[] {
    const old = new Map(
      before.benh_nhan!.map((row) => [String(row.tai_khoan_id), row]),
    );
    const cells: string[] = [];
    for (const row of after.benh_nhan!) {
      const previous = old.get(String(row.tai_khoan_id));
      if (previous === undefined) {
        cells.push(`${String(row.tai_khoan_id)}: hàng mới`);
        continue;
      }
      for (const column of Object.keys(row))
        if (String(row[column]) !== String(previous[column]))
          cells.push(
            `${String(row.tai_khoan_id)}.${column}: ${String(previous[column])} -> ${String(row[column])}`,
          );
    }
    if (before.benh_nhan!.length !== after.benh_nhan!.length)
      cells.push('số hàng benh_nhan đổi');
    return cells;
  }

  async function flagOf(id: string) {
    const rows: { khoa: number; soLan: number; trangThai: string }[] =
      await db.query(
        `SELECT bn.khoa_dat_lich_do_no_show AS khoa, bn.so_lan_no_show AS soLan, t.trang_thai AS trangThai
         FROM benh_nhan bn JOIN tai_khoan t ON t.tai_khoan_id = bn.tai_khoan_id WHERE bn.tai_khoan_id = ?`,
        [id],
      );
    return rows[0];
  }
  async function auditRows(): Promise<AuditRow[]> {
    const rows: (Omit<AuditRow, 'changes'> & { changes: unknown })[] =
      await db.query(
        `SELECT CAST(tai_khoan_id AS CHAR) AS actor, CAST(chi_nhanh_id AS CHAR) AS branch, hanh_dong AS action,
                loai_doi_tuong AS targetType, CAST(ma_doi_tuong AS CHAR) AS target, ket_qua AS result,
                DATE_FORMAT(thoi_diem, '%Y-%m-%d %H:%i:%s') AS at, chi_tiet_thay_doi AS changes
         FROM nhat_ky_hanh_dong ORDER BY nhat_ky_hanh_dong_id`,
      );
    // Cột JSON: tuỳ driver trả về đối tượng hoặc chuỗi.
    return rows.map((row) => ({
      ...row,
      changes:
        typeof row.changes === 'string'
          ? (JSON.parse(row.changes) as unknown)
          : row.changes,
    }));
  }
  const failure = async (work: Promise<unknown>): Promise<AppException> => {
    const error = await work.then(
      () => undefined,
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(AppException);
    return error as AppException;
  };

  beforeAll(async () => {
    db = await createTestDataSource(readTestDbSettings());
    const policy = new BranchAccessPolicy();
    service = new AccountNoShowService(
      new AccountNoShowRepository(db),
      policy,
      new AuditService(new AuditRepository()),
    );
    reader = new AccountService(new AccountRepository(db), policy);
  });
  // Mỗi ca đều ghi DB nên dựng lại thế giới trước từng ca.
  beforeEach(async () => {
    await resetTables(db);
    w = await buildAccountWorld(db);
    actor = idOf(w.sysAdmin);
    scopeA = branchScope(w.branchA.chiNhanhId);
    scopeB = branchScope(w.branchB.chiNhanhId);
  });
  afterEach(() => vi.useRealTimers());
  afterAll(async () => db?.destroy());

  it('TKB19-10 (TK-30) Toàn hệ thống mở khoá Bệnh nhân bị khoá: cờ về 0, số lần và trạng thái KHÔNG đổi, chỉ MỘT ô của MỘT hàng đổi, audit +1, Bệnh nhân bị khoá khác không bị mở', async () => {
    // Bệnh nhân bị khoá thứ hai: nếu UPDATE thiếu WHERE thì cờ của người này cũng bị tắt.
    const other = await new AdminFixtures(db).patient({
      hoTen: 'Bệnh nhân bị khoá thứ hai',
      email: 'khoa.thu.hai@example.com',
      soDienThoai: '0900099999',
    });
    await db.query(
      'UPDATE benh_nhan SET khoa_dat_lich_do_no_show = 1, so_lan_no_show = 5 WHERE tai_khoan_id = ?',
      [other.account.taiKhoanId],
    );
    const before = await snapshot();

    const result = await unlock(system, w.lockedA);

    expect(result).toEqual({
      taiKhoanId: idOf(w.lockedA),
      khoaDatLichDoNoShow: false,
      soLanNoShow: 3,
    });
    const after = await snapshot();
    expect(changedCells(before, after)).toEqual([
      `${idOf(w.lockedA)}.khoa_dat_lich_do_no_show: 1 -> 0`,
    ]);
    expect(
      unchangedTables(before, after, ['benh_nhan', 'nhat_ky_hanh_dong']),
    ).toEqual([]);
    expect(after.nhat_ky_hanh_dong!.length).toBe(
      before.nhat_ky_hanh_dong!.length + 1,
    );
    expect(await flagOf(other.account.taiKhoanId)).toMatchObject({
      khoa: 1,
      soLan: 5,
    });
    // Đọc lại bằng chi tiết của B17.
    expect(await reader.get(system, idOf(w.lockedA))).toMatchObject({
      khoaDatLichDoNoShow: false,
      soLanNoShow: 3,
      trangThai: 'DangHoatDong',
    });
  });

  it('TKB19-11 (TK-30) biên: Bệnh nhân NgungHoatDong vẫn mở khoá được và trạng thái GIỮ NGUYÊN', async () => {
    await db.query(
      "UPDATE tai_khoan SET trang_thai = 'NgungHoatDong' WHERE tai_khoan_id = ?",
      [idOf(w.lockedA)],
    );
    await unlock(system, w.lockedA);
    expect(await flagOf(idOf(w.lockedA))).toEqual({
      khoa: 0,
      soLan: 3,
      trangThai: 'NgungHoatDong',
    });
  });

  it.each([0, 2147483647])(
    'TKB19-11 (TK-30) biên: so_lan_no_show = %s được trả nguyên, ghi nguyên vào audit và KHÔNG đổi',
    async (soLan) => {
      await db.query(
        'UPDATE benh_nhan SET so_lan_no_show = ? WHERE tai_khoan_id = ?',
        [soLan, idOf(w.lockedA)],
      );
      const result = await unlock(system, w.lockedA);
      expect(result.soLanNoShow).toBe(soLan);
      expect((await flagOf(idOf(w.lockedA)))?.soLan).toBe(soLan);
      expect((await auditRows())[0]?.changes).toMatchObject({
        so_lan_no_show: soLan,
      });
    },
  );

  it('TKB19-12 (TK-31) Bệnh nhân không bị khoá ⇒ 409 TRANG_THAI_KHONG_PHU_HOP, DB và audit không đổi; mở khoá lần hai liền sau lần một cũng 409', async () => {
    const before = await snapshot();
    const error = await failure(unlock(system, w.onlyA));
    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toEqual(accountStateNotAllowed().getResponse());
    expect(unchangedTables(before, await snapshot())).toEqual([]);

    await unlock(system, w.lockedA);
    const second = await failure(unlock(system, w.lockedA));
    expect(second.getResponse()).toEqual(
      accountStateNotAllowed().getResponse(),
    );
    expect(await auditRows()).toHaveLength(1);
  });

  it('TKB19-13 (TK-31) Bệnh nhân chưa xác minh (không có dòng benh_nhan) ⇒ 409; KHÔNG tạo dòng benh_nhan; không audit', async () => {
    const before = await snapshot();
    const error = await failure(unlock(system, w.unverified));
    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toEqual(accountStateNotAllowed().getResponse());
    const after = await snapshot();
    expect(unchangedTables(before, after)).toEqual([]);
    const rows: unknown[] = await db.query(
      'SELECT 1 FROM benh_nhan WHERE tai_khoan_id = ?',
      [idOf(w.unverified)],
    );
    expect(rows).toHaveLength(0);
  });

  it('TKB19-14 (TK-32) nhân sự (Bác sĩ, Bác sĩ chờ kích hoạt, Lễ tân, Quản trị viên kể cả chính mình, Bác sĩ thiếu hồ sơ) ⇒ 400 TAI_KHOAN_KHONG_PHAI_BENH_NHAN; DB và audit không đổi', async () => {
    const before = await snapshot();
    for (const target of [
      w.doctorA,
      w.pendingDoctorA,
      w.receptionistA,
      w.sysAdmin,
      w.adminA,
      w.brokenDoctor,
    ]) {
      const error = await failure(unlock(system, target));
      expect(error.getStatus()).toBe(400);
      expect(error.getResponse()).toEqual(accountNotPatient().getResponse());
    }
    expect(unchangedTables(before, await snapshot())).toEqual([]);
  });

  it('TKB19-15 (TK-33, Q27, Q40) thứ tự 4a/4b với Admin Chi nhánh: thấy được ⇒ 403; ngoài tầm nhìn và không tồn tại ⇒ cùng 404; không đổi gì', async () => {
    const before = await snapshot();
    // Chi nhánh A THẤY được: Bệnh nhân bị khoá, Bệnh nhân không bị khoá (403 đứng trước 409), Bác sĩ, Lễ tân (403 đứng trước 400).
    for (const target of [w.lockedA, w.onlyA, w.doctorA, w.receptionistA]) {
      const error = await failure(unlock(scopeA, target));
      expect(error.getStatus()).toBe(403);
      expect(error.getResponse()).toMatchObject({ maLoi: 'KHONG_DU_QUYEN' });
    }
    // Ngoài tầm nhìn của A (và id không tồn tại): cùng 404, cùng thân.
    const hidden = [
      w.doctorB,
      w.receptionistB,
      w.onlyB,
      w.none,
      w.unverified,
      w.brokenDoctor,
      w.sysAdmin,
      w.adminA,
      w.adminB,
    ];
    const responses: unknown[] = [];
    for (const target of hidden) {
      const error = await failure(unlock(scopeA, target));
      expect(error.getStatus()).toBe(404);
      responses.push(error.getResponse());
    }
    const missing = await failure(unlock(scopeA, BIGINT_MAX));
    expect(missing.getStatus()).toBe(404);
    for (const response of responses)
      expect(response).toEqual(missing.getResponse());
    // Chi nhánh B không thấy Bệnh nhân chỉ có lịch ở A.
    const otherBranch = await failure(unlock(scopeB, w.lockedA));
    expect(otherBranch.getStatus()).toBe(404);
    expect(otherBranch.getResponse()).toEqual(missing.getResponse());
    // Toàn hệ thống: id không tồn tại cũng 404 (cùng thân).
    const systemMissing = await failure(unlock(system, BIGINT_MAX));
    expect(systemMissing.getResponse()).toEqual(missing.getResponse());

    expect(unchangedTables(before, await snapshot())).toEqual([]);
    expect(await flagOf(idOf(w.lockedA))).toMatchObject({ khoa: 1, soLan: 3 });
  });

  it('TKB19-16 (TK-25) audit đúng MỘT dòng, đúng hình dạng PLAN 5.10, giờ Việt Nam, sạch bí mật; mọi nhánh lỗi KHÔNG ghi dòng nào', async () => {
    for (const bad of [w.onlyA, w.unverified, w.doctorA, BIGINT_MAX])
      await unlock(system, bad).catch(() => undefined);
    await unlock(scopeA, w.lockedA).catch(() => undefined);
    expect(await auditRows()).toHaveLength(0);

    // 03:30:15,900 UTC = 10:30:15 giờ Việt Nam (làm tròn XUỐNG giây).
    const clock = freezeTime(new Date('2026-11-19T03:30:15.900Z'));
    await unlock(system, w.lockedA);
    clock.restore();

    const rows = await auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      actor,
      branch: null,
      action: 'MoKhoaNoShow',
      targetType: 'benh_nhan',
      target: idOf(w.lockedA),
      result: 'ThanhCong',
      at: '2026-11-19 10:30:15',
      changes: {
        truoc: { khoa_dat_lich_do_no_show: true },
        sau: { khoa_dat_lich_do_no_show: false },
        so_lan_no_show: 3,
      },
    });
    expect(findSecretLeaks(rows, SENTINELS)).toEqual([]);
  });

  it('TKB19-17 (TK-25) ghi audit lỗi THẬT (người thực hiện không tồn tại ⇒ vi phạm khoá ngoại) ⇒ lỗi lan ra, cờ VẪN bật, 0 dòng audit (rollback cả UPDATE)', async () => {
    const before = await snapshot();
    await expect(
      service.unlock(system, '999999999', idOf(w.lockedA)),
    ).rejects.toBeInstanceOf(AuditError);
    expect(await flagOf(idOf(w.lockedA))).toMatchObject({ khoa: 1, soLan: 3 });
    expect(await auditRows()).toHaveLength(0);
    expect(unchangedTables(before, await snapshot())).toEqual([]);
  });

  it('TKB19-18 (TK-31, mục 2.4) hai lần mở khoá đồng thời, 20 vòng: đúng MỘT thành công + MỘT 409, đúng MỘT dòng audit mỗi vòng, cờ cuối là 0', async () => {
    for (let round = 1; round <= 20; round += 1) {
      await db.query(
        'UPDATE benh_nhan SET khoa_dat_lich_do_no_show = 1 WHERE tai_khoan_id = ?',
        [idOf(w.lockedA)],
      );
      const results = await runConcurrently([
        () => unlock(system, w.lockedA),
        () => unlock(system, w.lockedA),
      ]);
      const ok = results.filter((r) => r.status === 'fulfilled');
      const failed = results.filter((r) => r.status === 'rejected');
      expect(ok, `vòng ${String(round)}`).toHaveLength(1);
      expect(failed, `vòng ${String(round)}`).toHaveLength(1);
      const reason = (failed[0] as PromiseRejectedResult).reason as unknown;
      expect(reason).toBeInstanceOf(AppException);
      expect((reason as AppException).getResponse()).toEqual(
        accountStateNotAllowed().getResponse(),
      );
      expect(await auditRows(), `vòng ${String(round)}`).toHaveLength(round);
      expect((await flagOf(idOf(w.lockedA)))?.khoa).toBe(0);
    }
  });

  describe('TKB19-19 (mục 2.4, PLAN booking 5.3) — khoá hàng bằng cổng', () => {
    // Giao dịch "cổng" giữ khoá rồi nhả trong `finally`: một giao dịch rò làm hook dọn bảng của test sau treo.
    async function openGate(sql: string, id: string): Promise<QueryRunner> {
      const gate = db.createQueryRunner();
      await gate.connect();
      await gate.startTransaction('READ COMMITTED');
      await gate.query(sql, [id]);
      return gate;
    }
    async function closeGate(gate: QueryRunner): Promise<void> {
      try {
        if (gate.isTransactionActive) await gate.rollbackTransaction();
      } finally {
        await gate.release();
      }
    }
    const sleep = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));

    it('cổng giữ benh_nhan của đích FOR UPDATE ⇒ mở khoá PHẢI chờ; nhả cổng ⇒ hoàn tất và cờ về 0', async () => {
      const id = idOf(w.lockedA);
      const gate = await openGate(
        'SELECT 1 FROM benh_nhan WHERE tai_khoan_id = ? FOR UPDATE',
        id,
      );
      let pending: Promise<unknown> = Promise.resolve();
      try {
        let settled = false;
        pending = unlock(system, id).finally(() => {
          settled = true;
        });
        await sleep(600);
        expect(settled, 'mở khoá không được xong khi hàng đang bị khoá').toBe(
          false,
        );
        expect((await flagOf(id))?.khoa).toBe(1);
      } finally {
        await closeGate(gate);
      }
      await expect(pending).resolves.toMatchObject({
        khoaDatLichDoNoShow: false,
      });
      expect((await flagOf(id))?.khoa).toBe(0);
    });

    it('cổng giữ tai_khoan của đích FOR UPDATE ⇒ mở khoá KHÔNG bị chặn (không khoá tai_khoan của Bệnh nhân, chiều khoá đúng với booking)', async () => {
      const id = idOf(w.lockedA);
      const gate = await openGate(
        'SELECT 1 FROM tai_khoan WHERE tai_khoan_id = ? FOR UPDATE',
        id,
      );
      let pending: Promise<unknown> = Promise.resolve();
      try {
        pending = unlock(system, id);
        const outcome = await Promise.race([
          pending.then(() => 'xong'),
          sleep(8000).then(() => 'bị chặn'),
        ]);
        expect(outcome).toBe('xong');
      } finally {
        await closeGate(gate);
        await pending.catch(() => undefined);
      }
      expect((await flagOf(id))?.khoa).toBe(0);
    });
  });
});
