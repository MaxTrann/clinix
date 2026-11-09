import type { DataSource } from 'typeorm';
import { AppException } from '../../common/errors/app.exception.js';
import {
  createTestDataSource,
  readTestDbSettings,
  resetTables,
} from '../../database/testing/test-database.js';
import { ExamPriceReader } from '../../pricing/exam-price.reader.js';
import { DoctorRatingReader } from '../ratings/doctor-rating.reader.js';
import { SearchFixtures } from '../testing/search-fixtures.js';
import { PublicDoctorRepository } from './public-doctor.repository.js';
import { PublicDoctorService } from './public-doctor.service.js';

// B6 — chi tiết bác sĩ công khai trên MySQL thật. Mã ca theo PLAN search mục 7: TBS-13, TBS-08, TBS-09, TBS-14, AN-01…03.
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

async function expectNotFound(id: string) {
  const error = await service.detail(id).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(AppException);
  expect((error as AppException).getStatus()).toBe(404);
  return JSON.stringify((error as AppException).getResponse());
}

describe('B6 — PublicDoctorService.detail (MySQL thật)', () => {
  it('TBS-13/09/14: đủ trường, mô tả NULL ⇒ null, giờ nhận khám 7 thứ, đánh giá { null, 0 }', async () => {
    const branch = await fixtures.branchWithCoordinates();
    await fixtures.partialWeeklySchedule(branch.chiNhanhId, [1, 2, 3]);
    const d = await fixtures.publicDoctor(branch, { moTaChuyenMon: null });
    const detail = await service.detail(d.account.taiKhoanId);

    expect(Object.keys(detail).sort()).toEqual(
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
        'moTaChuyenMon',
      ].sort(),
    );
    expect(detail.moTaChuyenMon).toBeNull();
    expect(detail.danhGia).toEqual({ diemTrungBinh: null, soDanhGia: 0 });
    expect(detail.chiNhanh.chiNhanhId).toBe(branch.chiNhanhId);
    expect(detail.chiNhanh.lichHoatDong).toHaveLength(7);
    expect(detail.chiNhanh.lichHoatDong.map((w) => w.thuTrongTuan)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
    // Thứ chưa khai báo ⇒ hoatDong: null ("Nghỉ").
    expect(detail.chiNhanh.lichHoatDong[3]?.hoatDong).toBeNull();
    expect(detail.chiNhanh.lichHoatDong[0]?.hoatDong).not.toBeNull();
  });

  it('TBS-13: có mô tả chuyên môn thì trả nguyên văn', async () => {
    const branch = await fixtures.branchWithCoordinates();
    const d = await fixtures.publicDoctor(branch, {
      moTaChuyenMon: 'Chuyên điều trị tăng huyết áp.',
    });
    expect((await service.detail(d.account.taiKhoanId)).moTaChuyenMon).toBe(
      'Chuyên điều trị tăng huyết áp.',
    );
  });

  it('TBS-08: giá khám khớp phụ phí hiện hành (mốc cao tắt rơi xuống mốc thấp)', async () => {
    const branch = await fixtures.branchWithCoordinates();
    const d = await fixtures.publicDoctor(branch, {
      chucDanh: 'BS_CKII',
      soNamKinhNghiem: 12,
    });
    await db.query(
      'UPDATE dich_vu_kham SET gia_mac_dinh = ?, muc_dat_coc = ? WHERE dich_vu_kham_id = ?',
      ['200000.00', '50000.00', d.profile.dichVuKhamId],
    );
    await fixtures.surchargeRule('BS_CKII', 5, '150000.00');
    await fixtures.surchargeRule('BS_CKII', 10, '300000.00', false);
    expect((await service.detail(d.account.taiKhoanId)).gia).toEqual({
      giaMacDinh: '200000.00',
      phuPhi: '150000.00',
      giaKham: '350000.00',
      mucDatCoc: '50000.00',
    });
  });

  it('AN-01…03 + TBS-13: không công khai / không có / sai dạng ⇒ 404 cùng một thân', async () => {
    const branch = await fixtures.branchWithCoordinates();
    const bodies = [
      await expectNotFound(
        (await fixtures.pendingDoctor(branch)).account.taiKhoanId,
      ),
      await expectNotFound(
        (await fixtures.suspendedDoctor(branch)).account.taiKhoanId,
      ),
      await expectNotFound(
        (await fixtures.doctorOfInactiveSpecialty(branch)).account.taiKhoanId,
      ),
      await expectNotFound(
        (await fixtures.doctorWithRemovedService(branch)).account.taiKhoanId,
      ),
      await expectNotFound('999999999'),
      await expectNotFound('abc'),
      await expectNotFound('0'),
      await expectNotFound('9223372036854775808'),
    ];
    expect(new Set(bodies).size).toBe(1);
  });

  it('id của lễ tân/bệnh nhân (không phải bác sĩ) ⇒ 404', async () => {
    const branch = await fixtures.branchWithCoordinates();
    const patient = await fixtures.admin.patient();
    await expectNotFound(patient.account.taiKhoanId);
    await expectNotFound(
      (await fixtures.admin.receptionist(branch)).account.taiKhoanId,
    );
  });
});
