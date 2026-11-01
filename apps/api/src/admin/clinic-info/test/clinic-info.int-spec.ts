import 'reflect-metadata';
import type { DataSource } from 'typeorm';
import {
  createTestDataSource,
  readTestDbSettings,
  resetTables,
} from '../../../database/testing/test-database.js';
import { BranchAccessPolicy } from '../../../rbac/branch-access.policy.js';
import type { AdminScope } from '../../../rbac/admin-scope.js';
import { ThongTinPhongKham } from '../../entities/thong-tin-phong-kham.entity.js';
import { ClinicInfoRepository } from '../clinic-info.repository.js';
import { ClinicInfoService } from '../clinic-info.service.js';

const system: AdminScope = { kind: 'ToanHeThong' };
const values = (suffix: string) => ({
  tenThuongHieu: `CLINIX ${suffix}`,
  diaChiTruSo: `Địa chỉ ${suffix}`,
  duongDayNong: '19001234',
  email: `${suffix.toLowerCase()}@example.com`,
});

describe('B4 ClinicInfo — MySQL thật', () => {
  let db: DataSource;
  let repository: ClinicInfoRepository;
  let service: ClinicInfoService;

  beforeAll(async () => {
    db = await createTestDataSource(readTestDbSettings());
    repository = new ClinicInfoRepository(db);
    service = new ClinicInfoService(repository, new BranchAccessPolicy());
  });
  beforeEach(async () => resetTables(db));
  afterAll(async () => db?.destroy());

  it('PK-01/02: lần PUT đầu upsert id=1, lần sau cập nhật cùng một row', async () => {
    await expect(service.get(system)).resolves.toEqual({
      tenThuongHieu: null,
      diaChiTruSo: null,
      duongDayNong: null,
      email: null,
    });

    await expect(service.update(system, values('Dau'))).resolves.toEqual(
      values('Dau'),
    );
    await expect(service.update(system, values('Sau'))).resolves.toEqual(
      values('Sau'),
    );
    expect(await db.getRepository(ThongTinPhongKham).count()).toBe(1);
    expect(
      await db.getRepository(ThongTinPhongKham).findOneByOrFail({ id: 1 }),
    ).toMatchObject(values('Sau'));
  });

  it('PK-09: PUT đồng thời giữ một singleton nhất quán', async () => {
    const inputs = Array.from({ length: 8 }, (_, index) =>
      values(`Race${index}`),
    );
    await Promise.all(inputs.map((input) => service.update(system, input)));

    expect(await db.getRepository(ThongTinPhongKham).count()).toBe(1);
    const final = await service.get(system);
    expect(inputs).toContainEqual(final);
  });
});
