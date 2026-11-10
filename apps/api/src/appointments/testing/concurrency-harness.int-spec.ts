import type { DataSource } from 'typeorm';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { holdRowLock, withRowLock } from './concurrency-harness.js';
import { BookingFixtures } from './booking-fixtures.js';

// Task P2 — BHT-04 (PLAN booking 7.19; TRACKING 3.6 P2-G): `holdRowLock`, `withRowLock` trên MySQL 8.4 THẬT. Khoá được thử bằng hàng `chi_nhanh` dựng bằng fixture.
let db: DataSource;
let fx: BookingFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
});

const LOCK_SQL =
  'SELECT chi_nhanh_id FROM chi_nhanh WHERE chi_nhanh_id = ? FOR UPDATE';
const nameOf = async (id: string) => {
  const rows: { ten: string }[] = await db.query(
    'SELECT ten FROM chi_nhanh WHERE chi_nhanh_id = ?',
    [id],
  );
  return rows[0]?.ten;
};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** Kết nối khác xin cùng khoá nhưng KHÔNG chờ: lỗi ER_LOCK_NOWAIT (3572) nghĩa là khoá đang bị giữ thật. */
const tryLockNoWait = (id: string) => db.query(`${LOCK_SQL} NOWAIT`, [id]);

describe('BHT-04 holdRowLock và withRowLock', () => {
  it('giữ khoá THẬT: kết nối khác xin NOWAIT bị từ chối (3572), một UPDATE bị chặn đứng cho tới khi release(commit) rồi mới chạy', async () => {
    const { chiNhanhId: id } = await fx.admin.branch({ ten: 'Trước khi khoá' });
    const held = await holdRowLock(db, LOCK_SQL, [id]);
    try {
      await expect(tryLockNoWait(id)).rejects.toMatchObject({
        driverError: { errno: 3572 },
      });

      let settled = false;
      const waiter = db
        .query('UPDATE chi_nhanh SET ten = ? WHERE chi_nhanh_id = ?', [
          'Do bên chờ đổi',
          id,
        ])
        .then(() => {
          settled = true;
        });
      await sleep(300);
      expect(settled).toBe(false);
      expect(await nameOf(id)).toBe('Trước khi khoá');

      await held.release('commit');
      await waiter;
      expect(settled).toBe(true);
      expect(await nameOf(id)).toBe('Do bên chờ đổi');
    } finally {
      await held.release('rollback');
    }
    await expect(tryLockNoWait(id)).resolves.toBeDefined();
  });

  it('làm việc BÊN TRONG giao dịch giữ khoá bằng manager: rollback bỏ thay đổi, commit giữ lại; release gọi hai lần không lỗi', async () => {
    const { chiNhanhId: id } = await fx.admin.branch({ ten: 'Gốc' });

    const toRollBack = await holdRowLock(db, LOCK_SQL, [id]);
    await toRollBack.manager.query(
      'UPDATE chi_nhanh SET ten = ? WHERE chi_nhanh_id = ?',
      ['Sẽ bị hoàn tác', id],
    );
    await toRollBack.release();
    await toRollBack.release('commit'); // lần hai: không làm gì, không ném
    expect(await nameOf(id)).toBe('Gốc');

    const toCommit = await holdRowLock(db, LOCK_SQL, [id]);
    await toCommit.manager.query(
      'UPDATE chi_nhanh SET ten = ? WHERE chi_nhanh_id = ?',
      ['Đã commit', id],
    );
    await toCommit.release('commit');
    expect(await nameOf(id)).toBe('Đã commit');
  });

  it('withRowLock: chạy work trong lúc khoá bị giữ, rồi nhả; work ném lỗi thì lỗi lan ra VÀ khoá vẫn được nhả (không để giao dịch mở)', async () => {
    const { chiNhanhId: id } = await fx.admin.branch();
    const seen = await withRowLock(
      db,
      { sql: LOCK_SQL, params: [id] },
      async () => {
        await expect(tryLockNoWait(id)).rejects.toMatchObject({
          driverError: { errno: 3572 },
        });
        return 'xong';
      },
    );
    expect(seen).toBe('xong');
    await expect(tryLockNoWait(id)).resolves.toBeDefined();

    const boom = new Error('ca đỏ giữa chừng');
    await expect(
      withRowLock(db, { sql: LOCK_SQL, params: [id] }, () =>
        Promise.reject(boom),
      ),
    ).rejects.toBe(boom);
    await expect(tryLockNoWait(id)).resolves.toBeDefined();
  });

  it('câu khoá lỗi ⇒ ném đúng lỗi gốc của MySQL và trả kết nối về pool (12 lần liền không cạn pool mặc định 10)', async () => {
    for (let attempt = 0; attempt < 12; attempt += 1)
      await expect(
        holdRowLock(db, 'SELECT 1 FROM bang_khong_ton_tai FOR UPDATE'),
      ).rejects.toMatchObject({ driverError: { errno: 1146 } });
  });
});
