import { randomUUID } from 'node:crypto';
import type { DataSource, EntityManager } from 'typeorm';
import { TaiKhoan } from '../../auth/entities/tai-khoan.entity.js';
import {
  insertBenhNhan,
  insertTaiKhoan,
  insertViNoiBo,
} from '../../auth/entities/testing/auth-fixtures.js';
import { assertTestDatabaseName } from '../../database/testing/test-database.js';
import { BacSi } from '../entities/bac-si.entity.js';
import { ChiNhanh } from '../entities/chi-nhanh.entity.js';
import { ChiNhanhDichVuKham } from '../entities/chi-nhanh-dich-vu-kham.entity.js';
import { ChiNhanhLichHoatDong } from '../entities/chi-nhanh-lich-hoat-dong.entity.js';
import { ChuyenKhoa } from '../entities/chuyen-khoa.entity.js';
import { DichVuKham } from '../entities/dich-vu-kham.entity.js';
import { KhungGio } from '../entities/khung-gio.entity.js';
import { LeTan } from '../entities/le-tan.entity.js';
import { LichHen } from '../entities/lich-hen.entity.js';
import { LichLamViec } from '../entities/lich-lam-viec.entity.js';
import { NhomDichVu } from '../entities/nhom-dich-vu.entity.js';
import { QuanTriVien } from '../entities/quan-tri-vien.entity.js';

const uniqueName = (label: string) => `${label} ${randomUUID()}`;
// Mốc và tiền chỉ minh họa cho fixture, không phải cấu hình nghiệp vụ.
export const FIXTURE_APPOINTMENT_TIME = '2026-11-02T08:00:00+07:00';

/** Ghi thật vào DB test. Dùng factory mới với manager của giao dịch nếu cần rollback cả đồ thị. */
export class AdminFixtures {
  constructor(private readonly db: DataSource | EntityManager) {
    const source = 'options' in db ? db : db.connection;
    assertTestDatabaseName(String(source.options.database));
  }

  async branch(overrides: Partial<ChiNhanh> = {}) {
    const repo = this.db.getRepository(ChiNhanh);
    return repo.save(
      repo.create({
        ten: uniqueName('Chi nhánh mẫu'),
        diaChi: 'Địa chỉ minh họa',
        ...overrides,
      }),
    );
  }

  async weeklySchedule(
    branchId: string,
    overrides: Partial<ChiNhanhLichHoatDong> = {},
  ) {
    const repo = this.db.getRepository(ChiNhanhLichHoatDong);
    return repo.save(
      Array.from({ length: 7 }, (_, index) =>
        repo.create({
          hoatDong: true,
          gioBatDauSang: '08:00:00',
          gioKetThucSang: '12:00:00',
          gioBatDauChieu: '13:00:00',
          gioKetThucChieu: '17:00:00',
          ...overrides,
          // Bảy thứ luôn riêng biệt; muốn sửa riêng một ngày thì sửa hàng tương ứng.
          thuTrongTuan: index + 1,
          chiNhanhId: branchId,
        }),
      ),
    );
  }

  async catalog() {
    const specialties = this.db.getRepository(ChuyenKhoa);
    const specialty = await specialties.save(
      specialties.create({ ten: uniqueName('Chuyên khoa mẫu') }),
    );
    const groups = this.db.getRepository(NhomDichVu);
    const group = await groups.save(
      groups.create({ ten: uniqueName('Nhóm mẫu') }),
    );
    const services = this.db.getRepository(DichVuKham);
    const service = await services.save(
      services.create({
        nhomDichVuId: group.nhomDichVuId,
        ten: uniqueName('Dịch vụ mẫu'),
        thoiLuong: 30,
        giaMacDinh: '100000.00',
      }),
    );
    return { specialty, group, service };
  }

  async patient(overrides: Partial<TaiKhoan> = {}) {
    const account = await insertTaiKhoan(this.db, {
      daXacMinhEmail: true,
      ...overrides,
      loaiTaiKhoan: 'BenhNhan',
    });
    const profile = await insertBenhNhan(this.db, account.taiKhoanId);
    const wallet = await insertViNoiBo(this.db, profile.taiKhoanId);
    return { account, profile, wallet };
  }

  async doctor(
    branch: ChiNhanh,
    overrides: Partial<BacSi> = {},
    accountOverrides: Partial<TaiKhoan> = {},
  ) {
    const { specialty, service } = await this.catalog();
    const account = await insertTaiKhoan(this.db, {
      daXacMinhEmail: true,
      ...accountOverrides,
      loaiTaiKhoan: 'BacSi',
    });
    const links = this.db.getRepository(ChiNhanhDichVuKham);
    await links.save(
      links.create({
        chiNhanhId: branch.chiNhanhId,
        dichVuKhamId: service.dichVuKhamId,
      }),
    );
    const repo = this.db.getRepository(BacSi);
    const profile = await repo.save(
      repo.create({
        taiKhoanId: account.taiKhoanId,
        chiNhanhId: branch.chiNhanhId,
        chuyenKhoaId: specialty.chuyenKhoaId,
        dichVuKhamId: service.dichVuKhamId,
        hocVi: 'BS',
        chucDanh: 'BS',
        ...overrides,
      }),
    );
    return { account, profile };
  }

  async receptionist(branch: ChiNhanh, overrides: Partial<TaiKhoan> = {}) {
    const account = await insertTaiKhoan(this.db, {
      daXacMinhEmail: true,
      ...overrides,
      loaiTaiKhoan: 'LeTan',
    });
    const repo = this.db.getRepository(LeTan);
    const profile = await repo.save(
      repo.create({
        taiKhoanId: account.taiKhoanId,
        chiNhanhId: branch.chiNhanhId,
      }),
    );
    return { account, profile };
  }

  /** Không truyền branch = Toàn hệ thống; truyền branch = Chi nhánh. */
  async admin(branch?: ChiNhanh, overrides: Partial<TaiKhoan> = {}) {
    const account = await insertTaiKhoan(this.db, {
      daXacMinhEmail: true,
      ...overrides,
      loaiTaiKhoan: 'QuanTriVien',
    });
    const repo = this.db.getRepository(QuanTriVien);
    const profile = await repo.save(
      repo.create({
        taiKhoanId: account.taiKhoanId,
        phamViQuanTri: branch ? 'ChiNhanh' : 'ToanHeThong',
        chiNhanhId: branch?.chiNhanhId ?? null,
      }),
    );
    return { account, profile };
  }

  async shift(doctor: BacSi, overrides: Partial<LichLamViec> = {}) {
    const repo = this.db.getRepository(LichLamViec);
    return repo.save(
      repo.create({
        bacSiId: doctor.taiKhoanId,
        chiNhanhId: doctor.chiNhanhId,
        ngay: '2026-11-02',
        ca: 'CaSang',
        ...overrides,
      }),
    );
  }

  async slot(shift: LichLamViec, overrides: Partial<KhungGio> = {}) {
    const repo = this.db.getRepository(KhungGio);
    return repo.save(
      repo.create({
        lichLamViecId: shift.lichLamViecId,
        ngayGio: new Date(`${shift.ngay}T08:00:00+07:00`),
        ...overrides,
      }),
    );
  }

  async appointment(
    doctor: BacSi,
    slot: KhungGio,
    patientId: string,
    overrides: Partial<LichHen> = {},
  ) {
    const repo = this.db.getRepository(LichHen);
    return repo.save(
      repo.create({
        maLichHen: randomUUID().replaceAll('-', '').slice(0, 20),
        khungGioId: slot.khungGioId,
        benhNhanId: patientId,
        bacSiId: doctor.taiKhoanId,
        chiNhanhId: doctor.chiNhanhId,
        dichVuKhamId: doctor.dichVuKhamId,
        thoiGian: slot.ngayGio,
        giaSnapshot: '100000.00',
        trangThai: 'DaXacNhan',
        ...overrides,
      }),
    );
  }
}
