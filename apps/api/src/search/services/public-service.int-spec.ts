import type { DataSource } from 'typeorm';
import { ChiNhanhDichVuKham } from '../../admin/entities/chi-nhanh-dich-vu-kham.entity.js';
import { DichVuKham } from '../../admin/entities/dich-vu-kham.entity.js';
import { NhomDichVu } from '../../admin/entities/nhom-dich-vu.entity.js';
import {
  createTestDataSource,
  readTestDbSettings,
  resetTables,
} from '../../database/testing/test-database.js';
import { SearchFixtures } from '../testing/search-fixtures.js';
import { PublicServiceRepository } from './public-service.repository.js';

// B3 — truy vấn nhóm dịch vụ / dịch vụ công khai trên MySQL thật. Mã ca theo PLAN search mục 7.4, 7.5.
let db: DataSource;
let fixtures: SearchFixtures;
let repository: PublicServiceRepository;
beforeAll(async () => {
  db = await createTestDataSource(readTestDbSettings());
  fixtures = new SearchFixtures(db);
  repository = new PublicServiceRepository(db);
});
beforeEach(async () => {
  await resetTables(db);
});
afterAll(async () => {
  await db?.destroy();
});

async function group(ten: string, thuTuHienThi = 0): Promise<NhomDichVu> {
  const repo = db.getRepository(NhomDichVu);
  return repo.save(repo.create({ ten, thuTuHienThi }));
}

async function service(
  nhom: NhomDichVu,
  ten: string,
  giaMacDinh: string,
  mucDatCoc = '0.00',
): Promise<DichVuKham> {
  const repo = db.getRepository(DichVuKham);
  return repo.save(
    repo.create({
      nhomDichVuId: nhom.nhomDichVuId,
      ten,
      thoiLuong: 30,
      giaMacDinh,
      mucDatCoc,
    }),
  );
}

// Chi nhánh bắt đầu cung cấp dịch vụ (dòng trong chi_nhanh_dich_vu_kham).
async function offer(branchId: string, ...services: DichVuKham[]) {
  const repo = db.getRepository(ChiNhanhDichVuKham);
  for (const item of services) {
    await repo.save(
      repo.create({ chiNhanhId: branchId, dichVuKhamId: item.dichVuKhamId }),
    );
  }
}

describe('B3 — PublicServiceRepository.findGroups', () => {
  it('TBS-01: nhóm có dịch vụ đang cung cấp / có dịch vụ nhưng không chi nhánh nào cung cấp / nhóm rỗng', async () => {
    const branch = await fixtures.branchWithCoordinates();
    const co = await group('Khám chuyên khoa');
    const chuaCung = await group('Xét nghiệm');
    await group('Tầm soát ung thư');
    const rẻ = await service(co, 'Tim mạch', '200000.00');
    const đắt = await service(co, 'Da liễu', '350000.00');
    await service(chuaCung, 'Máu tổng quát', '90000.00');
    await offer(branch.chiNhanhId, rẻ, đắt);

    const items = await repository.findGroups(null);
    expect(Object.fromEntries(items.map((i) => [i.ten, i]))).toMatchObject({
      'Khám chuyên khoa': {
        soDichVu: 2,
        giaTu: '200000.00',
        sapTrienKhai: false,
      },
      'Xét nghiệm': { soDichVu: 0, giaTu: null, sapTrienKhai: true },
      'Tầm soát ung thư': { soDichVu: 0, giaTu: null, sapTrienKhai: true },
    });
    expect(Object.keys(items[0] ?? {}).sort()).toEqual(
      ['giaTu', 'nhomDichVuId', 'sapTrienKhai', 'soDichVu', 'ten'].sort(),
    );
    expect(typeof items[0]?.nhomDichVuId).toBe('string');
  });

  it('TBS-01: sắp theo thu_tu_hien_thi rồi tên', async () => {
    await group('B hiển thị 2', 2);
    await group('C hiển thị 1', 1);
    await group('A hiển thị 2', 2);
    const items = await repository.findGroups(null);
    expect(items.map((i) => i.ten)).toEqual([
      'C hiển thị 1',
      'A hiển thị 2',
      'B hiển thị 2',
    ]);
  });

  it('TBS-04: có chiNhanhId ⇒ chỉ tính dịch vụ của chi nhánh đó; nhóm không có dịch vụ ở đó ⇒ sắp triển khai', async () => {
    const a = await fixtures.branchWithCoordinates({ ten: 'Chi nhánh A' });
    const b = await fixtures.branchWithCoordinates({ ten: 'Chi nhánh B' });
    const nhom = await group('Khám chuyên khoa');
    const tim = await service(nhom, 'Tim mạch', '200000.00');
    const da = await service(nhom, 'Da liễu', '150000.00');
    await offer(a.chiNhanhId, tim, da);
    await offer(b.chiNhanhId, tim);
    await group('Chỉ ở nơi khác');

    const atA = await repository.findGroups(a.chiNhanhId);
    expect(atA.find((i) => i.ten === 'Khám chuyên khoa')).toMatchObject({
      soDichVu: 2,
      giaTu: '150000.00',
    });
    const atB = await repository.findGroups(b.chiNhanhId);
    expect(atB.find((i) => i.ten === 'Khám chuyên khoa')).toMatchObject({
      soDichVu: 1,
      giaTu: '200000.00',
    });
    // Chi nhánh không tồn tại ⇒ 200 và mọi nhóm "sắp triển khai" (không lỗi)
    const nowhere = await repository.findGroups('999999');
    expect(nowhere.every((i) => i.sapTrienKhai)).toBe(true);
  });
});

describe('B3 — PublicServiceRepository.findServices', () => {
  it('TBS-02: chỉ dịch vụ đang cung cấp của nhóm, đúng tập khoá; tiền là chuỗi decimal', async () => {
    const branch = await fixtures.branchWithCoordinates();
    const nhom = await group('Khám chuyên khoa');
    const khac = await group('Xét nghiệm');
    const tim = await service(nhom, 'Tim mạch', '200000.00', '50000.00');
    await service(nhom, 'Chưa cung cấp', '120000.00');
    const mau = await service(khac, 'Máu', '90000.00');
    await offer(branch.chiNhanhId, tim, mau);

    const items = await repository.findServices(null, nhom.nhomDichVuId);
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      dichVuKhamId: tim.dichVuKhamId,
      ten: 'Tim mạch',
      nhomDichVu: { id: nhom.nhomDichVuId, ten: 'Khám chuyên khoa' },
      thoiLuong: 30,
      giaMacDinh: '200000.00',
      mucDatCoc: '50000.00',
      soBacSi: 0,
    });

    // Không truyền nhóm ⇒ mọi dịch vụ đang cung cấp
    const all = await repository.findServices(null, null);
    expect(all.map((i) => i.ten).sort()).toEqual(['Máu', 'Tim mạch']);
  });

  it('TBS-02: có chiNhanhId ⇒ chỉ dịch vụ của chi nhánh đó', async () => {
    const a = await fixtures.branchWithCoordinates({ ten: 'Chi nhánh A' });
    const b = await fixtures.branchWithCoordinates({ ten: 'Chi nhánh B' });
    const nhom = await group('Khám chuyên khoa');
    const tim = await service(nhom, 'Tim mạch', '200000.00');
    const da = await service(nhom, 'Da liễu', '150000.00');
    await offer(a.chiNhanhId, tim, da);
    await offer(b.chiNhanhId, tim);
    const atB = await repository.findServices(b.chiNhanhId, null);
    expect(atB.map((i) => i.ten)).toEqual(['Tim mạch']);
  });

  it('TBS-02: nhomDichVuId hoặc chiNhanhId không tồn tại ⇒ rỗng, không lỗi (TBS-15)', async () => {
    const nhom = await group('Khám chuyên khoa');
    const tim = await service(nhom, 'Tim mạch', '200000.00');
    const branch = await fixtures.branchWithCoordinates();
    await offer(branch.chiNhanhId, tim);
    expect(await repository.findServices(null, '999999')).toEqual([]);
    expect(await repository.findServices('999999', null)).toEqual([]);
  });

  it('H5/AN: soBacSi đếm đúng điều kiện công khai (bỏ chờ kích hoạt, bị khoá, chuyên khoa ngừng) và theo chi nhánh', async () => {
    const a = await fixtures.branchWithCoordinates({ ten: 'Chi nhánh A' });
    const b = await fixtures.branchWithCoordinates({ ten: 'Chi nhánh B' });
    const nhom = await group('Khám chuyên khoa');
    const tim = await service(nhom, 'Tim mạch', '200000.00');
    await offer(a.chiNhanhId, tim);
    await offer(b.chiNhanhId, tim);
    const dv = { dichVuKhamId: tim.dichVuKhamId };
    await fixtures.publicDoctor(a, dv);
    await fixtures.publicDoctor(a, dv);
    await fixtures.publicDoctor(b, dv);
    await fixtures.pendingDoctor(a, dv);
    await fixtures.suspendedDoctor(a, dv);
    await fixtures.doctorOfInactiveSpecialty(a, dv);
    await fixtures.pruneUnusedFixtureServices();

    const everywhere = await repository.findServices(null, null);
    expect(everywhere[0]?.soBacSi).toBe(3);
    const atA = await repository.findServices(a.chiNhanhId, null);
    expect(atA[0]?.soBacSi).toBe(2);
    const atB = await repository.findServices(b.chiNhanhId, null);
    expect(atB[0]?.soBacSi).toBe(1);
  });

  it('AN: chi nhánh bỏ dịch vụ ⇒ dịch vụ biến mất khỏi danh sách và nhóm quay về sắp triển khai', async () => {
    const branch = await fixtures.branchWithCoordinates();
    const nhom = await group('Khám chuyên khoa');
    const tim = await service(nhom, 'Tim mạch', '200000.00');
    await offer(branch.chiNhanhId, tim);
    expect(await repository.findServices(null, null)).toHaveLength(1);
    await db.getRepository(ChiNhanhDichVuKham).delete({
      chiNhanhId: branch.chiNhanhId,
      dichVuKhamId: tim.dichVuKhamId,
    });
    expect(await repository.findServices(null, null)).toEqual([]);
    expect((await repository.findGroups(null))[0]?.sapTrienKhai).toBe(true);
  });

  it('thứ tự: theo nhóm (thu_tu_hien_thi, tên) rồi tên dịch vụ', async () => {
    const branch = await fixtures.branchWithCoordinates();
    const hai = await group('Nhóm hai', 2);
    const mot = await group('Nhóm một', 1);
    const s1 = await service(hai, 'B dịch vụ', '100000.00');
    const s2 = await service(mot, 'Z dịch vụ', '100000.00');
    const s3 = await service(mot, 'A dịch vụ', '100000.00');
    await offer(branch.chiNhanhId, s1, s2, s3);
    const items = await repository.findServices(null, null);
    expect(items.map((i) => i.ten)).toEqual([
      'A dịch vụ',
      'Z dịch vụ',
      'B dịch vụ',
    ]);
  });
});
