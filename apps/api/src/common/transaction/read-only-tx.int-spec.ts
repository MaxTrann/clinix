import type { DataSource } from 'typeorm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestDataSource,
  readTestDbSettings,
} from '../../database/testing/test-database.js';
import { runReadOnly } from './read-only-tx.js';

// ROT-05, ROT-06 (booking P9): runReadOnly trên MySQL thật. Ba ca sẵn có (đọc đúng, câu ghi bị từ chối, kết nối trả pool sau khi chạy xong) ở
// search/common/public-doctor.int-spec.ts, không lặp lại ở đây. Dùng bảng chuyen_khoa với tên có tiền tố `rot-` và dọn đúng các dòng đó.
let db: DataSource;
beforeAll(async () => {
  db = await createTestDataSource(readTestDbSettings());
});
afterEach(async () => {
  await db.query("DELETE FROM chuyen_khoa WHERE ten LIKE 'rot-%'");
});
afterAll(async () => {
  await db?.destroy();
});

const TAGGED = "ten LIKE 'rot-%'";

/** Đếm dòng `chuyen_khoa` của test này; `runner` là DataSource (ngoài giao dịch) hoặc EntityManager (trong runReadOnly). */
async function countTagged(runner: Pick<DataSource, 'query'>): Promise<number> {
  const [row] = await runner.query<{ total: string }[]>(
    `SELECT COUNT(*) AS total FROM chuyen_khoa WHERE ${TAGGED}`,
  );
  return Number(row?.total);
}

describe('runReadOnly (booking P9, MySQL thật)', () => {
  it('ROT-05: hai câu đọc trong cùng giao dịch thấy cùng một ảnh chụp dù kết nối khác commit chen giữa', async () => {
    await db.query("INSERT INTO chuyen_khoa (ten) VALUES ('rot-a')");

    const seen = await runReadOnly(db, async (manager) => {
      // Ảnh chụp REPEATABLE READ của InnoDB lập ở câu đọc ĐẦU TIÊN của giao dịch, nên phải đọc một lần rồi mới cho commit chen vào
      const before = await countTagged(manager);
      // `db.query` lấy một kết nối khác trong pool và tự commit ngay
      await db.query("INSERT INTO chuyen_khoa (ten) VALUES ('rot-b')");
      const after = await countTagged(manager);
      const items = await manager.query<{ ten: string }[]>(
        `SELECT ten FROM chuyen_khoa WHERE ${TAGGED} ORDER BY ten`,
      );
      return { before, after, names: items.map((row) => row.ten) };
    });

    // `total` (after) khớp `items` (names) và cả hai là số cũ
    expect(seen).toEqual({ before: 1, after: 1, names: ['rot-a'] });
    // Đối chiếu: ngoài giao dịch và ở lần runReadOnly sau đã thấy dòng mới
    expect(await countTagged(db)).toBe(2);
    expect(await runReadOnly(db, (manager) => countTagged(manager))).toBe(2);
  });

  it('ROT-06: work ném lỗi sau một câu đọc — ném lại đúng lỗi, kết nối trả về pool và không dính chế độ chỉ đọc', async () => {
    const boom = new Error('work hỏng sau khi đọc');

    await expect(
      runReadOnly(db, async (manager) => {
        await countTagged(manager);
        throw boom;
      }),
    ).rejects.toBe(boom);

    // Ghi bình thường ngay sau đó (không bị READ ONLY dính lại), rồi runReadOnly lần sau vẫn chạy được
    await db.query(
      "INSERT INTO chuyen_khoa (ten) VALUES ('rot-ghi-binh-thuong')",
    );
    expect(await countTagged(db)).toBe(1);
    expect(await runReadOnly(db, (manager) => countTagged(manager))).toBe(1);
  });
});
