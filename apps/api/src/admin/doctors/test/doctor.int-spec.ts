import 'reflect-metadata';
import type { DataSource } from 'typeorm';
import {
  createTestDataSource,
  readTestDbSettings,
  resetTables,
} from '../../../database/testing/test-database.js';
import { ExamPriceReader } from '../../../pricing/exam-price.reader.js';
import { BranchAccessPolicy } from '../../../rbac/branch-access.policy.js';
import { PhuPhiBacSi } from '../../entities/phu-phi-bac-si.entity.js';
import { AdminFixtures } from '../../testing/admin-fixtures.js';
import { DoctorListDto } from '../doctor.dto.js';
import { DoctorRepository } from '../doctor.repository.js';
import { DoctorService } from '../doctor.service.js';

// Admin B12 — hồ sơ bác sĩ, phần đọc, trên MySQL 8.4 THẬT: BS-43 (phạm vi, lọc, tìm), BS-33 và BS-40 (phần đọc: 404), BS-39 (phần đọc: mọi trạng thái tài khoản),
// BS-45 (phần đọc: phụ phí và giá khám theo bảng hiện hành), HSB-01 (phân trang), HSB-03 (không lộ trường nhạy cảm). BS-01 (bảng tính phụ phí) đã có ở pricing/surcharge.calculator.spec.ts.
const system = { kind: 'ToanHeThong' } as const;
const branchScope = (chiNhanhId: string) =>
  ({ kind: 'ChiNhanh', chiNhanhId }) as const;
const query = (values: Partial<DoctorListDto> = {}) =>
  Object.assign(new DoctorListDto(), values);

describe('B12 hồ sơ bác sĩ (đọc) — MySQL thật', () => {
  let db: DataSource;
  let service: DoctorService;
  let fx: AdminFixtures;

  beforeAll(async () => {
    db = await createTestDataSource(readTestDbSettings());
    service = new DoctorService(
      new DoctorRepository(db, new ExamPriceReader(db)),
      new BranchAccessPolicy(),
    );
  });
  beforeEach(async () => {
    await resetTables(db);
    fx = new AdminFixtures(db);
  });
  afterAll(async () => db?.destroy());

  /** Hai chi nhánh, mỗi chi nhánh hai bác sĩ có tên cố định để kiểm thứ tự. */
  async function world() {
    const mine = await fx.branch({ ten: 'Chi nhánh A' });
    const other = await fx.branch({ ten: 'Chi nhánh B' });
    const an = await fx.doctor(
      mine,
      {},
      { hoTen: 'Bác sĩ An', email: 'an@clinix.test' },
    );
    const binh = await fx.doctor(
      mine,
      {},
      { hoTen: 'Bác sĩ Bình', email: 'binh@clinix.test' },
    );
    const cuong = await fx.doctor(
      other,
      {},
      { hoTen: 'Bác sĩ Cường', email: 'cuong@clinix.test' },
    );
    return { mine, other, an, binh, cuong };
  }

  describe('BS-43 phạm vi, lọc chuyên khoa, tìm kiếm', () => {
    it('Chi nhánh chỉ thấy bác sĩ chi nhánh mình, KỂ CẢ khi gửi chiNhanhId của chi nhánh khác', async () => {
      const w = await world();
      const scope = branchScope(w.mine.chiNhanhId);
      for (const input of [
        query(),
        query({ chiNhanhId: w.other.chiNhanhId }),
      ]) {
        const page = await service.list(scope, input);
        expect(page.items.map((d) => d.hoTen)).toEqual([
          'Bác sĩ An',
          'Bác sĩ Bình',
        ]);
        expect(page.total).toBe(2);
      }
    });

    it('Toàn hệ thống thấy tất cả; lọc theo chi nhánh được', async () => {
      const w = await world();
      expect((await service.list(system, query())).total).toBe(3);
      const filtered = await service.list(
        system,
        query({ chiNhanhId: w.other.chiNhanhId }),
      );
      expect(filtered.items.map((d) => d.hoTen)).toEqual(['Bác sĩ Cường']);
    });

    it('lọc chuyên khoa; tìm theo họ tên hoặc email (không phân biệt hoa thường)', async () => {
      const w = await world();
      const bySpecialty = await service.list(
        system,
        query({ chuyenKhoaId: w.binh.profile.chuyenKhoaId }),
      );
      expect(bySpecialty.items.map((d) => d.hoTen)).toEqual(['Bác sĩ Bình']);
      expect(
        (await service.list(system, query({ q: 'cường' }))).items,
      ).toHaveLength(1);
      expect(
        (await service.list(system, query({ q: 'AN@CLINIX' }))).items,
      ).toHaveLength(1);
      expect(
        (await service.list(system, query({ q: 'không có ai' }))).total,
      ).toBe(0);
    });

    it('ca biên: `%` và `_` trong từ khoá là chữ thường, không phải ký tự đại diện', async () => {
      const branch = await fx.branch();
      await fx.doctor(branch, {}, { hoTen: 'Bác sĩ 100% tận tâm' });
      await fx.doctor(branch, {}, { hoTen: 'Bác sĩ Thường' });
      expect(
        (await service.list(system, query({ q: '%' }))).items.map(
          (d) => d.hoTen,
        ),
      ).toEqual(['Bác sĩ 100% tận tâm']);
      expect((await service.list(system, query({ q: '_' }))).total).toBe(0);
    });
  });

  describe('BS-33, BS-40 (phần đọc) chi tiết ngoài phạm vi hay không phải bác sĩ ⇒ 404', () => {
    it('Chi nhánh xem bác sĩ chi nhánh khác ⇒ 404 KHONG_TIM_THAY; xem bác sĩ của mình thì được', async () => {
      const w = await world();
      const scope = branchScope(w.mine.chiNhanhId);
      await expect(
        service.get(scope, w.cuong.account.taiKhoanId),
      ).rejects.toMatchObject({
        status: 404,
        maLoi: 'KHONG_TIM_THAY',
      });
      expect((await service.get(scope, w.an.account.taiKhoanId)).hoTen).toBe(
        'Bác sĩ An',
      );
      expect(
        (await service.get(system, w.cuong.account.taiKhoanId)).hoTen,
      ).toBe('Bác sĩ Cường');
    });

    it('id của Lễ tân, Quản trị viên, Bệnh nhân và id không tồn tại ⇒ 404', async () => {
      const branch = await fx.branch();
      const ids = [
        (await fx.receptionist(branch)).account.taiKhoanId,
        (await fx.admin()).account.taiKhoanId,
        (await fx.patient()).account.taiKhoanId,
        '999999999',
      ];
      for (const id of ids)
        await expect(service.get(system, id)).rejects.toMatchObject({
          status: 404,
        });
    });
  });

  it('BS-39 (phần đọc): bác sĩ ChoKichHoat và NgungHoatDong có trong danh sách và chi tiết, đúng trạng thái', async () => {
    const branch = await fx.branch();
    const pending = await fx.doctor(
      branch,
      {},
      { hoTen: 'A chờ', trangThai: 'ChoKichHoat', matKhauBam: null },
    );
    await fx.doctor(
      branch,
      {},
      { hoTen: 'B ngừng', trangThai: 'NgungHoatDong' },
    );
    const page = await service.list(system, query());
    expect(page.items.map((d) => [d.hoTen, d.trangThaiTaiKhoan])).toEqual([
      ['A chờ', 'ChoKichHoat'],
      ['B ngừng', 'NgungHoatDong'],
    ]);
    expect(
      (await service.get(system, pending.account.taiKhoanId)).trangThaiTaiKhoan,
    ).toBe('ChoKichHoat');
  });

  describe('BS-45 (phần đọc) phụ phí và giá khám theo bảng phụ phí hiện hành', () => {
    const rule = (soNam: number, phuPhi: string, apDung = true) =>
      db.getRepository(PhuPhiBacSi).save({
        chucDanh: 'BS_CKI',
        soNamKinhNghiemTu: soNam,
        phuPhi,
        apDung,
      });

    it('không có quy tắc ⇒ phụ phí 0.00, giá khám = giá mặc định', async () => {
      const branch = await fx.branch();
      const d = await fx.doctor(branch, {
        chucDanh: 'BS_CKI',
        soNamKinhNghiem: 10,
      });
      const detail = await service.get(system, d.account.taiKhoanId);
      expect(detail).toMatchObject({
        giaMacDinh: '100000.00',
        phuPhi: '0.00',
        giaKham: '100000.00',
      });
    });

    it('chọn mốc lớn nhất ≤ kinh nghiệm; mốc cao bị tắt thì rơi xuống mốc thấp; danh sách và chi tiết cùng số', async () => {
      const branch = await fx.branch();
      const d = await fx.doctor(branch, {
        chucDanh: 'BS_CKI',
        soNamKinhNghiem: 10,
      });
      await rule(0, '20000.00');
      await rule(5, '50000.00');
      await rule(10, '90000.00', false);
      await rule(15, '150000.00');
      const detail = await service.get(system, d.account.taiKhoanId);
      expect(detail).toMatchObject({
        phuPhi: '50000.00',
        giaKham: '150000.00',
      });
      const [item] = (await service.list(system, query())).items;
      expect(item).toMatchObject({ phuPhi: '50000.00', giaKham: '150000.00' });
    });

    it('khác chức danh không áp dụng', async () => {
      const branch = await fx.branch();
      const d = await fx.doctor(branch, {
        chucDanh: 'BS',
        soNamKinhNghiem: 20,
      });
      await rule(0, '20000.00');
      expect((await service.get(system, d.account.taiKhoanId)).phuPhi).toBe(
        '0.00',
      );
    });
  });

  describe('HSB-01 phân trang', () => {
    it('total đúng theo bộ lọc; trang cuối còn phần dư; trang vượt quá thì rỗng; trùng họ tên thứ tự ổn định theo id', async () => {
      const branch = await fx.branch();
      const ids: string[] = [];
      for (let i = 0; i < 5; i++)
        ids.push(
          (await fx.doctor(branch, {}, { hoTen: 'Trùng Tên' })).account
            .taiKhoanId,
        );
      const page1 = await service.list(system, query({ page: 1, pageSize: 2 }));
      const page3 = await service.list(system, query({ page: 3, pageSize: 2 }));
      const page4 = await service.list(system, query({ page: 4, pageSize: 2 }));
      expect(page1).toMatchObject({ total: 5, page: 1, pageSize: 2 });
      expect(page1.items.map((d) => d.taiKhoanId)).toEqual(ids.slice(0, 2));
      expect(page3.items.map((d) => d.taiKhoanId)).toEqual(ids.slice(4));
      expect(page4).toMatchObject({ items: [], total: 5 });
    });

    it('ca âm: page quá lớn làm OFFSET vượt số nguyên an toàn ⇒ 400, không chạm DB', async () => {
      await expect(
        service.list(
          system,
          query({ page: Number.MAX_SAFE_INTEGER, pageSize: 100 }),
        ),
      ).rejects.toMatchObject({ status: 400, maLoi: 'DU_LIEU_KHONG_HOP_LE' });
    });
  });

  it('HSB-03 phản hồi đúng bộ trường đã chốt, không có mật khẩu băm hay dữ liệu thừa', async () => {
    const branch = await fx.branch();
    const d = await fx.doctor(branch, { moTaChuyenMon: 'Giới thiệu' });
    const [item] = (await service.list(system, query())).items;
    expect(Object.keys(item ?? {}).sort()).toEqual(
      [
        'taiKhoanId',
        'hoTen',
        'email',
        'trangThaiTaiKhoan',
        'chucDanh',
        'hocVi',
        'soNamKinhNghiem',
        'chuyenKhoa',
        'chiNhanh',
        'dichVuKham',
        'giaMacDinh',
        'phuPhi',
        'giaKham',
      ].sort(),
    );
    const detail = await service.get(system, d.account.taiKhoanId);
    expect(detail).toMatchObject({
      moTaChuyenMon: 'Giới thiệu',
      soDienThoai: expect.any(String),
      chuyenKhoa: { trangThaiHoatDong: 'DangHoatDong' },
    });
    expect(JSON.stringify(detail)).not.toMatch(/matKhau|mat_khau|khoaDangNhap/);
  });
});
