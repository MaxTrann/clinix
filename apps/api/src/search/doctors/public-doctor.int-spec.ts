import type { DataSource } from 'typeorm';
import { computeExamPrice } from '../../pricing/surcharge.calculator.js';
import {
  createTestDataSource,
  readTestDbSettings,
  resetTables,
} from '../../database/testing/test-database.js';
import { ExamPriceReader } from '../pricing/exam-price.reader.js';
import { DoctorRatingReader } from '../ratings/doctor-rating.reader.js';
import { SearchFixtures } from '../testing/search-fixtures.js';
import { PublicDoctorQueryDto } from './public-doctor.dto.js';
import { PublicDoctorRepository } from './public-doctor.repository.js';
import { PublicDoctorService } from './public-doctor.service.js';

// B5 — danh sách bác sĩ công khai trên MySQL thật. Mã ca theo PLAN search mục 7: TBS-03…06, 08, 09, 10, 11, 14, AN-01…03.
let db: DataSource;
let fixtures: SearchFixtures;
let service: PublicDoctorService;
beforeAll(async () => {
  db = await createTestDataSource(readTestDbSettings());
  fixtures = new SearchFixtures(db);
  const prices = new ExamPriceReader(db);
  service = new PublicDoctorService(
    new PublicDoctorRepository(db, prices),
    prices,
    new DoctorRatingReader(),
  );
});
beforeEach(async () => {
  await resetTables(db);
});
afterAll(async () => {
  await db?.destroy();
});

const list = (raw: Partial<PublicDoctorQueryDto> = {}) =>
  service.list(Object.assign(new PublicDoctorQueryDto(), raw));

async function setPrice(serviceId: string, gia: string, coc = '0.00') {
  await db.query(
    'UPDATE dich_vu_kham SET gia_mac_dinh = ?, muc_dat_coc = ? WHERE dich_vu_kham_id = ?',
    [gia, coc, serviceId],
  );
}

describe('B5 — PublicDoctorService.list (MySQL thật)', () => {
  it('AN-01…03, TBS-10: chỉ bác sĩ công khai hiện; không có ⇒ 200 rỗng', async () => {
    expect(await list()).toMatchObject({ items: [], total: 0 });
    const branch = await fixtures.branchWithCoordinates();
    const visible = await fixtures.publicDoctor(branch);
    await fixtures.pendingDoctor(branch);
    await fixtures.suspendedDoctor(branch);
    await fixtures.doctorOfInactiveSpecialty(branch);
    await fixtures.doctorWithRemovedService(branch);
    const result = await list();
    expect(result.items.map((i) => i.bacSiId)).toEqual([
      visible.account.taiKhoanId,
    ]);
    expect(result.total).toBe(1);
  });

  it('TBS-09, TBS-14: đúng tập khoá danh sách trắng, đánh giá { null, 0 }', async () => {
    const branch = await fixtures.branchWithCoordinates();
    await fixtures.publicDoctor(branch);
    const [item] = (await list()).items;
    expect(Object.keys(item ?? {}).sort()).toEqual(
      [
        'bacSiId',
        'hoTen',
        'chucDanh',
        'soNamKinhNghiem',
        'chuyenKhoa',
        'chiNhanh',
        'dichVu',
        'gia',
        'danhGia',
      ].sort(),
    );
    expect(Object.keys(item?.gia ?? {}).sort()).toEqual(
      ['giaKham', 'giaMacDinh', 'mucDatCoc', 'phuPhi'].sort(),
    );
    expect(item?.danhGia).toEqual({ diemTrungBinh: null, soDanhGia: 0 });
    expect(typeof item?.bacSiId).toBe('string');
    expect(typeof item?.chiNhanh.chiNhanhId).toBe('string');
  });

  it('TBS-03, TBS-04, TBS-15: lọc dịch vụ, chuyên khoa, chi nhánh; id không tồn tại ⇒ 200 rỗng', async () => {
    const b1 = await fixtures.branchWithCoordinates();
    const b2 = await fixtures.branchWithCoordinates();
    const d1 = await fixtures.publicDoctor(b1);
    const d2 = await fixtures.publicDoctor(b2);
    const only = (r: { items: { bacSiId: string }[] }) =>
      r.items.map((i) => i.bacSiId);

    expect(only(await list({ chiNhanhId: b1.chiNhanhId }))).toEqual([
      d1.account.taiKhoanId,
    ]);
    expect(only(await list())).toHaveLength(2);
    expect(only(await list({ dichVuKhamId: d2.profile.dichVuKhamId }))).toEqual(
      [d2.account.taiKhoanId],
    );
    expect(only(await list({ chuyenKhoaId: d1.profile.chuyenKhoaId }))).toEqual(
      [d1.account.taiKhoanId],
    );
    expect(await list({ dichVuKhamId: '999999999' })).toMatchObject({
      items: [],
      total: 0,
    });
  });

  it('TBS-05: q khớp một phần họ tên không dấu và tên chuyên khoa; ký tự LIKE bị escape', async () => {
    const branch = await fixtures.branchWithCoordinates();
    const d = await fixtures.publicDoctor(
      branch,
      {},
      { hoTen: 'Nguyễn Văn Hùng' },
    );
    await fixtures.publicDoctor(branch, {}, { hoTen: 'Trần Thị Mai' });
    await db.query('UPDATE chuyen_khoa SET ten = ? WHERE chuyen_khoa_id = ?', [
      'Tim mạch',
      d.profile.chuyenKhoaId,
    ]);

    const byName = await list({ q: 'hung' });
    expect(byName.items.map((i) => i.hoTen)).toEqual(['Nguyễn Văn Hùng']);
    const bySpecialty = await list({ q: 'tim mach' });
    expect(bySpecialty.items.map((i) => i.hoTen)).toEqual(['Nguyễn Văn Hùng']);
    // '%' là ký tự thường, không khớp mọi dòng.
    expect((await list({ q: '%' })).total).toBe(0);
    // Chuỗi kiểu SQL injection chỉ là ký tự thường (BMS-03).
    expect((await list({ q: "' OR 1=1 --" })).total).toBe(0);
  });

  it('TBS-08: giá áp dụng = giá dịch vụ + phụ phí, khớp trực tiếp hàm chung', async () => {
    const branch = await fixtures.branchWithCoordinates();
    const d = await fixtures.publicDoctor(branch, {
      chucDanh: 'BS_CKII',
      soNamKinhNghiem: 12,
    });
    await setPrice(d.profile.dichVuKhamId, '200000.00', '50000.00');
    await fixtures.surchargeRule('BS_CKII', 5, '150000.00');
    await fixtures.surchargeRule('BS_CKII', 10, '300000.00', false);
    await fixtures.surchargeRule('GS_TS_BS', 0, '900000.00');

    const [item] = (await list()).items;
    const rules = await new ExamPriceReader(db).loadRules();
    expect(item?.gia).toEqual({
      giaMacDinh: '200000.00',
      phuPhi: '150000.00',
      giaKham: computeExamPrice('200000.00', rules, {
        chucDanh: 'BS_CKII',
        soNamKinhNghiem: 12,
      }),
      mucDatCoc: '50000.00',
    });
    expect(item?.gia.giaKham).toBe('350000.00');
  });

  it('TBS-06: giaTu/giaDen so với GIÁ ÁP DỤNG (không phải giá mặc định), biên đóng', async () => {
    const branch = await fixtures.branchWithCoordinates();
    const cheap = await fixtures.publicDoctor(branch, { chucDanh: 'BS' });
    const dear = await fixtures.publicDoctor(branch, { chucDanh: 'BS_CKII' });
    await setPrice(cheap.profile.dichVuKhamId, '200000.00');
    await setPrice(dear.profile.dichVuKhamId, '200000.00');
    await fixtures.surchargeRule('BS_CKII', 0, '100000.00');

    const ids = async (raw: Partial<PublicDoctorQueryDto>) =>
      (await list(raw)).items.map((i) => i.bacSiId);
    expect(await ids({ giaTu: '300000' })).toEqual([dear.account.taiKhoanId]);
    expect(await ids({ giaDen: '200000' })).toEqual([cheap.account.taiKhoanId]);
    expect(await ids({ giaTu: '200000', giaDen: '300000' })).toHaveLength(2);
    expect(await ids({ giaTu: '300001' })).toEqual([]);
  });

  it('TBS-07, TBS-14: chưa có bảng đánh giá nên diemTu loại hết bác sĩ', async () => {
    const branch = await fixtures.branchWithCoordinates();
    await fixtures.publicDoctor(branch);
    expect((await list({ diemTu: '1' })).total).toBe(0);
    expect((await list()).total).toBe(1);
  });

  it('TBS-11: phân trang sau khi lọc, total đúng', async () => {
    const branch = await fixtures.branchWithCoordinates();
    for (let i = 0; i < 25; i++) await fixtures.publicDoctor(branch);
    const page2 = await list({ page: 2, pageSize: 20 });
    expect(page2.items).toHaveLength(5);
    expect(page2).toMatchObject({ total: 25, page: 2, pageSize: 20 });
    const all = [
      ...(await list({ page: 1, pageSize: 20 })).items,
      ...page2.items,
    ].map((i) => i.bacSiId);
    expect(new Set(all).size).toBe(25);
  });
});
