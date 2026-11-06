import type { DataSource } from 'typeorm';
import {
  createTestDataSource,
  readTestDbSettings,
  resetTables,
} from '../../database/testing/test-database.js';
import { PublicSpecialtyRepository } from '../specialties/public-specialty.repository.js';
import { PublicServiceRepository } from '../services/public-service.repository.js';
import { SearchFixtures } from '../testing/search-fixtures.js';
import { PublicOverviewRepository } from './public-overview.repository.js';

// B9 — TCH-01: ba con số khớp đúng các danh sách công khai (cùng điều kiện, H5), trên MySQL thật.
let db: DataSource;
let fixtures: SearchFixtures;
let repository: PublicOverviewRepository;
beforeAll(async () => {
  db = await createTestDataSource(readTestDbSettings());
  fixtures = new SearchFixtures(db);
  repository = new PublicOverviewRepository(db);
});
beforeEach(async () => {
  await resetTables(db);
});
afterAll(async () => {
  await db?.destroy();
});

describe('B9 — PublicOverviewRepository.count', () => {
  it('AN-04: DB trống ⇒ ba số 0', async () => {
    await expect(repository.count()).resolves.toEqual({
      soChuyenKhoa: 0,
      soBacSi: 0,
      soDichVu: 0,
    });
  });

  it('TCH-01: phần tử ngừng/ẩn không được đếm; chuyên khoa và dịch vụ khớp danh sách công khai', async () => {
    const branch = await fixtures.branchWithCoordinates();
    await fixtures.publicDoctor(branch);
    await fixtures.publicDoctor(branch);
    await fixtures.pendingDoctor(branch);
    await fixtures.suspendedDoctor(branch);
    await fixtures.doctorOfInactiveSpecialty(branch);
    await fixtures.doctorWithRemovedService(branch);
    // Chuyên khoa ngừng, không có bác sĩ.
    await db.query(
      `INSERT INTO chuyen_khoa (ten, trang_thai_hoat_dong) VALUES ('Ngừng riêng', 'NgungHoatDong')`,
    );

    const counted = await repository.count();
    const specialties = await new PublicSpecialtyRepository(db).findPage(
      null,
      null,
      100,
      0,
    );
    const services = await new PublicServiceRepository(db).findServices(
      null,
      null,
    );
    expect(counted.soChuyenKhoa).toBe(specialties.total);
    expect(counted.soDichVu).toBe(services.length);
    // 2 bác sĩ công khai; 4 bác sĩ còn lại đều bị ẩn vì một lý do khác nhau (Q13).
    expect(counted.soBacSi).toBe(2);
  });
});
