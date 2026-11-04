import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { ChuyenKhoa } from '../../admin/entities/chuyen-khoa.entity.js';
import {
  createTestDataSource,
  readTestDbSettings,
  resetTables,
} from '../../database/testing/test-database.js';
import { SearchFixtures } from '../testing/search-fixtures.js';
import { PublicSpecialtyRepository } from './public-specialty.repository.js';

// B2 — truy vấn chuyên khoa công khai trên MySQL thật. Mã ca theo PLAN search mục 7.2, 7.5.
let db: DataSource;
let fixtures: SearchFixtures;
let repository: PublicSpecialtyRepository;
beforeAll(async () => {
  db = await createTestDataSource(readTestDbSettings());
  fixtures = new SearchFixtures(db);
  repository = new PublicSpecialtyRepository(db);
});
beforeEach(async () => {
  await resetTables(db);
});
afterAll(async () => {
  await db?.destroy();
});

// Tạo một chuyên khoa với tên/mô tả cụ thể (AdminFixtures.catalog() đặt tên ngẫu nhiên).
async function specialty(
  ten: string,
  overrides: Partial<ChuyenKhoa> = {},
): Promise<ChuyenKhoa> {
  const repo = db.getRepository(ChuyenKhoa);
  return repo.save(repo.create({ ten, ...overrides }));
}

const all = (branchId: string | null = null, like: string | null = null) =>
  repository.findPage(like, branchId, 20, 0);

describe('B2 — PublicSpecialtyRepository.findPage', () => {
  it('TCK-01: chỉ chuyên khoa đang hoạt động, đúng tập khoá danh sách trắng', async () => {
    await specialty('Tim mạch', { moTa: 'Mô tả tim' });
    await specialty('Da liễu', { trangThaiHoatDong: 'NgungHoatDong' });
    const { items, total } = await all();
    expect(total).toBe(1);
    expect(items.map((i) => i.ten)).toEqual(['Tim mạch']);
    expect(Object.keys(items[0] ?? {}).sort()).toEqual(
      ['anhDaiDien', 'chuyenKhoaId', 'moTa', 'soBacSi', 'ten'].sort(),
    );
    expect(typeof items[0]?.chuyenKhoaId).toBe('string');
    expect(items[0]).toMatchObject({
      moTa: 'Mô tả tim',
      anhDaiDien: null,
      soBacSi: 0,
    });
  });

  it('TCK-02: ảnh = secure_url / URL cũ / null', async () => {
    const owner = (await fixtures.admin.patient()).account.taiKhoanId;
    const imageId = randomUUID();
    await db.query(
      `INSERT INTO anh_tai_len (anh_tai_len_id, public_id, secure_url, nguoi_tai_len_id, trang_thai, tao_luc, het_han_gan_luc)
       VALUES (?, ?, ?, ?, 'DaGan', NOW(), NOW())`,
      [imageId, `pid-${imageId}`, 'https://anh.example/moi.jpg', owner],
    );
    await specialty('A có ảnh mới', {
      anhTaiLenId: imageId,
      anhDaiDien: 'https://anh.example/cu.jpg',
    });
    await specialty('B chỉ URL cũ', {
      anhDaiDien: 'https://anh.example/cu.jpg',
    });
    await specialty('C không ảnh');
    const { items } = await all();
    expect(items.map((i) => i.anhDaiDien)).toEqual([
      'https://anh.example/moi.jpg',
      'https://anh.example/cu.jpg',
      null,
    ]);
  });

  it('TCK-03: chỉ bác sĩ ChoKichHoat ⇒ 0; có bác sĩ công khai ⇒ đúng số; bác sĩ bị khoá/ngừng không tính', async () => {
    const branch = await fixtures.branchWithCoordinates();
    const sapCo = await specialty('Sắp có bác sĩ');
    const coBacSi = await specialty('Có bác sĩ');
    await fixtures.pendingDoctor(branch, { chuyenKhoaId: sapCo.chuyenKhoaId });
    await fixtures.publicDoctor(branch, { chuyenKhoaId: coBacSi.chuyenKhoaId });
    await fixtures.publicDoctor(branch, { chuyenKhoaId: coBacSi.chuyenKhoaId });
    await fixtures.suspendedDoctor(branch, {
      chuyenKhoaId: coBacSi.chuyenKhoaId,
    });
    const { items, soCoBacSi, total } = await all();
    expect(total).toBe(2);
    expect(Object.fromEntries(items.map((i) => [i.ten, i.soBacSi]))).toEqual({
      'Sắp có bác sĩ': 0,
      'Có bác sĩ': 2,
    });
    expect(soCoBacSi).toBe(1);
  });

  it('TCK-04: lọc chi nhánh A ⇒ chỉ chuyên khoa có bác sĩ công khai ở A và đếm ở A; không lọc ⇒ mọi chuyên khoa', async () => {
    const a = await fixtures.branchWithCoordinates({ ten: 'Chi nhánh A' });
    const b = await fixtures.branchWithCoordinates({ ten: 'Chi nhánh B' });
    const tim = await specialty('Tim mạch');
    const than = await specialty('Thần kinh');
    await specialty('Không bác sĩ');
    await fixtures.publicDoctor(a, { chuyenKhoaId: tim.chuyenKhoaId });
    await fixtures.publicDoctor(b, { chuyenKhoaId: tim.chuyenKhoaId });
    await fixtures.publicDoctor(b, { chuyenKhoaId: than.chuyenKhoaId });

    const atA = await all(a.chiNhanhId);
    expect(atA.items.map((i) => [i.ten, i.soBacSi])).toEqual([['Tim mạch', 1]]);
    expect(atA.total).toBe(1);
    expect(atA.soCoBacSi).toBe(1);

    const atB = await all(b.chiNhanhId);
    expect(atB.items.map((i) => [i.ten, i.soBacSi])).toEqual([
      ['Thần kinh', 1],
      ['Tim mạch', 1],
    ]);

    const everywhere = await all();
    expect(everywhere.total).toBe(3);
    expect(everywhere.soCoBacSi).toBe(2);
    expect(everywhere.items.find((i) => i.ten === 'Tim mạch')?.soBacSi).toBe(2);
  });

  it('TCK-05: q khớp tên hoặc mô tả không phân biệt dấu/hoa thường; không khớp ⇒ rỗng', async () => {
    await specialty('Tim mạch');
    await specialty('Thần kinh', { moTa: 'Khám đau đầu, tim đập nhanh' });
    await specialty('Tiêu hóa');
    const hit = await all(null, '%TIM%');
    expect(hit.items.map((i) => i.ten)).toEqual(['Thần kinh', 'Tim mạch']);
    expect(hit.total).toBe(2);
    await expect(all(null, '%khong-co%')).resolves.toEqual({
      items: [],
      total: 0,
      soCoBacSi: 0,
    });
  });

  it('TCK-05b: ký tự % đã escape chỉ khớp ký tự thường', async () => {
    await specialty('Gói 100%');
    await specialty('Gói 1000');
    const hit = await all(null, '%100!%%');
    expect(hit.items.map((i) => i.ten)).toEqual(['Gói 100%']);
  });

  it('TCK-08: chi nhánh không tồn tại ⇒ rỗng; q kết hợp chi nhánh; phân trang cắt đúng nhưng total giữ nguyên', async () => {
    const branch = await fixtures.branchWithCoordinates();
    for (const ten of ['A', 'B', 'C']) {
      const s = await specialty(`Khoa ${ten}`);
      await fixtures.publicDoctor(branch, { chuyenKhoaId: s.chuyenKhoaId });
    }
    await expect(all('999999')).resolves.toEqual({
      items: [],
      total: 0,
      soCoBacSi: 0,
    });
    const page2 = await repository.findPage(null, branch.chiNhanhId, 2, 2);
    expect(page2.items.map((i) => i.ten)).toEqual(['Khoa C']);
    expect(page2.total).toBe(3);
    expect(page2.soCoBacSi).toBe(3);
    const combined = await all(branch.chiNhanhId, '%khoa b%');
    expect(combined.items.map((i) => i.ten)).toEqual(['Khoa B']);
  });

  it('AN: bác sĩ thuộc chuyên khoa ngừng, hoặc chi nhánh đã bỏ dịch vụ, không được đếm', async () => {
    const branch = await fixtures.branchWithCoordinates();
    const skill = await specialty('Chuyên khoa thử');
    const removed = await fixtures.doctorWithRemovedService(branch);
    await db
      .getRepository(ChuyenKhoa)
      .update(removed.profile.chuyenKhoaId, { ten: 'Dịch vụ đã bỏ' });
    await fixtures.publicDoctor(branch, { chuyenKhoaId: skill.chuyenKhoaId });
    const { items } = await all();
    const counts = Object.fromEntries(items.map((i) => [i.ten, i.soBacSi]));
    expect(counts['Dịch vụ đã bỏ']).toBe(0);
    expect(counts['Chuyên khoa thử']).toBe(1);
  });
});

describe('B2 — PublicSpecialtyRepository.findDetail', () => {
  it('TCK-06: đang hoạt động ⇒ có; ngừng hoặc không tồn tại ⇒ null', async () => {
    const active = await specialty('Tim mạch');
    const stopped = await specialty('Da liễu', {
      trangThaiHoatDong: 'NgungHoatDong',
    });
    await expect(
      repository.findDetail(active.chuyenKhoaId, null),
    ).resolves.toMatchObject({ ten: 'Tim mạch', soBacSi: 0 });
    await expect(
      repository.findDetail(stopped.chuyenKhoaId, null),
    ).resolves.toBeNull();
    await expect(repository.findDetail('999999', null)).resolves.toBeNull();
  });

  it('TCK-04b: chi tiết đếm bác sĩ theo chi nhánh; chuyên khoa 0 bác sĩ ở chi nhánh vẫn có chi tiết', async () => {
    const a = await fixtures.branchWithCoordinates({ ten: 'A' });
    const b = await fixtures.branchWithCoordinates({ ten: 'B' });
    const tim = await specialty('Tim mạch');
    await fixtures.publicDoctor(a, { chuyenKhoaId: tim.chuyenKhoaId });
    await fixtures.publicDoctor(a, { chuyenKhoaId: tim.chuyenKhoaId });
    await fixtures.publicDoctor(b, { chuyenKhoaId: tim.chuyenKhoaId });
    expect((await repository.findDetail(tim.chuyenKhoaId, null))?.soBacSi).toBe(
      3,
    );
    expect(
      (await repository.findDetail(tim.chuyenKhoaId, a.chiNhanhId))?.soBacSi,
    ).toBe(2);
    expect(
      (await repository.findDetail(tim.chuyenKhoaId, '999999'))?.soBacSi,
    ).toBe(0);
  });
});
