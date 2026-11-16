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
// Ba bảng tầng 7 của payment và wallet (giao_dich_thanh_toan, lich_su_hoan_tien, giao_dich_vi) từng được miễn ở đây vì chưa có migration
// (TECH_DEBT 145). Migration payment P1 đã tạo chúng nên danh sách miễn `NOT_YET_MIGRATED` được XOÁ: từ nay mọi tên bảng trong LOCK_ORDER
// đều phải có thật, bảng nào thiếu làm test đỏ.

// HDT-14 (phần tích hợp, payment P2): tên bảng của hạng 7a, 7b, 7c là bảng thật; chuỗi khoá mẫu ở lock-order.spec.ts.
describe('HDK-05 tên bảng của LOCK_ORDER có thật trong MySQL', () => {
  let db: DataSource;
  beforeAll(async () => {
    db = await createTestDataSource(readTestDbSettings());
  });
  afterAll(async () => {
    await db?.destroy();
  });

  it('mọi bảng của mọi hạng là bảng thật (không còn bảng được miễn); hai bảng của 6b và năm bảng tầng 7 của payment và wallet phải có', async () => {
    const rows: { name: string }[] = await db.query(
      'SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = ?',
      ['BASE TABLE'],
    );
    const existing = new Set(rows.map((row) => row.name));
    const missing = LOCK_ORDER.flatMap((rank) => rank.bang).filter(
      (table) => !existing.has(table),
    );
    expect(missing).toEqual([]);
    expect(
      [
        'ho_so_kham',
        'danh_gia_bac_si',
        'giao_dich_thanh_toan',
        'lich_su_hoan_tien',
        'giao_dich_vi',
        // payment P2: hai bảng mới của hạng 7a và 7c (migration P1)
        'yeu_cau_rut_tien',
        'lan_doi_soat_nap_vi',
      ].filter((table) => !existing.has(table)),
    ).toEqual([]);
  });
});
