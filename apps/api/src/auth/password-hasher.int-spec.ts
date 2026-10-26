import type { DataSource } from 'typeorm';
import {
  createTestDataSource,
  readTestDbSettings,
  resetTables,
} from '../database/testing/test-database.js';
import {
  dbErrorCode,
  insertTaiKhoan,
} from './entities/testing/auth-fixtures.js';
import { TaiKhoan } from './entities/tai-khoan.entity.js';
import { normalizeEmail } from './email-policy.js';
import { PasswordHasher } from './password-hasher.service.js';

// Task A1. Test case: SE-01 (`mat_khau_bam` trong DB), DK-17 (email chuẩn hoá không lọt UNIQUE; phần trước @ giữ nguyên).
const PASSWORD = 'Mat-khau-thu-1!';
const hasher = new PasswordHasher();
let db: DataSource;

beforeAll(async () => {
  db = await createTestDataSource(readTestDbSettings());
});

beforeEach(async () => {
  await resetTables(db);
});

afterAll(async () => {
  await db?.destroy();
});

describe('mat_khau_bam trong DB (SE-01)', () => {
  it('lưu chuỗi Argon2id với tham số m=19456, t=2, p=1; vừa cột varchar(255), qua CHECK, đọc ra vẫn so khớp', async () => {
    const hash = await hasher.hash(PASSWORD);
    const saved = await insertTaiKhoan(db, { matKhauBam: hash }); // DangHoatDong: CHECK bắt buộc có mật khẩu băm

    const [row] = await db.query(
      'SELECT mat_khau_bam AS bam, CHAR_LENGTH(mat_khau_bam) AS dai FROM tai_khoan WHERE tai_khoan_id = ?',
      [saved.taiKhoanId],
    );
    expect(row.bam).toBe(hash);
    expect(Number(row.dai)).toBeLessThanOrEqual(255);
    const [, algo, version, params] = (row.bam as string).split('$');
    expect(algo).toBe('argon2id');
    expect(version).toBe('v=19');
    expect((params ?? '').split(',').sort()).toEqual(['m=19456', 'p=1', 't=2']);

    expect(await hasher.verify(row.bam as string, PASSWORD)).toBe(true);
    expect(await hasher.verify(row.bam as string, 'Mat-khau-thu-2!')).toBe(
      false,
    );
  }, 20000);

  it('không có bản rõ của mật khẩu ở bất kỳ cột nào của dòng tài khoản', async () => {
    const saved = await insertTaiKhoan(db, {
      matKhauBam: await hasher.hash(PASSWORD),
    });
    const stored = await db
      .getRepository(TaiKhoan)
      .findOneByOrFail({ taiKhoanId: saved.taiKhoanId });
    expect(JSON.stringify(stored)).not.toContain(PASSWORD);
  }, 20000);
});

describe('email đã chuẩn hoá và UNIQUE (DK-17)', () => {
  it('lưu giữ nguyên hoa/thường phần trước @, tên miền viết thường; email khác hoa/thường hoặc khoảng trắng không lọt UNIQUE', async () => {
    const email = normalizeEmail('  Nguyen.Van@EXAMPLE.com ');
    expect(email).toBe('Nguyen.Van@example.com');
    const saved = await insertTaiKhoan(db, { email });

    const stored = await db
      .getRepository(TaiKhoan)
      .findOneByOrFail({ taiKhoanId: saved.taiKhoanId });
    expect(stored.email).toBe('Nguyen.Van@example.com');

    for (const variant of [
      'nguyen.van@example.com',
      ' NGUYEN.VAN@Example.COM ',
      'Nguyen.Van@EXAMPLE.COM',
    ]) {
      expect(
        await dbErrorCode(
          insertTaiKhoan(db, { email: normalizeEmail(variant) }),
        ),
        variant,
      ).toBe('ER_DUP_ENTRY');
    }
  });
});
