import type { DataSource, EntityManager } from 'typeorm';
import { vi } from 'vitest';
import { AdminFixtures } from '../../admin/testing/admin-fixtures.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { withBookingTransaction } from './booking-transaction.js';

// Task P1 — BTX-10, BTX-11 (PLAN booking 7.17; TRACKING 3.3 P1-E, câu g) trên MySQL 8.4 THẬT. Dùng hai hàng `chi_nhanh` dựng bằng `AdminFixtures`.
// Đua nhiều bên và đếm 1213 là DT ở B6, B8 và X1, KHÔNG ở đây: P1 không tuyên bố "không deadlock", chỉ chứng minh (1) mức cô lập READ COMMITTED có thật
// và (2) lỗi deadlock THẬT đi qua TypeORM/driver được nhận ra và thử lại. Không đọc được mức cô lập bằng SQL (`@@transaction_isolation` luôn báo mức của phiên,
// CODING_CONVENTION) nên BTX-10 chứng minh bằng HÀNH VI.
let db: DataSource;
let fx: AdminFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new AdminFixtures(d);
});

const nameOf = async (em: EntityManager, id: string) => {
  const rows = await em.query<{ ten: string }[]>(
    'SELECT ten FROM chi_nhanh WHERE chi_nhanh_id = ?',
    [id],
  );
  return rows[0]?.ten;
};

const rename = (manager: DataSource | EntityManager, id: string, ten: string) =>
  manager.query('UPDATE chi_nhanh SET ten = ? WHERE chi_nhanh_id = ?', [
    ten,
    id,
  ]);

/** Cổng chặn: mỗi bên gọi `await arrive()` rồi đợi; đủ `parties` bên thì cùng chạy tiếp. */
function createBarrier(parties: number): () => Promise<void> {
  let waiting = 0;
  let release!: () => void;
  const opened = new Promise<void>((resolve) => {
    release = resolve;
  });
  return () => {
    waiting += 1;
    if (waiting >= parties) release();
    return opened;
  };
}

describe('withBookingTransaction trên MySQL thật', () => {
  it('BTX-10 (Q42) READ COMMITTED có thật: đọc lại trong cùng giao dịch THẤY dữ liệu mà kết nối khác vừa commit; đối chứng REPEATABLE READ thì không', async () => {
    const branch = await fx.branch({ ten: 'Trước' });
    const id = branch.chiNhanhId;
    const warn = vi.fn();
    const readTwice = async (em: EntityManager) => {
      const first = await nameOf(em, id);
      // một kết nối KHÁC (tự commit) đổi tên giữa hai lần đọc
      await rename(db, id, 'Sau');
      const second = await nameOf(em, id);
      return { first, second };
    };

    const result = await withBookingTransaction(db, readTwice, {
      label: 'btx-10',
      logger: { warn },
    });
    expect(result).toEqual({ first: 'Trước', second: 'Sau' });
    expect(warn).not.toHaveBeenCalled();

    // Đối chứng: cùng luồng ở REPEATABLE READ chỉ thấy ảnh chụp cũ, nên test này PHÂN BIỆT được hai mức
    await rename(db, id, 'Trước');
    const control = await db.transaction('REPEATABLE READ', readTwice);
    expect(control).toEqual({ first: 'Trước', second: 'Trước' });
  });

  it('BTX-11 (H2) deadlock THẬT: hai giao dịch khoá hai hàng theo thứ tự ngược nhau ⇒ MySQL báo 1213 cho đúng một bên, withBookingTransaction thử lại và cả hai kết thúc đúng', async () => {
    const a = (await fx.branch()).chiNhanhId;
    const b = (await fx.branch()).chiNhanhId;
    const warn = vi.fn<(message: string) => void>();
    const barrier = createBarrier(2);
    const runs = { t1: 0, t2: 0 };

    // Mỗi giao dịch khoá hàng đầu, chờ bên kia cũng đã khoá hàng đầu của nó (chỉ ở lần chạy ĐẦU), rồi xin hàng thứ hai của bên kia
    const flow = (name: 't1' | 't2', first: string, second: string) =>
      withBookingTransaction(
        db,
        async (em) => {
          runs[name] += 1;
          await rename(em, first, name);
          if (runs[name] === 1) await barrier();
          await rename(em, second, name);
          return name;
        },
        { label: `btx-11-${name}`, logger: { warn } },
      );

    const results = await Promise.all([flow('t1', a, b), flow('t2', b, a)]);

    expect(results).toEqual(['t1', 't2']);
    // Đúng một nạn nhân: 2 lần chạy đầu + 1 lần chạy lại của nạn nhân
    expect(runs.t1 + runs.t2).toBe(3);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('1213');
    // Bên chạy lại ghi sau cùng cả hai hàng nên hai hàng cùng một giá trị (không có kết quả nửa vời)
    const nameA = await nameOf(db.manager, a);
    const nameB = await nameOf(db.manager, b);
    expect(nameA).toBe(nameB);
    expect(['t1', 't2']).toContain(nameA);
  });
});
