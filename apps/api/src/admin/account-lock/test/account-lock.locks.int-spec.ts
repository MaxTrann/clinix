import 'reflect-metadata';
import type { DataSource, EntityManager } from 'typeorm';
import {
  createTestDataSource,
  readTestDbSettings,
  resetTables,
} from '../../../database/testing/test-database.js';
import type { AdminScope } from '../../../rbac/admin-scope.js';
import {
  buildAccountWorld,
  type AccountWorld,
} from '../../accounts/testing/account-world.js';
import { AccountLockRepository } from '../account-lock.repository.js';
import type { AccountLockService } from '../account-lock.service.js';
import { addSystemAdmin, buildLockServices } from '../testing/lock-testkit.js';

// TKB18-30 — ĐO khoá thật bằng `performance_schema.data_locks` (cách của B14, B15). Cổng mở bằng try/finally: một ca đỏ mà giữ giao dịch
// mở sẽ làm hook TRUNCATE của ca sau chờ 60 giây.
const system: AdminScope = { kind: 'ToanHeThong' };

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
}
function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

// Giữ giao dịch MỞ ở hai điểm: ngay TRƯỚC khi ghi trạng thái (mọi khoá của bước chọn đích đã giữ) và ở CUỐI (sau thu hồi phiên và audit).
class GatedRepository extends AccountLockRepository {
  gateBeforeWrite?: { reached: Deferred; open: Deferred };
  gateAtEnd?: { reached: Deferred; open: Deferred };

  override async setLocked(manager: EntityManager, id: string) {
    if (this.gateBeforeWrite) {
      this.gateBeforeWrite.reached.resolve();
      await this.gateBeforeWrite.open.promise;
    }
    return super.setLocked(manager, id);
  }

  override async readDependents(
    ...args: Parameters<AccountLockRepository['readDependents']>
  ) {
    const result = await super.readDependents(...args);
    if (this.gateAtEnd) {
      this.gateAtEnd.reached.resolve();
      await this.gateAtEnd.open.promise;
    }
    return result;
  }
}

interface HeldLock {
  bang: string;
  chiMuc: string | null;
  cheDo: string;
  duLieu: string | null;
}

describe('B18 TK — khoá thật của giao dịch khoá (data_locks)', () => {
  let db: DataSource;
  let service: AccountLockService;
  let repository: GatedRepository;
  let w: AccountWorld;

  beforeAll(async () => {
    db = await createTestDataSource(readTestDbSettings());
    repository = new GatedRepository(db);
    ({ service } = buildLockServices(db, repository));
  });
  beforeEach(async () => {
    repository.gateBeforeWrite = undefined;
    repository.gateAtEnd = undefined;
    await resetTables(db);
    w = await buildAccountWorld(db);
  });
  afterAll(async () => db?.destroy());

  const idOf = (pair: { account: { taiKhoanId: string } }) =>
    pair.account.taiKhoanId;

  // Khoá HÀNG (RECORD) của DB test, đo từ một kết nối KHÁC với kết nối đang giữ giao dịch.
  const heldLocks = (): Promise<HeldLock[]> =>
    db.query(
      `SELECT OBJECT_NAME AS bang, INDEX_NAME AS chiMuc, LOCK_MODE AS cheDo, LOCK_DATA AS duLieu
       FROM performance_schema.data_locks
       WHERE OBJECT_SCHEMA = DATABASE() AND LOCK_TYPE = 'RECORD'
       ORDER BY OBJECT_NAME, LOCK_DATA`,
    );

  // Chạy `start` tới cổng, đo, rồi MỞ cổng bằng finally và chờ giao dịch xong.
  async function measure(
    which: 'gateBeforeWrite' | 'gateAtEnd',
    start: () => Promise<unknown>,
  ): Promise<HeldLock[]> {
    const gate = { reached: deferred(), open: deferred() };
    repository[which] = gate;
    const pending = start();
    try {
      await Promise.race([
        gate.reached.promise,
        pending.then(() => {
          throw new Error('giao dịch kết thúc mà chưa tới cổng');
        }),
      ]);
      return await heldLocks();
    } finally {
      gate.open.resolve();
      repository[which] = undefined;
      await pending;
    }
  }

  const tablesOf = (locks: HeldLock[]) => [
    ...new Set(locks.map((l) => l.bang)),
  ];
  const keysOf = (locks: HeldLock[], table: string) =>
    locks
      .filter((l) => l.bang === table)
      .map((l) => l.duLieu ?? '')
      .sort();

  it('TKB18-30 đích thường (Bác sĩ, Toàn hệ thống gọi): chỉ MỘT hàng `tai_khoan`, chế độ X không khoá khoảng; không khoá hàng bảng nối', async () => {
    const doctor = idOf(w.doctorA);
    const locks = await measure('gateBeforeWrite', () =>
      service.lock(system, idOf(w.sysAdmin), doctor),
    );
    console.info('[TKB18-30] Bác sĩ, trước khi ghi:', JSON.stringify(locks));
    expect(tablesOf(locks)).toEqual(['tai_khoan']);
    expect(locks).toEqual([
      {
        bang: 'tai_khoan',
        chiMuc: 'PRIMARY',
        cheDo: 'X,REC_NOT_GAP',
        duLieu: doctor,
      },
    ]);
  });

  it('TKB18-30 Chi nhánh khoá Lễ tân (điều kiện phạm vi có EXISTS lich_hen): vẫn chỉ MỘT hàng `tai_khoan`', async () => {
    const receptionist = idOf(w.receptionistA);
    const locks = await measure('gateBeforeWrite', () =>
      service.lock(
        { kind: 'ChiNhanh', chiNhanhId: w.branchA.chiNhanhId },
        idOf(w.adminA),
        receptionist,
      ),
    );
    console.info(
      '[TKB18-30] Lễ tân (Chi nhánh), trước khi ghi:',
      JSON.stringify(locks),
    );
    expect(tablesOf(locks)).toEqual(['tai_khoan']);
    expect(keysOf(locks, 'tai_khoan')).toEqual([receptionist]);
  });

  it('TKB18-30 đích Toàn hệ thống: khoá ĐÚNG tập `tai_khoan` của Toàn hệ thống (3 hàng); không khoá Admin Chi nhánh hay tài khoản khác', async () => {
    const second = idOf(await addSystemAdmin(db));
    const third = idOf(await addSystemAdmin(db));
    const first = idOf(w.sysAdmin);
    const locks = await measure('gateBeforeWrite', () =>
      service.lock(system, first, second),
    );
    console.info(
      '[TKB18-30] Toàn hệ thống, trước khi ghi:',
      JSON.stringify(locks),
    );
    expect(tablesOf(locks)).toEqual(['tai_khoan']);
    expect(keysOf(locks, 'tai_khoan')).toEqual([first, second, third].sort());
    for (const lock of locks) expect(lock.cheDo).toBe('X,REC_NOT_GAP');
    expect(keysOf(locks, 'tai_khoan')).not.toContain(idOf(w.adminA));
    expect(keysOf(locks, 'tai_khoan')).not.toContain(idOf(w.adminB));
  });

  it('TKB18-30 cuối giao dịch (Bác sĩ): đích bị X ở `tai_khoan` và `phien_dang_nhap`; dòng audit kéo khoá S lên cha khoá ngoại (hàng `tai_khoan` của người gọi, hàng `chi_nhanh` của Bác sĩ); ghi lại bảng khoá', async () => {
    const actor = idOf(w.sysAdmin);
    const doctor = idOf(w.doctorA);
    const locks = await measure('gateAtEnd', () =>
      service.lock(system, actor, doctor),
    );
    console.info('[TKB18-30] Bác sĩ, cuối giao dịch:', JSON.stringify(locks));
    const sessionRows: { id: string }[] = await db.query(
      'SELECT CAST(phien_dang_nhap_id AS CHAR) AS id FROM phien_dang_nhap WHERE tai_khoan_id = ?',
      [doctor],
    );
    const of = (table: string, mode: string) =>
      locks
        .filter((l) => l.bang === table && l.cheDo === mode)
        .map((l) => l.duLieu ?? '')
        .sort();
    // Chủ động ghi: X trên hàng tai_khoan của ĐÍCH và trên mọi hàng phiên của đích (thu hồi).
    expect(of('tai_khoan', 'X,REC_NOT_GAP')).toEqual([doctor]);
    expect(of('phien_dang_nhap', 'X,REC_NOT_GAP')).toEqual(
      sessionRows.map((row) => row.id).sort(),
    );
    // Hệ quả của khoá ngoại khi chèn dòng audit (tai_khoan_id = người gọi, chi_nhanh_id = chi nhánh của Bác sĩ): S trên hàng cha.
    expect(of('tai_khoan', 'S,REC_NOT_GAP')).toEqual([actor]);
    expect(of('chi_nhanh', 'S,REC_NOT_GAP')).toEqual([w.branchA.chiNhanhId]);
    // Không còn khoá nào khác (không bac_si, le_tan, quan_tri_vien, benh_nhan, lich_hen, lich_lam_viec).
    expect(tablesOf(locks).sort()).toEqual([
      'chi_nhanh',
      'phien_dang_nhap',
      'tai_khoan',
    ]);
  });
});
