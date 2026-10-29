import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import type { DataSource } from 'typeorm';
import { PasswordHasher } from '../../auth/password/password-hasher.service.js';
import { TaiKhoan } from '../../auth/entities/tai-khoan.entity.js';
import { ViNoiBo } from '../../auth/entities/vi-noi-bo.entity.js';
import { BacSi } from '../../admin/entities/bac-si.entity.js';
import { QuanTriVien } from '../../admin/entities/quan-tri-vien.entity.js';
import { ChiNhanh } from '../../admin/entities/chi-nhanh.entity.js';
import { ChiNhanhLichHoatDong } from '../../admin/entities/chi-nhanh-lich-hoat-dong.entity.js';
import { ChiNhanhDichVuKham } from '../../admin/entities/chi-nhanh-dich-vu-kham.entity.js';
import { ChuyenKhoa } from '../../admin/entities/chuyen-khoa.entity.js';
import { CauHinhHeThong } from '../../admin/entities/cau-hinh-he-thong.entity.js';
import { ThongTinPhongKham } from '../../admin/entities/thong-tin-phong-kham.entity.js';
import {
  createTestDataSource,
  readTestDbSettings,
  resetTables,
} from '../testing/test-database.js';
import { CATALOG_BRANCHES, CONFIG_DEMO } from './catalog-data.js';
import { DEV_ACCOUNTS } from './dev-account-data.js';
import type { SeedCommand, SeedConfig } from './seed-config.js';
import { runSeed } from './seed.service.js';
import { seedTransaction, seedLockName } from './seed-runner.js';
import { SeedRepository } from './seed.repository.js';
import { seedCli } from './seed-cli.js';

describe('C5 SD-01/02/04/06 — MySQL thật, transaction và named lock', () => {
  let db: DataSource;
  const settings = readTestDbSettings();
  const password = `${randomBytes(16).toString('hex')}1!`;
  const config = (command: SeedCommand): SeedConfig => ({
    command,
    database: settings,
    password,
    admin: {
      email: 'bootstrap@example.invalid',
      name: 'Quản trị mẫu',
      phone: '0900000000',
    },
  });
  beforeAll(async () => {
    db = await createTestDataSource(settings);
  });
  beforeEach(async () => {
    await resetTables(db);
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await db?.destroy();
  });

  it('SD-01/02 catalog hai lần: 8 chuyên khoa, 4 chi nhánh, 28 lịch, 12 cặp; ID giữ nguyên', async () => {
    expect((await runSeed(db, config('catalog'))).created).toBe(59);
    const branches = await db.getRepository(ChiNhanh).find();
    expect(await runSeed(db, config('catalog'))).toEqual({
      created: 0,
      skipped: 59,
    });
    expect(await db.getRepository(ChiNhanh).find()).toEqual(branches);
    expect(await db.getRepository(ChuyenKhoa).count()).toBe(8);
    expect(await db.getRepository(ChiNhanhLichHoatDong).count()).toBe(28);
    expect(await db.getRepository(ChiNhanhDichVuKham).count()).toBe(12);
    const closed = await db
      .getRepository(ChiNhanhLichHoatDong)
      .findBy({ thuTrongTuan: 7 });
    expect(closed).toHaveLength(4);
    expect(
      closed.every(
        (row) =>
          !row.hoatDong &&
          row.gioBatDauSang === null &&
          row.gioKetThucChieu === null,
      ),
    ).toBe(true);
  });
  it('SD-01 catalog đồng thời qua hai connection không nhân đôi branch thiếu UNIQUE', async () => {
    const results = await Promise.all([
      runSeed(db, config('catalog')),
      runSeed(db, config('catalog')),
    ]);
    expect(results.map((r) => r.created).sort((a, b) => a - b)).toEqual([
      0, 59,
    ]);
    expect(await db.getRepository(ChiNhanh).count()).toBe(4);
  });
  it('SD-02 branch trùng lookup thì rollback toàn command, không lấy dòng đầu', async () => {
    await db
      .getRepository(ChiNhanh)
      .save([{ ...CATALOG_BRANCHES[0]! }, { ...CATALOG_BRANCHES[0]! }]);
    await expect(runSeed(db, config('catalog'))).rejects.toThrow(
      'SEED_BRANCH_AMBIGUOUS',
    );
    expect(await db.getRepository(ChuyenKhoa).count()).toBe(0);
    expect(await db.getRepository(ChiNhanh).count()).toBe(2);
  });
  it('SD-01/02 không sửa branch có sẵn thiếu lịch hoặc dịch vụ', async () => {
    await runSeed(db, config('catalog'));
    const branch = (await db.getRepository(ChiNhanh).find())[0]!;
    await db
      .getRepository(ChiNhanhLichHoatDong)
      .delete({ chiNhanhId: branch.chiNhanhId, thuTrongTuan: 1 });
    await expect(runSeed(db, config('catalog'))).rejects.toThrow(
      'SEED_BRANCH_INCOMPLETE',
    );
    expect(await db.getRepository(ChiNhanhLichHoatDong).count()).toBe(27);
  });
  it('SD-01 giữ nguyên lịch và thông tin phòng khám đã chỉnh', async () => {
    await runSeed(db, config('catalog'));
    const branch = (await db.getRepository(ChiNhanh).find())[0]!;
    await db
      .getRepository(ChiNhanhLichHoatDong)
      .update(
        { chiNhanhId: branch.chiNhanhId, thuTrongTuan: 1 },
        { gioBatDauSang: '09:00:00' },
      );
    await db
      .getRepository(ThongTinPhongKham)
      .update(1, { tenThuongHieu: 'Tên đã chỉnh' });
    await runSeed(db, config('catalog'));
    expect(
      (
        await db
          .getRepository(ChiNhanhLichHoatDong)
          .findOneByOrFail({ chiNhanhId: branch.chiNhanhId, thuTrongTuan: 1 })
      ).gioBatDauSang,
    ).toBe('09:00:00');
    expect(
      (await db.getRepository(ThongTinPhongKham).findOneByOrFail({ id: 1 }))
        .tenThuongHieu,
    ).toBe('Tên đã chỉnh');
  });
  it('SD-06 config đủ 12 tham số; chạy lại giữ cấu hình đã thay', async () => {
    await runSeed(db, config('config-dev'));
    expect(
      await db.getRepository(CauHinhHeThong).findOneByOrFail({ id: 1 }),
    ).toEqual(CONFIG_DEMO);
    await db.getRepository(CauHinhHeThong).update(1, { checkInTruocPhut: 45 });
    expect(await runSeed(db, config('config-dev'))).toEqual({
      created: 0,
      skipped: 1,
    });
    expect(
      (await db.getRepository(CauHinhHeThong).findOneByOrFail({ id: 1 }))
        .checkInTruocPhut,
    ).toBe(45);
  });
  it('SD-04 first-admin active/verified, hash Argon2id thật; có Admin ngừng hoạt động vẫn từ chối', async () => {
    await runSeed(db, config('first-admin'));
    const account = await db
      .getRepository(TaiKhoan)
      .findOneByOrFail({ email: config('first-admin').admin!.email });
    expect(account).toMatchObject({
      trangThai: 'DangHoatDong',
      daXacMinhEmail: true,
      loaiTaiKhoan: 'QuanTriVien',
    });
    expect(
      await new PasswordHasher().verify(account.matKhauBam!, password),
    ).toBe(true);
    expect(
      await db
        .getRepository(QuanTriVien)
        .findOneByOrFail({ taiKhoanId: account.taiKhoanId }),
    ).toMatchObject({ phamViQuanTri: 'ToanHeThong', chiNhanhId: null });
    await db
      .getRepository(TaiKhoan)
      .update(account.taiKhoanId, { trangThai: 'NgungHoatDong' });
    await expect(runSeed(db, config('first-admin'))).rejects.toThrow(
      'SEED_ADMIN_EXISTS',
    );
    expect(await db.getRepository(TaiKhoan).count()).toBe(1);
  });
  it('SD-04 hai first-admin đồng thời chỉ một thành công', async () => {
    const other = config('first-admin');
    other.admin = { ...other.admin!, email: 'second@example.invalid' };
    const results = await Promise.allSettled([
      runSeed(db, config('first-admin')),
      runSeed(db, other),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await db.getRepository(QuanTriVien).count()).toBe(1);
    expect(await db.getRepository(TaiKhoan).count()).toBe(1);
  });
  it('SD-04 lỗi sau insert hồ sơ rollback cả account và nhả khóa', async () => {
    const hash = await new PasswordHasher().hash(password);
    await expect(
      seedTransaction(db, async (manager) => {
        await new SeedRepository(manager).createFirstAdmin(
          config('first-admin').admin!,
          hash,
        );
        throw new Error('simulated failure');
      }),
    ).rejects.toThrow('simulated failure');
    expect(await db.getRepository(TaiKhoan).count()).toBe(0);
    expect(await db.getRepository(QuanTriVien).count()).toBe(0);
    await expect(runSeed(db, config('first-admin'))).resolves.toMatchObject({
      created: 2,
    });
  });
  it('SD-02 dev accounts cần catalog; role profiles đúng, rerun giữ hash và ví', async () => {
    await expect(runSeed(db, config('dev-accounts'))).rejects.toThrow(
      'SEED_CATALOG_REQUIRED',
    );
    await runSeed(db, config('catalog'));
    await runSeed(db, config('dev-accounts'));
    const accounts = await db
      .getRepository(TaiKhoan)
      .find({ order: { email: 'ASC' } });
    expect(accounts).toHaveLength(5);
    const doctor = await db.getRepository(BacSi).findOneByOrFail({
      taiKhoanId: accounts.find((a) => a.loaiTaiKhoan === 'BacSi')!.taiKhoanId,
    });
    expect(
      await db.getRepository(ChiNhanhDichVuKham).existsBy({
        chiNhanhId: doctor.chiNhanhId,
        dichVuKhamId: doctor.dichVuKhamId,
      }),
    ).toBe(true);
    const wallet = (await db.getRepository(ViNoiBo).find())[0]!;
    expect(wallet.soDu).toBe('0.00');
    await db
      .getRepository(ViNoiBo)
      .update(wallet.viNoiBoId, { soDu: '100.00' });
    await runSeed(db, {
      ...config('dev-accounts'),
      password: `${randomBytes(16).toString('hex')}2!`,
    });
    expect(
      JSON.stringify(
        await db.getRepository(TaiKhoan).find({ order: { email: 'ASC' } }),
      ) === JSON.stringify(accounts),
    ).toBe(true);
    expect(
      (
        await db
          .getRepository(ViNoiBo)
          .findOneByOrFail({ viNoiBoId: wallet.viNoiBoId })
      ).soDu,
    ).toBe('100.00');
  });
  it('SD-02 role/email conflict sau khi tạo các account trước đó rollback cả command', async () => {
    await runSeed(db, config('catalog'));
    const hash = await new PasswordHasher().hash(password);
    await db.getRepository(TaiKhoan).save({
      email: DEV_ACCOUNTS[2].email,
      hoTen: 'Tài khoản mẫu',
      soDienThoai: '0900000099',
      matKhauBam: hash,
      trangThai: 'DangHoatDong',
      daXacMinhEmail: true,
      loaiTaiKhoan: 'BenhNhan',
    });
    await expect(runSeed(db, config('dev-accounts'))).rejects.toThrow(
      'SEED_ACCOUNT_CONFLICT',
    );
    expect(await db.getRepository(TaiKhoan).count()).toBe(1);
    expect(await db.getRepository(QuanTriVien).count()).toBe(0);
  });
  it('SD-04 first-admin không chiếm email đã có vai trò khác', async () => {
    const hash = await new PasswordHasher().hash(password);
    await db.getRepository(TaiKhoan).save({
      email: config('first-admin').admin!.email,
      hoTen: 'Tài khoản mẫu',
      soDienThoai: '0900000099',
      matKhauBam: hash,
      trangThai: 'DangHoatDong',
      daXacMinhEmail: true,
      loaiTaiKhoan: 'BenhNhan',
    });
    await expect(runSeed(db, config('first-admin'))).rejects.toThrow(
      'SEED_EMAIL_CONFLICT',
    );
    expect(await db.getRepository(TaiKhoan).count()).toBe(1);
    expect(await db.getRepository(QuanTriVien).count()).toBe(0);
  });
  it('SD-02 không tự sửa hồ sơ thiếu hoặc dịch vụ bị gỡ', async () => {
    await runSeed(db, config('catalog'));
    await runSeed(db, config('dev-accounts'));
    const account = await db
      .getRepository(TaiKhoan)
      .findOneByOrFail({ email: DEV_ACCOUNTS[1].email });
    await db
      .getRepository(QuanTriVien)
      .delete({ taiKhoanId: account.taiKhoanId });
    await expect(runSeed(db, config('dev-accounts'))).rejects.toThrow(
      'SEED_PROFILE_CONFLICT',
    );
    expect(
      await db
        .getRepository(QuanTriVien)
        .existsBy({ taiKhoanId: account.taiKhoanId }),
    ).toBe(false);
    const branch = (await db.getRepository(ChiNhanh).find())[0]!;
    await db
      .getRepository(ChiNhanhDichVuKham)
      .delete({ chiNhanhId: branch.chiNhanhId });
    await expect(runSeed(db, config('catalog'))).rejects.toThrow(
      'SEED_BRANCH_SERVICE_MISSING',
    );
    expect(await db.getRepository(ChiNhanhDichVuKham).count()).toBe(9);
  });
  it('SD-01 lock timeout không chạy callback; holder commit/rollback đều trả khóa đúng connection', async () => {
    const runner = db.createQueryRunner();
    await runner.connect();
    const lock = seedLockName(settings.database);
    await runner.query('SELECT GET_LOCK(?, 1)', [lock]);
    const callback = vi.fn();
    try {
      await expect(seedTransaction(db, callback, 0)).rejects.toThrow(
        'SEED_LOCK_UNAVAILABLE',
      );
    } finally {
      await runner.query('SELECT RELEASE_LOCK(?)', [lock]);
      await runner.release();
    }
    expect(callback).not.toHaveBeenCalled();
    await seedTransaction(db, async () => undefined);
    const rows: { free: number }[] = await db.query(
      'SELECT IS_FREE_LOCK(?) AS free',
      [lock],
    );
    expect(Number(rows[0]!.free)).toBe(1);
  });
  it('SD-04 lỗi SQL có dữ liệu nhạy cảm chỉ ra mã cố định tại biên CLI', async () => {
    const marker = randomBytes(16).toString('hex');
    // Spy initialize để kiểm biên lỗi mà không kết nối DB khác hoặc in raw exception.
    const { DataSource: Source } = await import('typeorm');
    vi.spyOn(Source.prototype, 'initialize').mockRejectedValueOnce(
      new Error(marker),
    );
    const output = { log: vi.fn(), error: vi.fn() };
    expect(
      await seedCli(
        ['catalog'],
        {
          MYSQL_DATABASE: settings.database,
          MYSQL_USER: 'sample',
          MYSQL_PASSWORD: marker,
        },
        output,
      ),
    ).toBe(1);
    expect(output.error.mock.calls).toEqual([['SEED_FAILED']]);
    expect(output.log).not.toHaveBeenCalled();
  });
  it('SD-01/03/06 CLI thật chạy được và entrypoint build có exit code đúng', async () => {
    const env = {
      NODE_ENV: 'test',
      MYSQL_DATABASE: settings.database,
      MYSQL_USER: settings.username,
      MYSQL_PASSWORD: settings.password,
      DB_HOST: settings.host,
      DB_PORT: String(settings.port),
      DB_TIMEZONE: '+07:00',
      TZ: 'Asia/Ho_Chi_Minh',
    };
    const output = { log: vi.fn(), error: vi.fn() };
    expect(await seedCli(['catalog'], env, output)).toBe(0);
    expect(output.error).not.toHaveBeenCalled();
    expect(output.log.mock.calls[0]).toEqual([
      'Seed catalog: created=59, skipped=0.',
    ]);
    const adminEnv = {
      ...env,
      NODE_ENV: 'production',
      SEED_ADMIN_EMAIL: config('first-admin').admin!.email,
      SEED_ADMIN_PASSWORD: password,
      SEED_ADMIN_FULL_NAME: config('first-admin').admin!.name,
      SEED_ADMIN_PHONE: config('first-admin').admin!.phone,
    };
    expect(await seedCli(['first-admin'], adminEnv, output)).toBe(0);
    expect(await seedCli(['first-admin'], adminEnv, output)).toBe(1);
    expect(output.error).toHaveBeenLastCalledWith('SEED_ADMIN_EXISTS');
    output.error.mockClear();
    expect(
      await seedCli(
        ['dev-accounts'],
        { ...env, SEED_DEV_PASSWORD: password },
        output,
      ),
    ).toBe(0);
    expect(output.error).not.toHaveBeenCalled();
    const processResult = spawnSync(
      process.execPath,
      ['dist/database/seeds/seed.js', 'config-dev'],
      {
        env: { ...process.env, ...env },
        encoding: 'utf8',
        timeout: 15000,
      },
    );
    expect(processResult.status).toBe(0);
    expect(
      processResult.stdout.includes('Seed config-dev: created=1, skipped=0.'),
    ).toBe(true);
    expect(processResult.stderr.length).toBe(0);
    const refused = spawnSync(
      process.execPath,
      ['dist/database/seeds/seed.js', 'catalog'],
      {
        env: { ...process.env, ...env, NODE_ENV: 'production' },
        encoding: 'utf8',
        timeout: 15000,
      },
    );
    expect(refused.status).toBe(1);
    expect(refused.stderr.trim()).toBe('SEED_PRODUCTION_FORBIDDEN');
  });
});
