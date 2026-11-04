import { randomBytes } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { BacSi } from '../../admin/entities/bac-si.entity.js';
import { ChiNhanh } from '../../admin/entities/chi-nhanh.entity.js';
import { ChiNhanhLichHoatDong } from '../../admin/entities/chi-nhanh-lich-hoat-dong.entity.js';
import { ChuyenKhoa } from '../../admin/entities/chuyen-khoa.entity.js';
import { TaiKhoan } from '../../auth/entities/tai-khoan.entity.js';
import {
  createTestDataSource,
  readTestDbSettings,
  resetTables,
} from '../testing/test-database.js';
import { CATALOG_BRANCHES } from './catalog-data.js';
import type { SeedCommand, SeedConfig } from './seed-config.js';
import { runSeed } from './seed.service.js';

// P2 (search): seed demo idempotent, không ghi đè dữ liệu đã chỉnh, thiếu catalog thì từ chối.
describe('search P2 — seed demo cho tra cứu (MySQL thật)', () => {
  let db: DataSource;
  const settings = readTestDbSettings();
  const password = `${randomBytes(16).toString('hex')}1!`;
  const config = (command: SeedCommand): SeedConfig => ({
    command,
    database: settings,
    password,
  });
  beforeAll(async () => {
    db = await createTestDataSource(settings);
  });
  beforeEach(async () => {
    await resetTables(db);
  });
  afterAll(async () => {
    await db?.destroy();
  });

  const seedAll = async () => {
    await runSeed(db, config('catalog'));
    return runSeed(db, config('search-demo'));
  };

  it('P2-01 tạo đủ dữ liệu: toạ độ 4 chi nhánh, mô tả 8 chuyên khoa, 1 chuyên khoa ngừng, 8 bác sĩ hoạt động + 1 chờ kích hoạt', async () => {
    await seedAll();
    const branches = await db.getRepository(ChiNhanh).find();
    expect(branches).toHaveLength(4);
    expect(
      branches.every((b) => b.toaDoLat !== null && b.toaDoLng !== null),
    ).toBe(true);
    const specialties = await db.getRepository(ChuyenKhoa).find();
    expect(specialties).toHaveLength(9);
    expect(
      specialties.filter((s) => s.trangThaiHoatDong === 'NgungHoatDong'),
    ).toHaveLength(1);
    expect(specialties.every((s) => s.moTa !== null)).toBe(true);
    const doctors = await db.getRepository(TaiKhoan).findBy({
      loaiTaiKhoan: 'BacSi',
    });
    expect(doctors.filter((d) => d.trangThai === 'DangHoatDong')).toHaveLength(
      8,
    );
    const pending = doctors.filter((d) => d.trangThai === 'ChoKichHoat');
    expect(pending).toHaveLength(1);
    expect(pending[0]!.matKhauBam).toBeNull();
    expect(await db.getRepository(BacSi).count()).toBe(9);
  });

  it('P2-02 lịch các chi nhánh khác nhau: Mẫu 2 nghỉ chiều T7, Mẫu 3 mở sáng CN, Mẫu 4 nghỉ T7, Mẫu 1 giữ nguyên', async () => {
    await seedAll();
    const day = async (index: number, weekday: number) => {
      const branch = await db
        .getRepository(ChiNhanh)
        .findOneByOrFail({ ten: CATALOG_BRANCHES[index]!.ten });
      return db.getRepository(ChiNhanhLichHoatDong).findOneByOrFail({
        chiNhanhId: branch.chiNhanhId,
        thuTrongTuan: weekday,
      });
    };
    const m2 = await day(1, 6);
    expect(m2.hoatDong).toBe(true);
    expect(m2.gioKetThucSang).toBe('12:00:00');
    expect(m2.gioBatDauChieu).toBeNull();
    const m3 = await day(2, 7);
    expect(m3.hoatDong).toBe(true);
    expect(m3.gioBatDauSang).toBe('08:00:00');
    expect(m3.gioBatDauChieu).toBeNull();
    const m4 = await day(3, 6);
    expect(m4.hoatDong).toBe(false);
    expect(m4.gioBatDauSang).toBeNull();
    const m1 = await day(0, 6);
    expect(m1.gioKetThucChieu).toBe('17:00:00');
  });

  it('P2-03 chạy hai lần: lần hai không tạo thêm, ID và hash giữ nguyên', async () => {
    const first = await seedAll();
    expect(first.created).toBeGreaterThan(0);
    const accounts = await db.getRepository(TaiKhoan).find();
    const second = await runSeed(db, config('search-demo'));
    expect(second.created).toBe(0);
    expect(second.skipped).toBe(first.created + first.skipped);
    expect(await db.getRepository(TaiKhoan).find()).toEqual(accounts);
    expect(await db.getRepository(ChuyenKhoa).count()).toBe(9);
  });

  it('P2-04 không ghi đè toạ độ, mô tả và lịch đã chỉnh tay', async () => {
    await runSeed(db, config('catalog'));
    const branch = await db
      .getRepository(ChiNhanh)
      .findOneByOrFail({ ten: CATALOG_BRANCHES[1]!.ten });
    await db
      .getRepository(ChiNhanh)
      .update(branch.chiNhanhId, {
        toaDoLat: '1.0000000',
        toaDoLng: '2.0000000',
      });
    await db
      .getRepository(ChuyenKhoa)
      .update({ ten: 'Tim mạch' }, { moTa: 'Mô tả đã chỉnh' });
    // Chỉnh T7 của Mẫu 2 khác giá trị gốc (sáng 07:00–11:00, bỏ chiều) rồi chạy seed demo.
    await db.getRepository(ChiNhanhLichHoatDong).update(
      { chiNhanhId: branch.chiNhanhId, thuTrongTuan: 6 },
      {
        gioBatDauSang: '07:00:00',
        gioKetThucSang: '11:00:00',
        gioBatDauChieu: null,
        gioKetThucChieu: null,
      },
    );
    await runSeed(db, config('search-demo'));
    const after = await db
      .getRepository(ChiNhanh)
      .findOneByOrFail({ chiNhanhId: branch.chiNhanhId });
    expect(after.toaDoLat).toBe('1.0000000');
    expect(
      (await db.getRepository(ChuyenKhoa).findOneByOrFail({ ten: 'Tim mạch' }))
        .moTa,
    ).toBe('Mô tả đã chỉnh');
    const saturday = await db
      .getRepository(ChiNhanhLichHoatDong)
      .findOneByOrFail({ chiNhanhId: branch.chiNhanhId, thuTrongTuan: 6 });
    expect(saturday.gioBatDauSang).toBe('07:00:00');
  });

  it('P2-05 thiếu catalog thì từ chối và không ghi gì', async () => {
    await expect(runSeed(db, config('search-demo'))).rejects.toMatchObject({
      code: 'SEED_CATALOG_REQUIRED',
    });
    expect(await db.getRepository(TaiKhoan).count()).toBe(0);
    expect(await db.getRepository(ChuyenKhoa).count()).toBe(0);
  });

  it('P2-06 email bác sĩ trùng tài khoản khác vai trò thì rollback toàn lệnh', async () => {
    await runSeed(db, config('catalog'));
    await db.getRepository(TaiKhoan).insert({
      email: 'bacsi05@example.com',
      hoTen: 'Bệnh nhân trùng email',
      soDienThoai: '0911111111',
      loaiTaiKhoan: 'BenhNhan',
      matKhauBam: 'hash-gia',
      trangThai: 'DangHoatDong',
      daXacMinhEmail: true,
    });
    await expect(runSeed(db, config('search-demo'))).rejects.toMatchObject({
      code: 'SEED_ACCOUNT_CONFLICT',
    });
    // Bác sĩ 01–04 đã tạo trước khi gặp xung đột phải bị hoàn tác.
    expect(await db.getRepository(BacSi).count()).toBe(0);
    expect(
      (await db.getRepository(ChiNhanh).find()).some(
        (b) => b.toaDoLat !== null,
      ),
    ).toBe(false);
  });
});
