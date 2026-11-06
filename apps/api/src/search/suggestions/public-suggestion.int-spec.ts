import type { DataSource } from 'typeorm';
import { ChuyenKhoa } from '../../admin/entities/chuyen-khoa.entity.js';
import {
  createTestDataSource,
  readTestDbSettings,
  resetTables,
} from '../../database/testing/test-database.js';
import { SearchFixtures } from '../testing/search-fixtures.js';
import { PublicSuggestionRepository } from './public-suggestion.repository.js';

// B8 — gợi ý ô tìm tổng trên MySQL thật (Q20). Mã ca: AN-01…03, BMS-03, giới hạn 5/nhóm.
let db: DataSource;
let fixtures: SearchFixtures;
let repository: PublicSuggestionRepository;
beforeAll(async () => {
  db = await createTestDataSource(readTestDbSettings());
  fixtures = new SearchFixtures(db);
  repository = new PublicSuggestionRepository(db);
});
beforeEach(async () => {
  await resetTables(db);
});
afterAll(async () => {
  await db?.destroy();
});

describe('B8 — PublicSuggestionRepository.find', () => {
  it('Q20: khớp không phân biệt hoa/thường và dấu ở cả ba nhóm', async () => {
    const branch = await fixtures.branchWithCoordinates();
    const d = await fixtures.publicDoctor(
      branch,
      {},
      { hoTen: 'Nguyễn Văn Tim' },
    );
    await db.query('UPDATE chuyen_khoa SET ten = ? WHERE chuyen_khoa_id = ?', [
      'Tim mạch',
      d.profile.chuyenKhoaId,
    ]);
    await db.query(
      'UPDATE dich_vu_kham SET ten = ? WHERE dich_vu_kham_id = ?',
      ['Khám tim', d.profile.dichVuKhamId],
    );
    const result = await repository.find('%TIM%');
    expect(result.chuyenKhoa.map((x) => x.ten)).toEqual(['Tim mạch']);
    expect(result.dichVu.map((x) => x.ten)).toEqual(['Khám tim']);
    expect(result.bacSi.map((x) => x.hoTen)).toEqual(['Nguyễn Văn Tim']);
    expect(Object.keys(result.bacSi[0] ?? {}).sort()).toEqual(
      ['bacSiId', 'chucDanh', 'hoTen'].sort(),
    );
    expect(Object.keys(result.chuyenKhoa[0] ?? {}).sort()).toEqual([
      'chuyenKhoaId',
      'ten',
    ]);
  });

  it('AN-01…03: phần tử ngừng/ẩn không bao giờ được gợi ý', async () => {
    const branch = await fixtures.branchWithCoordinates();
    const visible = await fixtures.publicDoctor(
      branch,
      {},
      { hoTen: 'Zed Hiện' },
    );
    await fixtures.pendingDoctor(branch, {});
    await db.query(
      `UPDATE tai_khoan SET ho_ten = 'Zed Chờ' WHERE trang_thai = 'ChoKichHoat'`,
    );
    const suspended = await fixtures.suspendedDoctor(branch);
    await db.query('UPDATE tai_khoan SET ho_ten = ? WHERE tai_khoan_id = ?', [
      'Zed Khóa',
      suspended.account.taiKhoanId,
    ]);
    const removed = await fixtures.doctorWithRemovedService(branch);
    await db.query('UPDATE tai_khoan SET ho_ten = ? WHERE tai_khoan_id = ?', [
      'Zed Mất DV',
      removed.account.taiKhoanId,
    ]);
    const inactive = await fixtures.doctorOfInactiveSpecialty(branch);
    await db.query('UPDATE tai_khoan SET ho_ten = ? WHERE tai_khoan_id = ?', [
      'Zed Ngừng CK',
      inactive.account.taiKhoanId,
    ]);
    await db
      .getRepository(ChuyenKhoa)
      .save({ ten: 'Zed khoa ngừng', trangThaiHoatDong: 'NgungHoatDong' });

    const result = await repository.find('%Zed%');
    expect(result.bacSi.map((x) => x.bacSiId)).toEqual([
      visible.account.taiKhoanId,
    ]);
    expect(result.chuyenKhoa).toEqual([]);
  });

  it('Q20: mỗi nhóm tối đa 5 phần tử, thứ tự ổn định', async () => {
    const branch = await fixtures.branchWithCoordinates();
    for (let i = 0; i < 7; i++) {
      await fixtures.publicDoctor(branch, {}, { hoTen: `Lê Văn ${i}` });
    }
    const first = await repository.find('%Lê Văn%');
    expect(first.bacSi).toHaveLength(5);
    expect(await repository.find('%Lê Văn%')).toEqual(first);
  });

  it('BMS-03: % và _ là ký tự thường; chuỗi SQL injection không khớp gì', async () => {
    const branch = await fixtures.branchWithCoordinates();
    await fixtures.publicDoctor(branch, {}, { hoTen: 'Trần Thị Mai' });
    const noMatch = { chuyenKhoa: [], dichVu: [], bacSi: [] };
    expect(await repository.find('%!%%')).toEqual(noMatch);
    expect(await repository.find('%!_%')).toEqual(noMatch);
    expect(await repository.find("%' OR 1=1 --%")).toEqual(noMatch);
  });
});
