import type { DataSource } from 'typeorm';
import { YeuCauThayDoiChiNhanh } from '../../admin/entities/yeu-cau-thay-doi-chi-nhanh.entity.js';
import { ChiNhanhLichHoatDong } from '../../admin/entities/chi-nhanh-lich-hoat-dong.entity.js';
import {
  createTestDataSource,
  readTestDbSettings,
  resetTables,
} from '../../database/testing/test-database.js';
import { SearchFixtures } from '../testing/search-fixtures.js';
import { PublicBranchRepository } from './public-branch.repository.js';

// B1 — truy vấn chi nhánh công khai trên MySQL thật. Mã ca theo PLAN search mục 7.1, 7.5, 7.6.
let db: DataSource;
let fixtures: SearchFixtures;
let repository: PublicBranchRepository;
beforeAll(async () => {
  db = await createTestDataSource(readTestDbSettings());
  fixtures = new SearchFixtures(db);
  repository = new PublicBranchRepository(db);
});
beforeEach(async () => {
  await resetTables(db);
});
afterAll(async () => {
  await db?.destroy();
});

describe('B1 — PublicBranchRepository.findPage', () => {
  it('TCN-01: không lọc ⇒ đủ chi nhánh, sắp theo tên rồi id, toạ độ NULL giữ NULL', async () => {
    await fixtures.branchWithoutCoordinates({ ten: 'B chi nhánh' });
    await fixtures.branchWithCoordinates({ ten: 'A chi nhánh' });
    const { items, total } = await repository.findPage(null, 20, 0);
    expect(total).toBe(2);
    expect(items.map((i) => i.ten)).toEqual(['A chi nhánh', 'B chi nhánh']);
    expect(Object.keys(items[0] ?? {}).sort()).toEqual(
      ['chiNhanhId', 'diaChi', 'ten', 'toaDoLat', 'toaDoLng'].sort(),
    );
    expect(typeof items[0]?.chiNhanhId).toBe('string');
    expect(items[0]?.toaDoLat).toBe('10.7769000');
    expect(items[1]?.toaDoLat).toBeNull();
  });

  it('TCN-02: từ khoá khớp tên hoặc địa chỉ, không phân biệt hoa/thường và dấu', async () => {
    await fixtures.branchWithCoordinates({
      ten: 'Phòng khám Alpha',
      diaChi: '12 Đường Mẫu, Quận 3',
    });
    await fixtures.branchWithCoordinates({
      ten: 'Phòng khám Beta',
      diaChi: '5 Đường Khác, Quận 7',
    });
    const byAddress = await repository.findPage('%quan 3%', 20, 0);
    expect(byAddress.items.map((i) => i.ten)).toEqual(['Phòng khám Alpha']);
    expect(byAddress.total).toBe(1);
    const byName = await repository.findPage('%BETA%', 20, 0);
    expect(byName.items.map((i) => i.ten)).toEqual(['Phòng khám Beta']);
  });

  it('TCN-03: không khớp ⇒ rỗng, total 0', async () => {
    await fixtures.branchWithCoordinates();
    await expect(repository.findPage('%khong-co%', 20, 0)).resolves.toEqual({
      items: [],
      total: 0,
    });
  });

  it('TCN-04: ký tự % và _ đã escape chỉ khớp ký tự thường', async () => {
    await fixtures.branchWithCoordinates({ ten: 'Chi nhánh 100%' });
    await fixtures.branchWithCoordinates({ ten: 'Chi nhánh 1000' });
    const hit = await repository.findPage('%100!%%', 20, 0);
    expect(hit.items.map((i) => i.ten)).toEqual(['Chi nhánh 100%']);
  });

  it('TCN-10: phân trang cắt đúng trang, total là tổng toàn bộ', async () => {
    for (const ten of ['A', 'B', 'C']) {
      await fixtures.branchWithCoordinates({ ten });
    }
    const second = await repository.findPage(null, 2, 2);
    expect(second.items.map((i) => i.ten)).toEqual(['C']);
    expect(second.total).toBe(3);
  });

  it('AN-04: DB chưa có chi nhánh ⇒ rỗng', async () => {
    await expect(repository.findPage(null, 20, 0)).resolves.toEqual({
      items: [],
      total: 0,
    });
  });
});

describe('B1 — PublicBranchRepository.findDetail', () => {
  it('TCN-06: lịch trả đúng các dòng có thật; thứ thiếu không có dòng', async () => {
    const branch = await fixtures.branchWithCoordinates();
    await fixtures.partialWeeklySchedule(branch.chiNhanhId, [1, 2, 3]);
    await db.getRepository(ChiNhanhLichHoatDong).update(
      { chiNhanhId: branch.chiNhanhId, thuTrongTuan: 3 },
      {
        hoatDong: false,
        gioBatDauSang: null,
        gioKetThucSang: null,
        gioBatDauChieu: null,
        gioKetThucChieu: null,
      },
    );
    const found = await repository.findDetail(branch.chiNhanhId);
    expect(found?.schedule.map((r) => r.thuTrongTuan).sort()).toEqual([
      1, 2, 3,
    ]);
    expect(found?.schedule.find((r) => r.thuTrongTuan === 1)?.hoatDong).toBe(
      true,
    );
    expect(found?.schedule.find((r) => r.thuTrongTuan === 3)?.hoatDong).toBe(
      false,
    );
  });

  it('TCN-07 + AN-02/03: dịch vụ đang cung cấp; soBacSi chỉ đếm bác sĩ công khai', async () => {
    const branch = await fixtures.branchWithCoordinates();
    const visible = await fixtures.publicDoctor(branch);
    await fixtures.pendingDoctor(branch);
    await fixtures.suspendedDoctor(branch);
    await fixtures.doctorOfInactiveSpecialty(branch);
    await fixtures.doctorWithRemovedService(branch);
    // Chi nhánh khác có bác sĩ công khai: không được tính vào chi nhánh này.
    await fixtures.publicDoctor(await fixtures.branchWithCoordinates());

    const found = await repository.findDetail(branch.chiNhanhId);
    expect(found?.doctorCount).toBe(1);
    // Ba bác sĩ ẩn (Cho/Ngung/chuyên khoa ngừng) vẫn còn dịch vụ ở chi nhánh; bác sĩ bị bỏ dịch vụ thì không.
    expect(found?.services.map((s) => s.dichVuKhamId)).toContain(
      visible.profile.dichVuKhamId,
    );
    expect(found?.services).toHaveLength(4);
  });

  it('id không tồn tại ⇒ null', async () => {
    await expect(repository.findDetail('999999')).resolves.toBeNull();
  });

  it('TCN-09 (H2): có yêu cầu thay đổi đang chờ ⇒ vẫn trả lịch đang áp dụng', async () => {
    const branch = await fixtures.branchWithCoordinates();
    await fixtures.admin.weeklySchedule(branch.chiNhanhId);
    const admin = await fixtures.admin.admin();
    await db.getRepository(YeuCauThayDoiChiNhanh).save({
      chiNhanhId: branch.chiNhanhId,
      nguoiDeXuatId: admin.account.taiKhoanId,
      noiDungTruoc: { ten: 'cũ' },
      noiDungSau: {
        lichHoatDong: [{ thuTrongTuan: 1, hoatDong: false }],
      },
      trangThai: 'ChoDuyet',
    });
    const found = await repository.findDetail(branch.chiNhanhId);
    expect(found?.schedule).toHaveLength(7);
    expect(found?.schedule.every((r) => r.hoatDong)).toBe(true);
    expect(Object.keys(found ?? {})).not.toContain('yeuCau');
  });

  it('CC-07: gọi không làm đổi dữ liệu', async () => {
    const branch = await fixtures.branchWithCoordinates();
    await fixtures.admin.weeklySchedule(branch.chiNhanhId);
    await fixtures.publicDoctor(branch);
    const checksum = () =>
      db.query<unknown[]>(
        'CHECKSUM TABLE chi_nhanh, chi_nhanh_lich_hoat_dong, chi_nhanh_dich_vu_kham, bac_si',
      );
    const before = await checksum();
    await repository.findPage(null, 20, 0);
    await repository.findDetail(branch.chiNhanhId);
    expect(await checksum()).toEqual(before);
  });
});
