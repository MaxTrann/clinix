import { QueryFailedError, type DataSource } from 'typeorm';
import { MocHoanTien } from '../admin/entities/moc-hoan-tien.entity.js';
import { AdminFixtures } from '../admin/testing/admin-fixtures.js';
import { useIntegrationHooks } from '../auth/testing/int-hooks.js';
import { isDuplicateKeyError, isForeignKeyError } from './mysql-errors.js';

// Booking P6 (Q15) — bảng moc_hoan_tien trên MySQL 8.4 THẬT (MHT-04…MHT-08). MHT-01 và MHT-02 ở migration-source.spec.ts,
// MHT-03 là test SHOW CREATE TABLE của schema-parity.int-spec.ts, MHT-09 ở migrations.int-spec.ts.
let db: DataSource;
let fx: AdminFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new AdminFixtures(d);
});

/** Hai dịch vụ khám thật (khóa ngoại của mốc hoàn tiền trỏ vào đây). */
async function twoServices(): Promise<[string, string]> {
  const first = await fx.catalog();
  const second = await fx.catalog();
  return [first.service.dichVuKhamId, second.service.dichVuKhamId];
}

const insertTier = (dichVuKhamId: string, soGio: number, tyLe: number) =>
  db.query(
    'INSERT INTO moc_hoan_tien (dich_vu_kham_id, so_gio_truoc_toi_thieu, ty_le_hoan) VALUES (?, ?, ?)',
    [dichVuKhamId, soGio, tyLe],
  );

async function countTiers(): Promise<number> {
  const rows = (await db.query(
    'SELECT COUNT(*) AS total FROM moc_hoan_tien',
  )) as { total: string | number }[];
  return Number(rows[0]?.total);
}

/** Lỗi MySQL mà câu lệnh ném ra; câu lệnh chạy thành công thì làm test đỏ. */
async function rejected(work: Promise<unknown>): Promise<QueryFailedError> {
  const error = await work.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(error, 'câu lệnh phải bị MySQL từ chối').toBeInstanceOf(
    QueryFailedError,
  );
  return error as QueryFailedError;
}

describe('moc_hoan_tien trên MySQL thật', () => {
  it('MHT-04: cột, khóa chính, UNIQUE, khóa ngoại và CHECK có thật; đúng hai chỉ mục, không chỉ mục ngầm thừa', async () => {
    const columns = (await db.query(
      `SELECT COLUMN_NAME AS name, DATA_TYPE AS type, IS_NULLABLE AS nullable, COLUMN_DEFAULT AS def, EXTRA AS extra
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'moc_hoan_tien'
        ORDER BY ORDINAL_POSITION`,
    )) as {
      name: string;
      type: string;
      nullable: string;
      def: string | null;
      extra: string;
    }[];
    expect(columns).toEqual([
      {
        name: 'moc_hoan_tien_id',
        type: 'bigint',
        nullable: 'NO',
        def: null,
        extra: 'auto_increment',
      },
      {
        name: 'dich_vu_kham_id',
        type: 'bigint',
        nullable: 'NO',
        def: null,
        extra: '',
      },
      {
        name: 'so_gio_truoc_toi_thieu',
        type: 'int',
        nullable: 'NO',
        def: null,
        extra: '',
      },
      {
        name: 'ty_le_hoan',
        type: 'tinyint',
        nullable: 'NO',
        def: null,
        extra: '',
      },
    ]);

    // Chỉ có khóa chính và UNIQUE (dich_vu_kham_id, so_gio_truoc_toi_thieu); khóa ngoại dùng luôn chỉ mục UNIQUE
    const statistics = (await db.query(
      `SELECT INDEX_NAME AS name, NON_UNIQUE AS nonUnique, COLUMN_NAME AS col
         FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'moc_hoan_tien'
        ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
    )) as { name: string; nonUnique: number; col: string }[];
    expect(statistics.every((row) => Number(row.nonUnique) === 0)).toBe(true);
    const indexes: Record<string, string[]> = {};
    for (const row of statistics) (indexes[row.name] ??= []).push(row.col);
    expect(indexes).toEqual({
      PRIMARY: ['moc_hoan_tien_id'],
      moc_hoan_tien_index_1: ['dich_vu_kham_id', 'so_gio_truoc_toi_thieu'],
    });

    const foreignKeys = (await db.query(
      `SELECT CONSTRAINT_NAME AS name, COLUMN_NAME AS col, REFERENCED_TABLE_NAME AS refTable, REFERENCED_COLUMN_NAME AS refCol
         FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'moc_hoan_tien' AND REFERENCED_TABLE_NAME IS NOT NULL`,
    )) as { name: string; col: string; refTable: string; refCol: string }[];
    expect(foreignKeys).toEqual([
      {
        name: 'moc_hoan_tien_ibfk_1',
        col: 'dich_vu_kham_id',
        refTable: 'dich_vu_kham',
        refCol: 'dich_vu_kham_id',
      },
    ]);

    const checks = (await db.query(
      `SELECT tc.CONSTRAINT_NAME AS name, cc.CHECK_CLAUSE AS clause
         FROM information_schema.TABLE_CONSTRAINTS tc
         JOIN information_schema.CHECK_CONSTRAINTS cc
           ON cc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA AND cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
        WHERE tc.TABLE_SCHEMA = DATABASE() AND tc.TABLE_NAME = 'moc_hoan_tien' AND tc.CONSTRAINT_TYPE = 'CHECK'`,
    )) as { name: string; clause: string }[];
    expect(checks.map((row) => row.name)).toEqual(['chk_moc_hoan_ty_le']);
    expect(checks[0]?.clause).toMatch(/ty_le_hoan.*between 0 and 100/i);
  });

  it('MHT-05: trùng (dich_vu_kham_id, so_gio_truoc_toi_thieu) bị UNIQUE từ chối (1062) dù khác tỷ lệ; đổi một thành phần thì chèn được', async () => {
    const [serviceA, serviceB] = await twoServices();
    await insertTier(serviceA, 24, 100);

    const error = await rejected(insertTier(serviceA, 24, 50));
    expect(isDuplicateKeyError(error)).toBe(true);
    expect(error.message).toContain('moc_hoan_tien_index_1');
    expect(await countTiers()).toBe(1);

    await insertTier(serviceA, 2, 50); // cùng dịch vụ, khác giờ
    await insertTier(serviceB, 24, 100); // khác dịch vụ, cùng giờ
    expect(await countTiers()).toBe(3);
  });

  it('MHT-06: ty_le_hoan ngoài 0..100 (-1, 101, 127) bị CHECK chk_moc_hoan_ty_le từ chối; 0 và 100 (biên) và mốc 0 giờ hợp lệ', async () => {
    const [service] = await twoServices();

    for (const tyLe of [-1, 101, 127]) {
      const error = await rejected(insertTier(service, 24, tyLe));
      expect(error.message, `ty_le_hoan = ${tyLe}`).toContain(
        'chk_moc_hoan_ty_le',
      );
    }
    expect(await countTiers()).toBe(0);

    await insertTier(service, 24, 100); // biên trên
    await insertTier(service, 0, 0); // biên dưới, mốc 0 giờ (ví dụ 2.4: 0 giờ -> 0)
    expect(await countTiers()).toBe(2);
  });

  it('MHT-07: dịch vụ không tồn tại bị khóa ngoại từ chối (1452); xóa dịch vụ còn mốc bị chặn (1451); xóa mốc trước thì xóa được', async () => {
    const [service] = await twoServices();

    const missing = await rejected(insertTier('999999999', 24, 100));
    expect(isForeignKeyError(missing)).toBe(true);
    expect((missing.driverError as { errno?: number }).errno).toBe(1452);
    expect(await countTiers()).toBe(0);

    await insertTier(service, 24, 100);
    const blocked = await rejected(
      db.query('DELETE FROM dich_vu_kham WHERE dich_vu_kham_id = ?', [service]),
    );
    expect(isForeignKeyError(blocked)).toBe(true);
    expect((blocked.driverError as { errno?: number }).errno).toBe(1451);
    expect(await countTiers()).toBe(1);

    await db.query('DELETE FROM moc_hoan_tien WHERE dich_vu_kham_id = ?', [
      service,
    ]);
    await db.query('DELETE FROM dich_vu_kham WHERE dich_vu_kham_id = ?', [
      service,
    ]);
    expect(await countTiers()).toBe(0);
  });

  it('MHT-08: entity MocHoanTien ghi và đọc đúng kiểu (id, dichVuKhamId là chuỗi; giờ, tỷ lệ là số) và trả các mốc theo thứ tự giờ giảm dần', async () => {
    const [serviceA, serviceB] = await twoServices();
    const repo = db.getRepository(MocHoanTien);
    // Lưu không theo thứ tự giờ để thứ tự trả về là do `order`, không do thứ tự chèn
    for (const [dichVuKhamId, soGioTruocToiThieu, tyLeHoan] of [
      [serviceA, 2, 50],
      [serviceA, 24, 100],
      [serviceB, 24, 100],
      [serviceA, 0, 0],
    ] as const) {
      await repo.save(
        repo.create({ dichVuKhamId, soGioTruocToiThieu, tyLeHoan }),
      );
    }

    const tiers = await repo.find({
      where: { dichVuKhamId: serviceA },
      order: { soGioTruocToiThieu: 'DESC' },
    });
    expect(
      tiers.map((tier) => [tier.soGioTruocToiThieu, tier.tyLeHoan]),
    ).toEqual([
      [24, 100],
      [2, 50],
      [0, 0],
    ]);
    for (const tier of tiers) {
      expect(typeof tier.mocHoanTienId).toBe('string');
      expect(tier.dichVuKhamId).toBe(serviceA);
      expect(typeof tier.soGioTruocToiThieu).toBe('number');
      expect(typeof tier.tyLeHoan).toBe('number');
    }
    expect(await repo.countBy({ dichVuKhamId: serviceB })).toBe(1);
  });
});
