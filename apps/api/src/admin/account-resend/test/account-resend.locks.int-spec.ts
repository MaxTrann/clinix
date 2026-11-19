import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { useIntegrationHooks } from '../../../auth/testing/int-hooks.js';
import { FakeMailService } from '../../../mail/testing/fake-mail.service.js';
import {
  SYSTEM_SCOPE,
  createWorld,
  pendingDoctor,
  pendingReceptionist,
  type ResendWorld,
} from '../testing/resend-world.js';

// TKB20-24 — ĐO khoá thật của giao dịch 1 bằng `performance_schema.data_locks` (cách của B14, B15, B18): giữ giao dịch MỞ ngay SAU khi hàng liên kết đã
// được chèn (mọi khoá của bước khoá, đọc theo tầm nhìn và `issue` đã giữ), đo từ một kết nối KHÁC, rồi mở cổng. Cổng mở bằng try/finally: một ca đỏ mà giữ giao
// dịch mở sẽ làm hook TRUNCATE của ca sau chờ 60 giây. Đây là bảng số đo (đối chiếu thứ tự khoá với B18), không phải ca đạt/trượt theo con số cố định.
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

interface HeldLock {
  bang: string;
  chiMuc: string | null;
  cheDo: string;
  duLieu: string | null;
}

let db: DataSource;
let w: ResendWorld<FakeMailService>;

useIntegrationHooks((testDb) => {
  db = testDb;
});

beforeEach(async () => {
  w = await createWorld(db);
});

// Khoá HÀNG (RECORD) của DB test, đo từ một kết nối KHÁC với kết nối đang giữ giao dịch.
const heldLocks = (): Promise<HeldLock[]> =>
  db.query(
    `SELECT OBJECT_NAME AS bang, INDEX_NAME AS chiMuc, LOCK_MODE AS cheDo, LOCK_DATA AS duLieu
     FROM performance_schema.data_locks
     WHERE OBJECT_SCHEMA = DATABASE() AND LOCK_TYPE = 'RECORD'
     ORDER BY OBJECT_NAME, LOCK_DATA`,
  );

// Chạy `start` tới cổng (ngay sau khi `insert` của kho liên kết xong, giao dịch CHƯA commit), đo, rồi MỞ cổng bằng finally và chờ giao dịch xong.
async function measure(start: () => Promise<unknown>): Promise<HeldLock[]> {
  const reached = deferred();
  const open = deferred();
  const original = w.links.repo.insert.bind(w.links.repo);
  vi.spyOn(w.links.repo, 'insert').mockImplementation(async (em, row) => {
    const id = await original(em, row);
    reached.resolve();
    await open.promise;
    return id;
  });
  const pending = start();
  try {
    await Promise.race([
      reached.promise,
      pending.then(() => {
        throw new Error('giao dịch kết thúc mà chưa tới cổng');
      }),
    ]);
    return await heldLocks();
  } finally {
    open.resolve();
    await pending;
  }
}

const tablesOf = (locks: HeldLock[]): string[] => [
  ...new Set(locks.map((lock) => lock.bang)),
];

describe('TKB20-24 (mục 2.4) — khoá thật của giao dịch 1 (data_locks)', () => {
  it('Toàn hệ thống gửi cho Bác sĩ: khoá ĐÚNG MỘT hàng tai_khoan của đích (X, không khoá khoảng); không khoá bac_si, le_tan, quan_tri_vien, chi_nhanh', async () => {
    const doctor = await pendingDoctor(w, w.branchA);
    const locks = await measure(() =>
      w.service.resend(SYSTEM_SCOPE, doctor.taiKhoanId),
    );
    console.info(
      '[TKB20-24] Bác sĩ (Toàn hệ thống), sau issue:',
      JSON.stringify(locks),
    );
    expect(locks.filter((lock) => lock.bang === 'tai_khoan')).toEqual([
      {
        bang: 'tai_khoan',
        chiMuc: 'PRIMARY',
        cheDo: 'X,REC_NOT_GAP',
        duLieu: doctor.taiKhoanId,
      },
    ]);
    // Chỉ hai bảng được phép có khoá: tai_khoan (hàng đích) và ma_xac_thuc (hàng vừa chèn: khoá ngầm, có thể không hiện)
    for (const table of tablesOf(locks))
      expect(['tai_khoan', 'ma_xac_thuc']).toContain(table);
    // Không có khoá khoảng ở bảng nào (READ COMMITTED)
    for (const lock of locks) expect(lock.cheDo).not.toMatch(/(^|,)GAP$/);
  });

  it('Chi nhánh gửi cho Lễ tân chi nhánh mình (điều kiện phạm vi có EXISTS lich_hen): vẫn chỉ MỘT hàng tai_khoan, không khoá lich_hen', async () => {
    const receptionist = await pendingReceptionist(w, w.branchA);
    const locks = await measure(() =>
      w.service.resend(w.scopeA, receptionist.taiKhoanId),
    );
    console.info(
      '[TKB20-24] Lễ tân (Chi nhánh), sau issue:',
      JSON.stringify(locks),
    );
    expect(locks.filter((lock) => lock.bang === 'tai_khoan')).toEqual([
      {
        bang: 'tai_khoan',
        chiMuc: 'PRIMARY',
        cheDo: 'X,REC_NOT_GAP',
        duLieu: receptionist.taiKhoanId,
      },
    ]);
    for (const table of tablesOf(locks))
      expect(['tai_khoan', 'ma_xac_thuc']).toContain(table);
  });
});
