import { QueryFailedError, type DataSource, type EntityTarget } from 'typeorm';
import {
  HANH_DONG_NHAY_CAM,
  LOAI_DOI_TUONG_NHAT_KY,
} from '../../admin/entities/enums.js';
import { AdminFixtures } from '../../admin/testing/admin-fixtures.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import {
  isDuplicateKeyError,
  isForeignKeyError,
} from '../../database/mysql-errors.js';
import { DanhGiaBacSi } from './danh-gia-bac-si.entity.js';
import { HoSoKham } from './ho-so-kham.entity.js';

// doctor-exam P1 (#391) — hai bảng ho_so_kham và danh_gia_bac_si trên MySQL 8.4 THẬT (MGK-01…MGK-04, MGK-09).
// MGK-01/02 phần chữ DDL ở database/migration-source.spec.ts, MGK-05 (SHOW CREATE TABLE) ở database/schema-parity.int-spec.ts,
// MGK-06 (up/down/up) ở database/migrations.int-spec.ts, MGK-07/08 ở database/registry.spec.ts.
let db: DataSource;
let fx: AdminFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new AdminFixtures(d);
});

const AT = '2026-11-02 09:00:00';
type ExamTable = 'ho_so_kham' | 'danh_gia_bac_si';

/** Hai lịch hẹn thật (hai khung giờ khác nhau vì khung giờ đang giữ là UNIQUE): lịch hẹn là khóa ngoại của cả hai bảng. */
async function twoAppointments(): Promise<[string, string]> {
  const doctor = await fx.doctor(await fx.branch());
  const patient = await fx.patient();
  const shift = await fx.shift(doctor.profile);
  const slots = [
    await fx.slot(shift),
    await fx.slot(shift, { ngayGio: new Date('2026-11-02T08:30:00+07:00') }),
  ];
  const ids: string[] = [];
  for (const slot of slots) {
    const appointment = await fx.appointment(
      doctor.profile,
      slot,
      patient.account.taiKhoanId,
    );
    ids.push(appointment.lichHenId);
  }
  return [ids[0] as string, ids[1] as string];
}

const insertRecord = (
  lichHenId: string | null,
  trieuChung: string | null = null,
) =>
  db.query(
    'INSERT INTO ho_so_kham (lich_hen_id, trieu_chung, cap_nhat_lan_cuoi) VALUES (?, ?, ?)',
    [lichHenId, trieuChung, AT],
  );

/** `hidden` không truyền: để MySQL dùng mặc định của bi_an và ly_do_an. */
const insertRating = (
  lichHenId: string | null,
  soSao: number | null,
  hidden?: { biAn: number; lyDoAn: string | null },
) =>
  hidden === undefined
    ? db.query(
        'INSERT INTO danh_gia_bac_si (lich_hen_id, so_sao, thoi_diem_tao) VALUES (?, ?, ?)',
        [lichHenId, soSao, AT],
      )
    : db.query(
        'INSERT INTO danh_gia_bac_si (lich_hen_id, so_sao, bi_an, ly_do_an, thoi_diem_tao) VALUES (?, ?, ?, ?, ?)',
        [lichHenId, soSao, hidden.biAn, hidden.lyDoAn, AT],
      );

async function countRows(table: ExamTable): Promise<number> {
  const rows = (await db.query(`SELECT COUNT(*) AS total FROM ${table}`)) as {
    total: string | number;
  }[];
  return Number(rows[0]?.total);
}

/** Lỗi MySQL mà câu lệnh ném ra (kèm mã lỗi); câu lệnh chạy thành công thì làm test đỏ. */
async function rejected(
  work: Promise<unknown>,
): Promise<{ error: QueryFailedError; errno: number | undefined }> {
  const error = await work.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(error, 'câu lệnh phải bị MySQL từ chối').toBeInstanceOf(
    QueryFailedError,
  );
  const failed = error as QueryFailedError;
  return {
    error: failed,
    errno: (failed.driverError as { errno?: number }).errno,
  };
}

/** Cột, chỉ mục, khóa ngoại và CHECK của một bảng, đọc từ information_schema của DB test. */
async function describeTable(table: ExamTable) {
  const columns = (await db.query(
    `SELECT COLUMN_NAME AS name, COLUMN_TYPE AS type, IS_NULLABLE AS nullable, COLUMN_DEFAULT AS def, EXTRA AS extra
       FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`,
    [table],
  )) as {
    name: string;
    type: string;
    nullable: string;
    def: string | null;
    extra: string;
  }[];
  const statistics = (await db.query(
    `SELECT INDEX_NAME AS name, NON_UNIQUE AS nonUnique, COLUMN_NAME AS col FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
    [table],
  )) as { name: string; nonUnique: number | string; col: string }[];
  const indexes: Record<string, string[]> = {};
  for (const row of statistics) (indexes[row.name] ??= []).push(row.col);
  const uniqueIndexes = [
    ...new Set(
      statistics
        .filter((row) => Number(row.nonUnique) === 0)
        .map((r) => r.name),
    ),
  ].sort();
  const foreignKeys = (await db.query(
    `SELECT CONSTRAINT_NAME AS name, COLUMN_NAME AS col, REFERENCED_TABLE_NAME AS refTable, REFERENCED_COLUMN_NAME AS refCol
       FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL`,
    [table],
  )) as { name: string; col: string; refTable: string; refCol: string }[];
  const checks = (await db.query(
    `SELECT tc.CONSTRAINT_NAME AS name, cc.CHECK_CLAUSE AS clause
       FROM information_schema.TABLE_CONSTRAINTS tc
       JOIN information_schema.CHECK_CONSTRAINTS cc
         ON cc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA AND cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
      WHERE tc.TABLE_SCHEMA = DATABASE() AND tc.TABLE_NAME = ? AND tc.CONSTRAINT_TYPE = 'CHECK'
      ORDER BY tc.CONSTRAINT_NAME`,
    [table],
  )) as { name: string; clause: string }[];
  return { columns, indexes, uniqueIndexes, foreignKeys, checks };
}

const NOT_NULL = { nullable: 'NO', def: null, extra: '' };
const NULLABLE = { nullable: 'YES', def: null, extra: '' };

describe('ho_so_kham và danh_gia_bac_si trên MySQL thật', () => {
  it('MGK-01: ho_so_kham — đúng 7 cột, ba cột text và ngày tái khám cho NULL, cap_nhat_lan_cuoi NOT NULL không mặc định, UNIQUE lich_hen_id (đúng hai chỉ mục), một khóa ngoại sang lich_hen, không CHECK', async () => {
    const shape = await describeTable('ho_so_kham');
    expect(shape.columns).toEqual([
      {
        name: 'ho_so_kham_id',
        type: 'bigint',
        ...NOT_NULL,
        extra: 'auto_increment',
      },
      { name: 'lich_hen_id', type: 'bigint', ...NOT_NULL },
      { name: 'trieu_chung', type: 'text', ...NULLABLE },
      { name: 'chan_doan_so_bo', type: 'text', ...NULLABLE },
      { name: 'huong_xu_ly', type: 'text', ...NULLABLE },
      { name: 'ngay_tai_kham_du_kien', type: 'date', ...NULLABLE },
      { name: 'cap_nhat_lan_cuoi', type: 'datetime', ...NOT_NULL },
    ]);
    // Khóa ngoại dùng luôn chỉ mục UNIQUE của lich_hen_id: không có chỉ mục ngầm thừa
    expect(shape.indexes).toEqual({
      PRIMARY: ['ho_so_kham_id'],
      lich_hen_id: ['lich_hen_id'],
    });
    expect(shape.uniqueIndexes).toEqual(['PRIMARY', 'lich_hen_id']);
    expect(shape.foreignKeys).toEqual([
      {
        name: 'ho_so_kham_ibfk_1',
        col: 'lich_hen_id',
        refTable: 'lich_hen',
        refCol: 'lich_hen_id',
      },
    ]);
    expect(shape.checks).toEqual([]);
  });

  it('MGK-02: danh_gia_bac_si — đúng 7 cột, bi_an boolean NOT NULL mặc định 0, ly_do_an varchar(255) NULL, UNIQUE lich_hen_id (đúng hai chỉ mục), khóa ngoại sang lich_hen, hai CHECK có tên đúng', async () => {
    const shape = await describeTable('danh_gia_bac_si');
    expect(shape.columns).toEqual([
      {
        name: 'danh_gia_bac_si_id',
        type: 'bigint',
        ...NOT_NULL,
        extra: 'auto_increment',
      },
      { name: 'lich_hen_id', type: 'bigint', ...NOT_NULL },
      { name: 'so_sao', type: 'tinyint', ...NOT_NULL },
      { name: 'nhan_xet', type: 'text', ...NULLABLE },
      { name: 'bi_an', type: 'tinyint(1)', ...NOT_NULL, def: '0' },
      { name: 'ly_do_an', type: 'varchar(255)', ...NULLABLE },
      { name: 'thoi_diem_tao', type: 'datetime', ...NOT_NULL },
    ]);
    expect(shape.indexes).toEqual({
      PRIMARY: ['danh_gia_bac_si_id'],
      lich_hen_id: ['lich_hen_id'],
    });
    expect(shape.uniqueIndexes).toEqual(['PRIMARY', 'lich_hen_id']);
    expect(shape.foreignKeys).toEqual([
      {
        name: 'danh_gia_bac_si_ibfk_1',
        col: 'lich_hen_id',
        refTable: 'lich_hen',
        refCol: 'lich_hen_id',
      },
    ]);
    expect(shape.checks.map((check) => check.name)).toEqual([
      'chk_danh_gia_an',
      'chk_danh_gia_so_sao',
    ]);
    expect(shape.checks[0]?.clause).toMatch(/bi_an.*ly_do_an/i);
    expect(shape.checks[1]?.clause).toMatch(/so_sao.*between 1 and 5/i);
  });

  it('MGK-01, MGK-02: entity khớp bảng thật — tập cột, tên CHECK và UNIQUE trong metadata TypeORM bằng đúng cái DB có (decorator không thành chữ chết)', async () => {
    const pairs: [EntityTarget<object>, ExamTable][] = [
      [HoSoKham, 'ho_so_kham'],
      [DanhGiaBacSi, 'danh_gia_bac_si'],
    ];
    for (const [entity, table] of pairs) {
      const metadata = db.getMetadata(entity);
      const shape = await describeTable(table);
      expect(metadata.tableName).toBe(table);
      expect(metadata.columns.map((c) => c.databaseName).sort(), table).toEqual(
        shape.columns.map((c) => c.name).sort(),
      );
      expect(metadata.checks.map((c) => c.name).sort(), table).toEqual(
        shape.checks.map((c) => c.name),
      );
      expect(
        metadata.indices
          .filter((index) => index.isUnique)
          .map((index) => index.name)
          .sort(),
        table,
      ).toEqual(shape.uniqueIndexes.filter((name) => name !== 'PRIMARY'));
    }
  });

  it('MGK-01, MGK-02: ghi và đọc qua entity đúng kiểu (id là chuỗi, soSao là số, biAn là boolean mặc định false, cột NULL đọc ra null, ngày tái khám lưu đúng ngày)', async () => {
    const [lichA, lichB] = await twoAppointments();
    const at = new Date('2026-11-02T02:00:00.000Z');
    const records = db.getRepository(HoSoKham);
    const savedRecord = await records.save(
      records.create({
        lichHenId: lichA,
        trieuChung: 'Ho kéo dài',
        huongXuLy: 'Nghỉ ngơi',
        ngayTaiKhamDuKien: '2026-12-01',
        capNhatLanCuoi: at,
      }),
    );
    const record = await records.findOneByOrFail({
      hoSoKhamId: savedRecord.hoSoKhamId,
    });
    expect(typeof record.hoSoKhamId).toBe('string');
    expect(record.lichHenId).toBe(lichA);
    expect(record.trieuChung).toBe('Ho kéo dài');
    expect(record.chanDoanSoBo).toBeNull();
    expect(record.capNhatLanCuoi.getTime()).toBe(at.getTime());
    // DATE_FORMAT để kết quả không phụ thuộc múi giờ của máy chạy test (CI chạy UTC, máy dev chạy UTC+7)
    const days = (await db.query(
      "SELECT DATE_FORMAT(ngay_tai_kham_du_kien, '%Y-%m-%d') AS ngay FROM ho_so_kham",
    )) as { ngay: string }[];
    expect(days).toEqual([{ ngay: '2026-12-01' }]);

    const ratings = db.getRepository(DanhGiaBacSi);
    const savedRating = await ratings.save(
      ratings.create({ lichHenId: lichB, soSao: 4, thoiDiemTao: at }),
    );
    const rating = await ratings.findOneByOrFail({
      danhGiaBacSiId: savedRating.danhGiaBacSiId,
    });
    expect(typeof rating.danhGiaBacSiId).toBe('string');
    expect(rating.lichHenId).toBe(lichB);
    expect(rating.soSao).toBe(4);
    expect(rating.biAn).toBe(false);
    expect(rating.nhanXet).toBeNull();
    expect(rating.lyDoAn).toBeNull();
    expect(rating.thoiDiemTao.getTime()).toBe(at.getTime());
  });

  it('MGK-03: so_sao ngoài 1..5 (-1, 0, 6, 127) bị chk_danh_gia_so_sao từ chối (3819); 1 và 5 (biên) nhận; so_sao NULL bị NOT NULL từ chối (1048)', async () => {
    const [lichA, lichB] = await twoAppointments();
    for (const soSao of [-1, 0, 6, 127]) {
      const { error, errno } = await rejected(insertRating(lichA, soSao));
      expect(errno, `so_sao = ${soSao}`).toBe(3819);
      expect(error.message, `so_sao = ${soSao}`).toContain(
        'chk_danh_gia_so_sao',
      );
    }
    expect(await countRows('danh_gia_bac_si')).toBe(0);

    await insertRating(lichA, 1); // biên dưới
    await insertRating(lichB, 5); // biên trên
    expect(await countRows('danh_gia_bac_si')).toBe(2);

    await db.query('DELETE FROM danh_gia_bac_si');
    expect((await rejected(insertRating(lichA, null))).errno).toBe(1048);
  });

  it('MGK-03: chk_danh_gia_an — (bi_an, ly_do_an): (0, NULL) và (1, lý do) nhận; (0, lý do), (1, NULL) và bi_an ngoài 0/1 bị từ chối (3819); bi_an không truyền thì mặc định 0', async () => {
    const [lichA, lichB] = await twoAppointments();
    const cases: [number, string | null][] = [
      [0, 'lý do khi chưa ẩn'],
      [1, null],
      [2, 'lý do'],
    ];
    for (const [biAn, lyDoAn] of cases) {
      const { error, errno } = await rejected(
        insertRating(lichA, 3, { biAn, lyDoAn }),
      );
      expect(errno, `(${biAn}, ${String(lyDoAn)})`).toBe(3819);
      expect(error.message).toContain('chk_danh_gia_an');
    }
    expect(await countRows('danh_gia_bac_si')).toBe(0);

    await insertRating(lichA, 3, { biAn: 0, lyDoAn: null });
    await insertRating(lichB, 3, { biAn: 1, lyDoAn: 'Nội dung vi phạm' });
    expect(await countRows('danh_gia_bac_si')).toBe(2);

    // Không truyền bi_an: mặc định 0; ly_do_an có nội dung mà bi_an vẫn 0 (mặc định) thì CHECK từ chối
    await db.query('DELETE FROM danh_gia_bac_si');
    await insertRating(lichA, 3);
    const rows = (await db.query(
      'SELECT bi_an AS biAn, ly_do_an AS lyDoAn FROM danh_gia_bac_si',
    )) as { biAn: number; lyDoAn: string | null }[];
    expect(rows).toEqual([{ biAn: 0, lyDoAn: null }]);
    await db.query('DELETE FROM danh_gia_bac_si');
    await expect(
      db.query(
        'INSERT INTO danh_gia_bac_si (lich_hen_id, so_sao, ly_do_an, thoi_diem_tao) VALUES (?, 3, ?, ?)',
        [lichA, 'chỉ có lý do', AT],
      ),
    ).rejects.toThrow(/chk_danh_gia_an/);

    // Biên: DB chỉ ép "ly_do_an NOT NULL" khi ẩn, chuỗi rỗng vẫn nhận; chặn chuỗi rỗng là việc của service (KDD, Q8)
    await insertRating(lichB, 3, { biAn: 1, lyDoAn: '' });
    expect(await countRows('danh_gia_bac_si')).toBe(1);
  });

  it('MGK-04: UNIQUE lich_hen_id ở MỖI bảng — hai dòng cùng lịch bị từ chối (1062, đúng tên khóa), lịch khác nhận; một lịch có đủ một hồ sơ và một đánh giá', async () => {
    const [lichA, lichB] = await twoAppointments();

    await insertRecord(lichA);
    const dupRecord = await rejected(insertRecord(lichA, 'lần hai'));
    expect(isDuplicateKeyError(dupRecord.error)).toBe(true);
    expect(dupRecord.errno).toBe(1062);
    expect(dupRecord.error.message).toContain('ho_so_kham.lich_hen_id');
    expect(await countRows('ho_so_kham')).toBe(1);
    await insertRecord(lichB);
    expect(await countRows('ho_so_kham')).toBe(2);

    await insertRating(lichA, 5);
    const dupRating = await rejected(insertRating(lichA, 1));
    expect(isDuplicateKeyError(dupRating.error)).toBe(true);
    expect(dupRating.errno).toBe(1062);
    expect(dupRating.error.message).toContain('danh_gia_bac_si.lich_hen_id');
    expect(await countRows('danh_gia_bac_si')).toBe(1);
    // Hai UNIQUE độc lập: lịch A đã có cả hồ sơ lẫn đánh giá (chèn ở trên), lịch B có hồ sơ và nhận thêm đánh giá
    await insertRating(lichB, 2);
    expect(await countRows('danh_gia_bac_si')).toBe(2);
  });

  it('MGK-04: khóa ngoại — lich_hen_id không tồn tại bị từ chối (1452) ở cả hai bảng; xóa lịch còn hồ sơ hay đánh giá bị chặn (1451); lich_hen_id NULL bị NOT NULL (1048)', async () => {
    const [lichA, lichB] = await twoAppointments();

    // Hàm trả promise (không tạo sẵn cả hai) để mỗi lời gọi chạy và được bắt lỗi lần lượt
    const insertMissing = [
      () => insertRecord('999999999'),
      () => insertRating('999999999', 3),
    ];
    for (const attempt of insertMissing) {
      const { error, errno } = await rejected(attempt());
      expect(isForeignKeyError(error)).toBe(true);
      expect(errno).toBe(1452);
    }
    expect((await rejected(insertRecord(null))).errno).toBe(1048);
    expect((await rejected(insertRating(null, 3))).errno).toBe(1048);

    await insertRecord(lichA);
    await insertRating(lichB, 4);
    for (const lichHenId of [lichA, lichB]) {
      const { error, errno } = await rejected(
        db.query('DELETE FROM lich_hen WHERE lich_hen_id = ?', [lichHenId]),
      );
      expect(isForeignKeyError(error)).toBe(true);
      expect(errno).toBe(1451);
    }
    expect(await countRows('ho_so_kham')).toBe(1);
    expect(await countRows('danh_gia_bac_si')).toBe(1);
  });

  it('MGK-04: NOT NULL không mặc định — thiếu cap_nhat_lan_cuoi hay thoi_diem_tao bị từ chối (1364); DB cho ba cột text của hồ sơ để NULL (bắt buộc có nội dung chỉ ở service, Q2)', async () => {
    const [lichA, lichB] = await twoAppointments();
    const noUpdatedAt = await rejected(
      db.query('INSERT INTO ho_so_kham (lich_hen_id) VALUES (?)', [lichA]),
    );
    expect(noUpdatedAt.errno).toBe(1364);
    const noCreatedAt = await rejected(
      db.query(
        'INSERT INTO danh_gia_bac_si (lich_hen_id, so_sao) VALUES (?, 3)',
        [lichB],
      ),
    );
    expect(noCreatedAt.errno).toBe(1364);
    expect(await countRows('ho_so_kham')).toBe(0);
    expect(await countRows('danh_gia_bac_si')).toBe(0);

    await insertRecord(lichA); // trieu_chung, chan_doan_so_bo, huong_xu_ly, ngay_tai_kham_du_kien đều NULL
    const rows = (await db.query(
      'SELECT trieu_chung AS a, chan_doan_so_bo AS b, huong_xu_ly AS c, ngay_tai_kham_du_kien AS d FROM ho_so_kham',
    )) as Record<string, null>[];
    expect(rows).toEqual([{ a: null, b: null, c: null, d: null }]);
  });
});

describe('MGK-09: ENUM nhật ký đã có sẵn giá trị cho hồ sơ khám và đánh giá (không cần migration ENUM)', () => {
  async function enumValues(column: string): Promise<string[]> {
    const rows = (await db.query(
      'SHOW COLUMNS FROM `nhat_ky_hanh_dong` LIKE ?',
      [column],
    )) as { Type: string }[];
    return [...(rows[0]?.Type ?? '').matchAll(/'([^']+)'/g)].map(
      (match) => match[1] as string,
    );
  }

  it('MGK-09: SHOW COLUMNS thật có SuaGhiChuKham, AnDanhGia, ho_so_kham, danh_gia_bac_si; admin/entities/enums.ts có đủ bốn giá trị; DB nhận một dòng nhật ký cho mỗi cặp', async () => {
    const actions = ['SuaGhiChuKham', 'AnDanhGia'] as const;
    const targets = ['ho_so_kham', 'danh_gia_bac_si'] as const;
    expect(await enumValues('hanh_dong')).toEqual(
      expect.arrayContaining([...actions]),
    );
    expect(await enumValues('loai_doi_tuong')).toEqual(
      expect.arrayContaining([...targets]),
    );
    expect(HANH_DONG_NHAY_CAM).toEqual(expect.arrayContaining([...actions]));
    expect(LOAI_DOI_TUONG_NHAT_KY).toEqual(
      expect.arrayContaining([...targets]),
    );

    // Giá trị không chỉ có trong danh sách: MySQL thật nhận dòng nhật ký với từng cặp (hành động, đối tượng)
    const admin = await fx.admin();
    const pairs = [
      ['SuaGhiChuKham', 'ho_so_kham'],
      ['AnDanhGia', 'danh_gia_bac_si'],
    ] as const;
    for (const [action, target] of pairs) {
      await db.query(
        "INSERT INTO nhat_ky_hanh_dong (tai_khoan_id, hanh_dong, loai_doi_tuong, ma_doi_tuong, thoi_diem, ket_qua) VALUES (?, ?, ?, 1, ?, 'ThanhCong')",
        [admin.account.taiKhoanId, action, target, AT],
      );
    }
    const rows = (await db.query(
      'SELECT hanh_dong AS action, loai_doi_tuong AS target FROM nhat_ky_hanh_dong ORDER BY nhat_ky_hanh_dong_id',
    )) as { action: string; target: string }[];
    expect(rows).toEqual(pairs.map(([action, target]) => ({ action, target })));
  });
});
