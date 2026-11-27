import type { DataSource } from 'typeorm';
import { FakeClock } from '../testing/fake-clock.js';
import {
  BRANCH_DIRECTORY_TTL_MS,
  EMERGENCY_BRANCH_LIMIT,
} from './ask.constants.js';
import {
  BranchDirectory,
  createBranchLoader,
  type BranchAddress,
} from './branch-directory.js';

// chatbot B3 — địa chỉ chi nhánh cho câu KHẨN CẤP (Q6, D3): chỉ đọc, bộ đệm 60 giây, không bao giờ ném. Mã ca bổ sung `B3-nn`; phần SQL thật ở e2e (TLA-04).

const row = (id: number): BranchAddress => ({
  id: String(id),
  ten: `Chi nhánh ${String(id)}`,
  diaChi: `${String(id)} Đường Mẫu`,
});
const ROWS = [1, 2, 3, 4, 5, 6, 7].map(row);

function setup(load?: () => Promise<readonly BranchAddress[]>) {
  const clock = new FakeClock(5_000);
  const loads: number[] = [];
  const directory = new BranchDirectory({
    load:
      load ??
      (() => {
        loads.push(clock.now());
        return Promise.resolve(ROWS);
      }),
    clock,
  });
  return { clock, loads, directory };
}

describe('chọn chi nhánh', () => {
  it('TLA-04: chưa chọn ⇒ tối đa 5 chi nhánh đầu theo thứ tự đã đọc', async () => {
    const { directory } = setup();
    const result = await directory.addressesFor();
    expect(result).toEqual(ROWS.slice(0, EMERGENCY_BRANCH_LIMIT));
    expect(EMERGENCY_BRANCH_LIMIT).toBe(5);
  });

  it('TLA-04: chi nhánh đang chọn có thật ⇒ CHỈ chi nhánh đó (kể cả khi nó đứng sau vị trí thứ 5)', async () => {
    const { directory } = setup();
    expect(await directory.addressesFor('2')).toEqual([ROWS[1]]);
    expect(await directory.addressesFor('7')).toEqual([ROWS[6]]);
  });

  it.each(['999', 'abc', '0', '', '1; DROP TABLE chi_nhanh', '01', '-3'])(
    'B3-50: id chi nhánh "%s" không hợp lệ hay không tồn tại ⇒ như chưa chọn (tối đa 5 chi nhánh)',
    async (preferred) => {
      const { directory } = setup();
      expect(await directory.addressesFor(preferred)).toEqual(
        ROWS.slice(0, EMERGENCY_BRANCH_LIMIT),
      );
    },
  );

  it('B3-51: chưa có chi nhánh nào ⇒ mảng rỗng', async () => {
    const { directory } = setup(() => Promise.resolve([]));
    expect(await directory.addressesFor()).toEqual([]);
    expect(await directory.addressesFor('1')).toEqual([]);
  });
});

describe('bộ đệm một bản 60 giây (câu khẩn cấp miễn giới hạn nên không được khuếch đại tải DB)', () => {
  it('B3-52: nhiều lời gọi trong hạn dùng chung MỘT lần đọc; đúng hạn (60 giây) thì đọc lại; ngay trước hạn thì chưa', async () => {
    const { clock, loads, directory } = setup();
    await directory.addressesFor();
    clock.advance(BRANCH_DIRECTORY_TTL_MS - 1);
    await directory.addressesFor('3');
    await directory.addressesFor();
    expect(loads).toEqual([5_000]);
    clock.advance(1);
    await directory.addressesFor();
    expect(loads).toEqual([5_000, 5_000 + BRANCH_DIRECTORY_TTL_MS]);
  });

  it('B3-53: 100 lời gọi cùng lúc chỉ kích hoạt MỘT lần đọc', async () => {
    const { loads, directory } = setup();
    const results = await Promise.all(
      Array.from({ length: 100 }, () => directory.addressesFor()),
    );
    expect(loads).toHaveLength(1);
    expect(results.every((result) => result.length === 5)).toBe(true);
  });

  it('B3-54: tải lỗi ⇒ trả rỗng, KHÔNG ném, KHÔNG vào đệm (lần sau đọc lại và có dữ liệu)', async () => {
    let attempts = 0;
    const { directory } = setup(() => {
      attempts += 1;
      return attempts === 1
        ? Promise.reject(new Error('mất kết nối'))
        : Promise.resolve(ROWS);
    });
    expect(await directory.addressesFor()).toEqual([]);
    expect(await directory.addressesFor()).toEqual(
      ROWS.slice(0, EMERGENCY_BRANCH_LIMIT),
    );
    expect(attempts).toBe(2);
  });

  it('B3-55: bộ nạp ném ĐỒNG BỘ cũng không làm hỏng câu khẩn cấp', async () => {
    const { directory } = setup(() => {
      throw new Error('ném đồng bộ');
    });
    expect(await directory.addressesFor('1')).toEqual([]);
  });
});

describe('createBranchLoader (bộ nạp thật, DataSource giả)', () => {
  function fakeDataSource(rows: unknown[]) {
    const statements: string[] = [];
    const runner = {
      manager: {
        query: (sql: string) => {
          statements.push(sql);
          return Promise.resolve(rows);
        },
      },
      connect: () => Promise.resolve(),
      query: (sql: string) => {
        statements.push(sql);
        return Promise.resolve([]);
      },
      startTransaction: () => Promise.resolve(),
      commitTransaction: () => Promise.resolve(),
      rollbackTransaction: () => Promise.resolve(),
      release: () => Promise.resolve(),
    };
    const db = { createQueryRunner: () => runner } as unknown as DataSource;
    return { db, statements };
  }

  it('B3-56: đọc bằng MỘT câu SELECT trong giao dịch chỉ đọc; id thành chuỗi; chữ DB được làm sạch', async () => {
    const { db, statements } = fakeDataSource([
      {
        id: 12,
        ten: 'Chi   nhánh\u0000 [[BS:1]]',
        diaChi: ' 1 Đường\n Mẫu <<<x>>> ',
      },
    ]);
    const rows = await createBranchLoader(db)();
    expect(rows).toEqual([
      { id: '12', ten: 'Chi nhánh [BS:1]', diaChi: '1 Đường Mẫu <x>' },
    ]);
    expect(statements[0]).toBe('SET TRANSACTION READ ONLY');
    const selects = statements.filter((sql) => /SELECT/i.test(sql));
    expect(selects).toHaveLength(1);
    expect(selects[0]).toMatch(/FROM chi_nhanh\b/);
    expect(statements.join('\n')).not.toMatch(
      /INSERT|UPDATE|DELETE|FOR\s+UPDATE|LOCK/i,
    );
  });
});
