import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import {
  createTestDataSource,
  readTestDbSettings,
} from '../../../database/testing/test-database.js';
import { insertTaiKhoan } from '../../../auth/entities/testing/auth-fixtures.js';
import { AdminFixtures } from '../../../admin/testing/admin-fixtures.js';
import { UploadRepository } from '../upload.repository.js';
import { SPECIALTY_IMAGE_POLICY as P } from '../upload-policy.js';
import {
  officialStatementsFor,
  referencedTables,
} from '../../../database/testing/official-schema.js';
import mysql from 'mysql2/promise';

let db: DataSource;
let images: UploadRepository;
const now = new Date('2026-10-28T05:00:00Z');
beforeAll(async () => {
  db = await createTestDataSource(readTestDbSettings());
  images = new UploadRepository(db);
});
afterAll(async () => {
  await db?.destroy();
});

async function fixture(confirmed = true, expired = false) {
  const account = await insertTaiKhoan(db, { loaiTaiKhoan: 'QuanTriVien' });
  const id = randomUUID();
  await images.createPending(
    id,
    `clinix/test/specialties/${id}`,
    account.taiKhoanId,
    now,
    new Date(now.getTime() + (expired ? -1000 : P.pendingMs)),
  );
  if (confirmed) await images.confirm(id, `https://example.test/${id}`, now);
  const result: { insertId: number } = await db.query(
    'INSERT INTO chuyen_khoa (ten,anh_dai_dien) VALUES (?,?)',
    [`P7 ${id}`, 'legacy.png'],
  );
  return {
    id,
    accountId: account.taiKhoanId,
    specialtyId: String(result.insertId),
  };
}

describe('CK-11/SE-A7 — MySQL thật, DB mới không reset DB cũ', () => {
  it('mốc gỡ ảnh có mili giây không được làm cleanup bỏ qua ảnh vừa gỡ', async () => {
    const f = await fixture();
    const fractionalNow = new Date(now.getTime() + 900);
    await db.transaction((tx) =>
      images.assignSpecialty(tx, f.specialtyId, f.accountId, f.id, now),
    );
    await db.transaction((tx) =>
      images.assignSpecialty(
        tx,
        f.specialtyId,
        f.accountId,
        null,
        fractionalNow,
      ),
    );
    const rows: { thu_xoa_lai_luc: Date }[] = await db.query(
      'SELECT thu_xoa_lai_luc FROM anh_tai_len WHERE anh_tai_len_id=?',
      [f.id],
    );
    expect(rows[0]!.thu_xoa_lai_luc.getTime()).toBe(now.getTime());
    const claimed = await images.claimCleanup(fractionalNow);
    expect(claimed.some((item) => item.id === f.id)).toBe(true);
  });
  it('scope kiểm tài khoản/role/phạm vi thật, không chỉ JWT role', async () => {
    const fixtures = new AdminFixtures(db);
    const system = await fixtures.admin();
    const branch = await fixtures.branch();
    const local = await fixtures.admin(branch);
    const patient = await insertTaiKhoan(db);
    expect(await images.isSystemAdmin(system.account.taiKhoanId)).toBe(true);
    expect(await images.isSystemAdmin(local.account.taiKhoanId)).toBe(false);
    expect(await images.isSystemAdmin(patient.taiKhoanId)).toBe(false);
    await db.query(
      "UPDATE tai_khoan SET trang_thai='NgungHoatDong' WHERE tai_khoan_id=?",
      [system.account.taiKhoanId],
    );
    expect(await images.isSystemAdmin(system.account.taiKhoanId)).toBe(false);
  });

  it('gắn/thay/gỡ ảnh cùng transaction; rollback giữ ảnh cũ', async () => {
    const f = await fixture();
    await db.transaction((tx) =>
      images.assignSpecialty(tx, f.specialtyId, f.accountId, f.id, now),
    );
    const rows = await db.query(
      'SELECT anh_tai_len_id,anh_dai_dien FROM chuyen_khoa WHERE chuyen_khoa_id=?',
      [f.specialtyId],
    );
    expect(rows[0]).toMatchObject({ anh_tai_len_id: f.id, anh_dai_dien: null });
    await expect(
      db.transaction(async (tx) => {
        await images.assignSpecialty(tx, f.specialtyId, f.accountId, null, now);
        throw new Error('rollback P7');
      }),
    ).rejects.toThrow('rollback P7');
    expect(
      (
        await db.query(
          'SELECT trang_thai FROM anh_tai_len WHERE anh_tai_len_id=?',
          [f.id],
        )
      )[0].trang_thai,
    ).toBe('DaGan');
    await db.transaction((tx) =>
      images.assignSpecialty(tx, f.specialtyId, f.accountId, null, now),
    );
    expect(
      (
        await db.query(
          'SELECT trang_thai FROM anh_tai_len WHERE anh_tai_len_id=?',
          [f.id],
        )
      )[0].trang_thai,
    ).toBe('ChoXoa');
  });

  it('chưa xác nhận, sai chủ, hết hạn không được gắn', async () => {
    const pending = await fixture(false);
    const expired = await fixture(true, true);
    const owned = await fixture();
    for (const [f, owner] of [
      [pending, pending.accountId],
      [expired, expired.accountId],
      [owned, pending.accountId],
    ] as const) {
      await expect(
        db.transaction((tx) =>
          images.assignSpecialty(tx, f.specialtyId, owner, f.id, now),
        ),
      ).rejects.toMatchObject({ maLoi: 'ANH_TAI_LEN_KHONG_HOP_LE' });
    }
  });

  it('hai chuyên khoa gắn cùng ảnh: chỉ một transaction thành công', async () => {
    const first = await fixture();
    const second = await fixture();
    const results = await Promise.allSettled([
      db.transaction((tx) =>
        images.assignSpecialty(
          tx,
          first.specialtyId,
          first.accountId,
          first.id,
          now,
        ),
      ),
      db.transaction((tx) =>
        images.assignSpecialty(
          tx,
          second.specialtyId,
          first.accountId,
          first.id,
          now,
        ),
      ),
    ]);
    expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(
      1,
    );
    expect(
      await db.query(
        'SELECT chuyen_khoa_id FROM chuyen_khoa WHERE anh_tai_len_id=?',
        [first.id],
      ),
    ).toHaveLength(1);
  });

  it('hai worker nhận việc không trùng, chưa xác nhận không dọn, 5 lỗi thì dừng', async () => {
    const ready = await fixture(true, true);
    const unknown = await fixture(false, true);
    const [a, b] = await Promise.all([
      images.claimCleanup(now),
      images.claimCleanup(now),
    ]);
    const all = [...a, ...b];
    expect(new Set(all.map((item) => item.id)).size).toBe(all.length);
    expect(all.some((item) => item.id === unknown.id)).toBe(false);
    const item = all.find((entry) => entry.id === ready.id)!;
    expect(item).toBeDefined();
    expect(await images.cleanupOwned(item, now)).toBe(true);
    expect(
      await images.cleanupOwned({ ...item, token: randomUUID() }, now),
    ).toBe(false);
    for (let i = 0; i < 5; i++) {
      const tick = new Date(now.getTime() + i * 3_600_000);
      const next =
        i === 0
          ? item
          : (await images.claimCleanup(tick)).find(
              (entry) => entry.id === item.id,
            )!;
      expect(next).toBeDefined();
      await images.cleanupFailed(next, tick);
    }
    const retry = await images.claimCleanup(
      new Date(now.getTime() + 6 * 3_600_000),
    );
    expect(retry.some((entry) => entry.id === item.id)).toBe(false);
    const rows = await db.query(
      'SELECT so_lan_thu_xoa,ma_loi_cuoi FROM anh_tai_len WHERE anh_tai_len_id=?',
      [item.id],
    );
    expect(rows[0]).toMatchObject({
      so_lan_thu_xoa: 5,
      ma_loi_cuoi: 'XOA_ANH_THAT_BAI',
    });
  });

  it('FK RESTRICT và CHECK chặn mất dấu/DaGan khi chưa upload, giữ URL cũ', async () => {
    const f = await fixture();
    await db.transaction((tx) =>
      images.assignSpecialty(tx, f.specialtyId, f.accountId, f.id, now),
    );
    await expect(
      db.query('DELETE FROM anh_tai_len WHERE anh_tai_len_id=?', [f.id]),
    ).rejects.toThrow();
    const pending = await fixture(false);
    await expect(
      db.query(
        "UPDATE anh_tai_len SET trang_thai='DaGan' WHERE anh_tai_len_id=?",
        [pending.id],
      ),
    ).rejects.toThrow();
    expect(
      (
        await db.query(
          'SELECT anh_dai_dien FROM chuyen_khoa WHERE chuyen_khoa_id=?',
          [pending.specialtyId],
        )
      )[0].anh_dai_dien,
    ).toBe('legacy.png');
    // Bỏ trường giữ ảnh cũ; null phải gỡ được cả URL legacy dù FK vốn NULL.
    await db.transaction((tx) =>
      images.assignSpecialty(
        tx,
        pending.specialtyId,
        pending.accountId,
        undefined,
        now,
      ),
    );
    expect(
      (
        await db.query(
          'SELECT anh_dai_dien FROM chuyen_khoa WHERE chuyen_khoa_id=?',
          [pending.specialtyId],
        )
      )[0].anh_dai_dien,
    ).toBe('legacy.png');
    await db.transaction((tx) =>
      images.assignSpecialty(
        tx,
        pending.specialtyId,
        pending.accountId,
        null,
        now,
      ),
    );
    expect(
      (
        await db.query(
          'SELECT anh_dai_dien FROM chuyen_khoa WHERE chuyen_khoa_id=?',
          [pending.specialtyId],
        )
      )[0].anh_dai_dien,
    ).toBeNull();
  });

  it('SHOW CREATE TABLE migration khớp canonical SQL trên DB tham chiếu MỚI', async () => {
    const settings = readTestDbSettings();
    const referenceName = `clinix_p7_${Date.now()}_ref_test`;
    if (!/^clinix_p7_\d+_ref_test$/.test(referenceName))
      throw new Error('P7 reference cần tên riêng');
    const server = await mysql.createConnection({
      host: settings.host,
      port: settings.port,
      user: settings.username,
      password: settings.password,
    });
    try {
      await server.query(
        `CREATE DATABASE \`${referenceName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      );
    } finally {
      await server.end();
    }
    const reference = await createTestDataSource({
      ...settings,
      database: referenceName,
    });
    try {
      const tables: { name: string }[] = await db.query(
        "SELECT table_name AS name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name NOT IN ('migrations','typeorm_metadata')",
      );
      const names = tables.map((row) => row.name);
      for (const sql of officialStatementsFor(names).filter((sql) =>
        referencedTables(sql).every((table) => names.includes(table)),
      ))
        await reference.query(sql);
      for (const name of ['anh_tai_len', 'chuyen_khoa']) {
        const actual = (await db.query(`SHOW CREATE TABLE \`${name}\``))[0][
          'Create Table'
        ].replace(/ AUTO_INCREMENT=\d+/, '');
        const expected = (
          await reference.query(`SHOW CREATE TABLE \`${name}\``)
        )[0]['Create Table'].replace(/ AUTO_INCREMENT=\d+/, '');
        expect(actual).toBe(expected);
      }
    } finally {
      await reference.destroy();
    }
  });
});
