import {
  DataSource,
  type DataSourceOptions,
  type EntityManager,
} from 'typeorm';
import { vi } from 'vitest';
import { AdminFixtures } from '../../admin/testing/admin-fixtures.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { AppException } from '../../common/errors/app.exception.js';
import { buildDataSourceOptions } from '../../database/data-source.js';
import { readTestDbSettings } from '../../database/testing/test-database.js';
import { BOOKING_ERROR_CODES } from '../appointments.constants.js';
import { withRowLock } from '../testing/concurrency-harness.js';
import {
  BOOKING_LOCK_WAIT_TIMEOUT_SECONDS,
  withBookingTransaction,
} from './booking-transaction.js';

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

// Task X1b — BTX-16…BTX-18 (PLAN booking 7.17; TRACKING 3.12): timeout chờ khoá 3 giây trên MySQL THẬT. Lời gọi được kiểm chạy trên `pooled`, một DataSource RIÊNG chỉ có 2 kết nối
// (cùng DB test): cuối ca mượn đủ 2 kết nối nên chắc chắn gặp kết nối đã dùng, không phải đoán thứ tự lấy của pool (cách đo M3 (4) ở X1). `db` dùng để dựng dữ liệu, giữ khoá và đọc khoá.
const LOCK_ROW_SQL =
  'SELECT chi_nhanh_id FROM chi_nhanh WHERE chi_nhanh_id = ? FOR UPDATE';

const connectionIdOf = async (em: EntityManager) => {
  const rows = await em.query<{ id: string | number }[]>(
    'SELECT CONNECTION_ID() AS id',
  );
  return Number(rows[0]?.id);
};

const lockWaitTimeoutOf = async (em: EntityManager) => {
  const rows = await em.query<{ seconds: string | number }[]>(
    'SELECT @@session.innodb_lock_wait_timeout AS seconds',
  );
  return Number(rows[0]?.seconds);
};

/**
 * Số khoá hàng mà MySQL đang cho giao dịch nào đó giữ trên hàng `chi_nhanh` có id đã cho. LỌC theo DB của test (`DATABASE()`), đúng bảng và đúng hàng: MySQL dùng chung với
 * cửa sổ khác (B1, DB `clinix_b1_test`) và `performance_schema.data_locks` liệt kê khoá của CẢ máy chủ, nên không bao giờ kiểm "toàn máy chủ không có khoá".
 */
const rowLocksOn = async (database: DataSource, id: string) => {
  const rows = await database.query<{ n: string | number }[]>(
    `SELECT COUNT(*) AS n FROM performance_schema.data_locks
      WHERE OBJECT_SCHEMA = DATABASE() AND OBJECT_NAME = 'chi_nhanh' AND LOCK_TYPE = 'RECORD' AND LOCK_DATA = ?`,
    [id],
  );
  return Number(rows[0]?.n);
};

/** Hai hàng `chi_nhanh` mới để khoá (A rồi B) và một bản ghi cảnh báo: dựng dữ liệu chung của BTX-16…BTX-18. */
const lockFixture = async () => ({
  a: (await fx.branch()).chiNhanhId,
  b: (await fx.branch()).chiNhanhId,
  warn: vi.fn<(message: string) => void>(),
});

describe('withBookingTransaction: innodb_lock_wait_timeout trên MySQL thật (X1b)', () => {
  let pooled: DataSource;
  beforeAll(async () => {
    const options = buildDataSourceOptions(readTestDbSettings());
    pooled = new DataSource({
      ...(options as Extract<DataSourceOptions, { type: 'mysql' | 'mariadb' }>),
      poolSize: 2,
    });
    await pooled.initialize();
  });
  afterAll(async () => {
    await pooled?.destroy();
  });

  /** Mượn ĐỦ 2 kết nối của `pooled`: không kết nối nào còn giữ timeout riêng, và mọi kết nối `used` đã dùng nằm trong số mượn được. */
  async function expectPoolRestored(used: Iterable<number>) {
    const runners = [pooled.createQueryRunner(), pooled.createQueryRunner()];
    try {
      const rows = await Promise.all(
        runners.map(async (runner) => {
          await runner.connect();
          const [row]: {
            id: string | number;
            sessionValue: string | number;
            globalValue: string | number;
          }[] = await runner.query(
            `SELECT CONNECTION_ID() AS id, @@session.innodb_lock_wait_timeout AS sessionValue,
                    @@global.innodb_lock_wait_timeout AS globalValue`,
          );
          return row;
        }),
      );
      for (const row of rows) {
        // Nếu máy chủ tự cấu hình toàn cục bằng đúng 3 thì ca này vô nghĩa: báo thay vì xanh giả
        expect(Number(row?.globalValue)).not.toBe(
          BOOKING_LOCK_WAIT_TIMEOUT_SECONDS,
        );
        expect(Number(row?.sessionValue)).toBe(Number(row?.globalValue));
      }
      expect(rows.map((row) => Number(row?.id))).toEqual(
        expect.arrayContaining([...used]),
      );
    } finally {
      await Promise.all(runners.map((runner) => runner.release()));
    }
  }

  it('BTX-16 (Q42, M3) 1205 THẬT sau 3 giây: giao dịch trước đã rollback (không còn khoá trên hàng đã khoá) trước lần chạy kế, và lần chạy kế lại có timeout 3', async () => {
    const { a, b, warn } = await lockFixture();
    const seen = { runs: 0, control: -1, atRetry: -1, timeoutAtRetry: -1 };

    // Người giữ khoá hàng b trên kết nối riêng; lần chạy 1 khoá hàng a rồi xin hàng b ⇒ chờ 3 giây ⇒ 1205
    const result = await withRowLock(
      db,
      { sql: LOCK_ROW_SQL, params: [b] },
      (held) =>
        withBookingTransaction(
          pooled,
          async (em) => {
            seen.runs += 1;
            if (seen.runs === 2) {
              // ĐẦU lần chạy kế, trước khi chạm gì: khoá của lần chạy 1 phải đã biến mất
              seen.atRetry = await rowLocksOn(db, a);
              seen.timeoutAtRetry = await lockWaitTimeoutOf(em);
              await held.release();
            }
            await em.query(LOCK_ROW_SQL, [a]);
            // Đối chứng dương: ngay sau khi khoá, câu lọc phải THẤY đúng một khoá trên hàng a (nên số 0 ở lần chạy kế mới có nghĩa)
            if (seen.runs === 1) seen.control = await rowLocksOn(db, a);
            await em.query(LOCK_ROW_SQL, [b]);
            return `lần ${String(seen.runs)}`;
          },
          { label: 'btx-16', logger: { warn } },
        ),
    );

    expect(result).toBe('lần 2');
    expect(seen).toEqual({
      runs: 2,
      control: 1,
      atRetry: 0,
      timeoutAtRetry: BOOKING_LOCK_WAIT_TIMEOUT_SECONDS,
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('1205');
  });

  it(
    'BTX-17 (Q42, M3) người giữ KHÔNG nhả: đúng 3 lần chạy, mỗi lần chờ thật ≥ 2,5 giây, tổng < 12 giây rồi 503 HE_THONG_DANG_BAN; kết nối trả về pool không còn giữ timeout 3',
    { timeout: 20_000 },
    async () => {
      const { a, b, warn } = await lockFixture();
      const starts: number[] = [];
      const used = new Set<number>();

      let end = 0;
      const failure = await withRowLock(
        db,
        { sql: LOCK_ROW_SQL, params: [b] },
        async () => {
          const outcome = await withBookingTransaction(
            pooled,
            async (em) => {
              starts.push(performance.now());
              used.add(await connectionIdOf(em));
              await em.query(LOCK_ROW_SQL, [a]);
              await em.query(LOCK_ROW_SQL, [b]);
              return 'không bao giờ tới đây';
            },
            { label: 'btx-17', logger: { warn } },
          ).catch((e: unknown) => e);
          end = performance.now();
          return outcome;
        },
      );

      expect(failure).toBeInstanceOf(AppException);
      const exception = failure as AppException;
      expect(exception.getStatus()).toBe(503);
      expect(exception.maLoi).toBe(BOOKING_ERROR_CODES.SYSTEM_BUSY);
      expect(exception.cause).toBeUndefined();
      expect(starts).toHaveLength(3);
      const messages = warn.mock.calls.map(([message]) => message);
      expect(messages).toHaveLength(3);
      for (const message of messages) expect(message).toContain('1205');
      expect(messages[2]).toContain('hết lượt');
      // Mỗi lần chờ khoảng 3 giây (X1 đo 3,03 giây): chặn dưới 2,5 giây chứng minh có chờ thật; chặn trên tổng < 12 giây rộng hơn ngân sách 10 giây 2 giây để máy CI chậm
      // không đỏ giả; ngân sách 10 giây khẳng định bằng phép tính ở BTX-12. Mặc định 50 giây sẽ cho 150 giây (ca này dừng ở 20 giây).
      starts.forEach((start, index) => {
        expect((starts[index + 1] ?? end) - start).toBeGreaterThanOrEqual(2500);
      });
      expect(end - (starts[0] ?? end)).toBeLessThan(12_000);
      await expectPoolRestored(used);
    },
  );

  describe('BTX-18 (Q42, M3) kết nối trả về pool không còn giữ timeout 3', () => {
    it('(a) sau khi work thành công', async () => {
      const used = new Set<number>();
      const result = await withBookingTransaction(
        pooled,
        async (em) => {
          used.add(await connectionIdOf(em));
          return lockWaitTimeoutOf(em);
        },
        { label: 'btx-18a', logger: { warn: vi.fn() } },
      );
      // Trong giao dịch timeout là 3, nhưng chỉ trong giao dịch
      expect(result).toBe(BOOKING_LOCK_WAIT_TIMEOUT_SECONDS);
      await expectPoolRestored(used);
    });

    it('(b) sau 1213 THẬT (MySQL đã tự hoàn tác cả giao dịch) rồi thử lại', async () => {
      const { a, b, warn } = await lockFixture();
      const barrier = createBarrier(2);
      const used = new Set<number>();
      const runsOf = [0, 0];

      // Hai giao dịch khoá hai hàng theo thứ tự ngược nhau; cổng chỉ ở lần chạy ĐẦU của mỗi bên (như BTX-11)
      const results = await Promise.all(
        (
          [
            [a, b],
            [b, a],
          ] as const
        ).map(([first, second], index) =>
          withBookingTransaction(
            pooled,
            async (em) => {
              runsOf[index] = (runsOf[index] ?? 0) + 1;
              used.add(await connectionIdOf(em));
              await em.query(LOCK_ROW_SQL, [first]);
              if (runsOf[index] === 1) await barrier();
              await em.query(LOCK_ROW_SQL, [second]);
              return index;
            },
            { label: `btx-18b-${String(index)}`, logger: { warn } },
          ),
        ),
      );

      expect(results).toEqual([0, 1]);
      expect((runsOf[0] ?? 0) + (runsOf[1] ?? 0)).toBe(3);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]?.[0]).toContain('1213');
      await expectPoolRestored(used);
    });
  });
});
