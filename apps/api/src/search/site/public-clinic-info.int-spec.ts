import type { DataSource } from 'typeorm';
import { ThongTinPhongKham } from '../../admin/entities/thong-tin-phong-kham.entity.js';
import {
  createTestDataSource,
  readTestDbSettings,
  resetTables,
} from '../../database/testing/test-database.js';
import { PublicClinicInfoRepository } from './public-clinic-info.repository.js';

let db: DataSource;
let repository: PublicClinicInfoRepository;
beforeAll(async () => {
  db = await createTestDataSource(readTestDbSettings());
  repository = new PublicClinicInfoRepository(db);
});
beforeEach(async () => {
  await resetTables(db);
});
afterAll(async () => {
  await db?.destroy();
});

describe('B7 — PublicClinicInfoRepository trên MySQL thật', () => {
  it('AN-04: bảng chưa có dòng ⇒ null', async () => {
    await expect(repository.find()).resolves.toBeNull();
  });

  it('KC-05: có dòng ⇒ đúng bốn trường, NULL giữ NULL', async () => {
    await db.getRepository(ThongTinPhongKham).save({
      id: 1,
      tenThuongHieu: 'CLINIX',
      diaChiTruSo: null,
      duongDayNong: '1900 1234',
      email: null,
    });
    await expect(repository.find()).resolves.toEqual({
      tenThuongHieu: 'CLINIX',
      diaChiTruSo: null,
      duongDayNong: '1900 1234',
      email: null,
    });
  });

  it('CC-07: gọi không làm đổi dữ liệu', async () => {
    await db.getRepository(ThongTinPhongKham).save({
      id: 1,
      tenThuongHieu: 'CLINIX',
      diaChiTruSo: null,
      duongDayNong: null,
      email: null,
    });
    const checksum = () =>
      db.query<unknown[]>('CHECKSUM TABLE thong_tin_phong_kham');
    const before = await checksum();
    await repository.find();
    await repository.find();
    expect(await checksum()).toEqual(before);
  });
});
