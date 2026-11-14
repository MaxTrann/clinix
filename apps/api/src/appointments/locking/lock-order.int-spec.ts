import type { DataSource } from 'typeorm';
import {
  createTestDataSource,
  readTestDbSettings,
} from '../../database/testing/test-database.js';
import { LOCK_ORDER } from './lock-order.js';

// doctor-exam P2 (#392) — HDK-05, phần I: tên bảng của LOCK_ORDER phải là bảng thật trong MySQL.
// `findLockOrderViolation` BỎ QUA bảng không có trong bảng thứ tự, nên một tên gõ sai (ví dụ `ho_so_khams`) làm mọi chuỗi khoá chứa bảng đó
// qua giả; test đơn vị không bắt được vì danh sách mong đợi trong `lock-order.spec.ts` cũng do người gõ.
//
// Ba bảng tầng 7 của payment và wallet (scope #7) đã có tên trong bảng thứ tự theo PLAN booking 5.3 nhưng CHƯA có migration (đo ở lần chạy đầu của P2:
// DB đã áp mọi migration vẫn thiếu đúng ba bảng này). Chúng được miễn ở đây, ĐÍCH DANH; mọi bảng khác thiếu (kể cả `ho_so_kham`, `danh_gia_bac_si`) làm test đỏ.
// Kiểm LỎNG có chủ đích: khi migration của scope #7 vào `main` test vẫn xanh, không buộc PR của payment sửa file này; nên xoá ba tên khỏi danh sách để
// thu hẹp lỗ hổng (tên của ba bảng này chưa được kiểm cho tới lúc đó).
const NOT_YET_MIGRATED = [
  'giao_dich_thanh_toan',
  'lich_su_hoan_tien',
  'giao_dich_vi',
];

describe('HDK-05 tên bảng của LOCK_ORDER có thật trong MySQL', () => {
  let db: DataSource;
  beforeAll(async () => {
    db = await createTestDataSource(readTestDbSettings());
  });
  afterAll(async () => {
    await db?.destroy();
  });

  it('mọi bảng của mọi hạng là bảng thật, trừ đúng các bảng payment và wallet chưa có migration; hai bảng của 6b phải có', async () => {
    const rows: { name: string }[] = await db.query(
      'SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = ?',
      ['BASE TABLE'],
    );
    const existing = new Set(rows.map((row) => row.name));
    const missing = LOCK_ORDER.flatMap((rank) => rank.bang).filter(
      (table) => !existing.has(table),
    );
    expect(
      missing.filter((table) => !NOT_YET_MIGRATED.includes(table)),
    ).toEqual([]);
    expect(
      ['ho_so_kham', 'danh_gia_bac_si'].filter((table) => !existing.has(table)),
    ).toEqual([]);
  });
});
