import type { DataSource, EntityManager } from 'typeorm';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import { RefundPolicyReader } from './refund-policy.js';

// Task B7 — BCK-04 (TRACKING booking 3.18.3): `RefundPolicyReader` trên bảng `moc_hoan_tien` THẬT (P6 đã merge, dựng bằng migration): chỉ mốc của ĐÚNG dịch vụ, sắp giảm dần, không mốc ⇒ `[]`,
// cọc 0 ⇒ `null` mà KHÔNG truy vấn bảng. Hàm thuần và em giả: refund-policy.spec.ts (BCK-03). Dữ liệu giả.
let db: DataSource;
let fx: BookingFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
});

const reader = new RefundPolicyReader();

/** Thêm mốc cho một dịch vụ bằng SQL (chưa có fixture: P2b). */
async function addTiers(
  dichVuKhamId: string,
  tiers: readonly [soGio: number, tyLe: number][],
) {
  for (const [soGio, tyLe] of tiers)
    await db.query(
      'INSERT INTO moc_hoan_tien (dich_vu_kham_id, so_gio_truoc_toi_thieu, ty_le_hoan) VALUES (?, ?, ?)',
      [dichVuKhamId, soGio, tyLe],
    );
}

/** `em` bọc `db.manager` để đếm số câu truy vấn mà reader gửi đi. */
function counting(): { em: EntityManager; statements: string[] } {
  const statements: string[] = [];
  const em = {
    query: (sql: string, params?: unknown[]) => {
      statements.push(sql);
      return db.manager.query(sql, params);
    },
  } as unknown as EntityManager;
  return { em, statements };
}

describe('RefundPolicyReader trên moc_hoan_tien thật (BCK-04)', () => {
  it('BCK-04 chỉ mốc của ĐÚNG dịch vụ: mốc của dịch vụ khác không lẫn vào', async () => {
    const a = (await fx.admin.catalog()).service.dichVuKhamId;
    const b = (await fx.admin.catalog()).service.dichVuKhamId;
    await addTiers(a, [
      [24, 100],
      [2, 50],
    ]);
    await addTiers(b, [[48, 80]]);

    expect(await reader.read(db.manager, a, '50000.00')).toStrictEqual([
      { so_gio_truoc_toi_thieu: 24, ty_le_hoan: 100 },
      { so_gio_truoc_toi_thieu: 2, ty_le_hoan: 50 },
    ]);
    expect(await reader.read(db.manager, b, '50000.00')).toStrictEqual([
      { so_gio_truoc_toi_thieu: 48, ty_le_hoan: 80 },
    ]);
  });

  it('BCK-04 sắp GIẢM DẦN theo số giờ dù thứ tự chèn lộn, và kiểu là số (tinyint, int)', async () => {
    const id = (await fx.admin.catalog()).service.dichVuKhamId;
    await addTiers(id, [
      [0, 0],
      [24, 100],
      [2, 50],
      [12, 75],
    ]);

    const snapshot = await reader.read(db.manager, id, '10.00');

    expect(snapshot?.map((tier) => tier.so_gio_truoc_toi_thieu)).toStrictEqual([
      24, 12, 2, 0,
    ]);
    expect(snapshot?.map((tier) => tier.ty_le_hoan)).toStrictEqual([
      100, 75, 50, 0,
    ]);
    for (const tier of snapshot ?? []) {
      expect(typeof tier.so_gio_truoc_toi_thieu).toBe('number');
      expect(typeof tier.ty_le_hoan).toBe('number');
    }
  });

  it('BCK-04 cọc > 0 mà dịch vụ chưa có mốc ⇒ mảng RỖNG (không hoàn), khác null; dù dịch vụ khác có mốc', async () => {
    const withTiers = (await fx.admin.catalog()).service.dichVuKhamId;
    const without = (await fx.admin.catalog()).service.dichVuKhamId;
    await addTiers(withTiers, [[24, 100]]);

    expect(await reader.read(db.manager, without, '50000.00')).toStrictEqual(
      [],
    );
  });

  it('BCK-04 cọc 0 ⇒ null và KHÔNG truy vấn bảng, dù bảng có mốc; cọc 0.01 thì đọc', async () => {
    const id = (await fx.admin.catalog()).service.dichVuKhamId;
    await addTiers(id, [[24, 100]]);
    const zero = counting();
    const cent = counting();

    expect(await reader.read(zero.em, id, '0.00')).toBeNull();
    expect(zero.statements).toHaveLength(0);
    expect(await reader.read(cent.em, id, '0.01')).toStrictEqual([
      { so_gio_truoc_toi_thieu: 24, ty_le_hoan: 100 },
    ]);
    expect(cent.statements).toHaveLength(1);
  });

  it('BCK-04 id dịch vụ lớn hơn 2^53 đi bằng CHUỖI: so chính xác, id kề bên (2^53 và 2^53 + 2) không khớp nhầm', async () => {
    const id = (await fx.admin.catalog()).service.dichVuKhamId;
    // Đổi khoá chính sang 2^53 + 1 khi dịch vụ chưa có bảng con nào trỏ tới (mọi khoá ngoại còn rỗng)
    await db.query(
      'UPDATE dich_vu_kham SET dich_vu_kham_id = ? WHERE dich_vu_kham_id = ?',
      ['9007199254740993', id],
    );
    await addTiers('9007199254740993', [[24, 100]]);

    expect(
      await reader.read(db.manager, '9007199254740993', '10.00'),
    ).toStrictEqual([{ so_gio_truoc_toi_thieu: 24, ty_le_hoan: 100 }]);
    expect(
      await reader.read(db.manager, '9007199254740992', '10.00'),
    ).toStrictEqual([]);
    expect(
      await reader.read(db.manager, '9007199254740994', '10.00'),
    ).toStrictEqual([]);
  });
});
