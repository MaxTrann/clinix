import type { EntityManager } from 'typeorm';
import { BacSi } from '../../admin/entities/bac-si.entity.js';
import { ChiNhanh } from '../../admin/entities/chi-nhanh.entity.js';
import { ChiNhanhDichVuKham } from '../../admin/entities/chi-nhanh-dich-vu-kham.entity.js';
import { ChiNhanhLichHoatDong } from '../../admin/entities/chi-nhanh-lich-hoat-dong.entity.js';
import { ChuyenKhoa } from '../../admin/entities/chuyen-khoa.entity.js';
import { DichVuKham } from '../../admin/entities/dich-vu-kham.entity.js';
import { TaiKhoan } from '../../auth/entities/tai-khoan.entity.js';
import {
  BRANCH_COORDINATES,
  DEMO_DOCTORS,
  INACTIVE_SPECIALTY,
  SCHEDULE_CHANGES,
  SPECIALTY_DESCRIPTIONS,
  type DemoDoctor,
} from './search-demo-data.js';
import { SeedError } from './seed-error.js';
import type { SeedCounts } from './seed.repository.js';

// Seed demo cho tra cứu. Chạy trong một giao dịch của seedTransaction; mọi bước idempotent:
// có rồi thì bỏ qua, không ghi đè dữ liệu đã chỉnh tay.
export class SearchDemoRepository {
  readonly counts: SeedCounts = { created: 0, skipped: 0 };
  constructor(private readonly manager: EntityManager) {}

  async run(hash: string): Promise<void> {
    const branches = await this.requireBranches();
    await this.coordinates(branches);
    await this.schedules(branches);
    await this.specialties();
    for (const doctor of DEMO_DOCTORS)
      await this.doctor(doctor, hash, branches);
  }

  // Thiếu catalog thì dừng, không tự tạo chi nhánh/chuyên khoa.
  private async requireBranches(): Promise<Map<string, ChiNhanh>> {
    const map = new Map<string, ChiNhanh>();
    for (const { branch } of BRANCH_COORDINATES) {
      const rows = await this.manager
        .getRepository(ChiNhanh)
        .findBy({ ten: branch.ten, diaChi: branch.diaChi });
      if (rows.length > 1) throw new SeedError('SEED_BRANCH_AMBIGUOUS');
      if (!rows[0]) throw new SeedError('SEED_CATALOG_REQUIRED');
      map.set(branch.ten, rows[0]);
    }
    return map;
  }

  private async coordinates(branches: Map<string, ChiNhanh>): Promise<void> {
    for (const item of BRANCH_COORDINATES) {
      const row = branches.get(item.branch.ten)!;
      if (row.toaDoLat !== null || row.toaDoLng !== null) {
        this.counts.skipped++;
        continue;
      }
      await this.manager
        .getRepository(ChiNhanh)
        .update(row.chiNhanhId, { toaDoLat: item.lat, toaDoLng: item.lng });
      this.counts.created++;
    }
  }

  private async schedules(branches: Map<string, ChiNhanh>): Promise<void> {
    const repo = this.manager.getRepository(ChiNhanhLichHoatDong);
    for (const change of SCHEDULE_CHANGES) {
      const branch = branches.get(change.branch.ten)!;
      const row = await repo.findOneBy({
        chiNhanhId: branch.chiNhanhId,
        thuTrongTuan: change.weekday,
      });
      if (!row) throw new SeedError('SEED_BRANCH_INCOMPLETE');
      // Dòng gốc: CN nghỉ cả ngày; T2–T7 đủ hai khoảng 08–12 và 13–17.
      const isDefault =
        change.weekday === 7
          ? !row.hoatDong &&
            row.gioBatDauSang === null &&
            row.gioKetThucSang === null &&
            row.gioBatDauChieu === null &&
            row.gioKetThucChieu === null
          : row.hoatDong &&
            row.gioBatDauSang === '08:00:00' &&
            row.gioKetThucSang === '12:00:00' &&
            row.gioBatDauChieu === '13:00:00' &&
            row.gioKetThucChieu === '17:00:00';
      if (!isDefault) {
        this.counts.skipped++;
        continue;
      }
      await repo.update(
        { chiNhanhId: branch.chiNhanhId, thuTrongTuan: change.weekday },
        {
          hoatDong: change.open,
          gioBatDauSang: change.open ? '08:00:00' : null,
          gioKetThucSang: change.open ? '12:00:00' : null,
          gioBatDauChieu: null,
          gioKetThucChieu: null,
        },
      );
      this.counts.created++;
    }
  }

  private async specialties(): Promise<void> {
    const repo = this.manager.getRepository(ChuyenKhoa);
    for (const [ten, moTa] of Object.entries(SPECIALTY_DESCRIPTIONS)) {
      const row = await repo.findOneBy({ ten });
      if (!row) throw new SeedError('SEED_CATALOG_REQUIRED');
      if (row.moTa !== null) {
        this.counts.skipped++;
        continue;
      }
      await repo.update(row.chuyenKhoaId, { moTa });
      this.counts.created++;
    }
    if (await repo.existsBy({ ten: INACTIVE_SPECIALTY.ten })) {
      this.counts.skipped++;
      return;
    }
    await repo.save(
      repo.create({
        ten: INACTIVE_SPECIALTY.ten,
        moTa: INACTIVE_SPECIALTY.moTa,
        trangThaiHoatDong: 'NgungHoatDong',
      }),
    );
    this.counts.created++;
  }

  private async doctor(
    def: DemoDoctor,
    hash: string,
    branches: Map<string, ChiNhanh>,
  ): Promise<void> {
    const accounts = this.manager.getRepository(TaiKhoan);
    const existing = await accounts.findOneBy({ email: def.email });
    if (existing) {
      if (
        existing.loaiTaiKhoan !== 'BacSi' ||
        !(await this.manager
          .getRepository(BacSi)
          .existsBy({ taiKhoanId: existing.taiKhoanId }))
      )
        throw new SeedError('SEED_ACCOUNT_CONFLICT');
      // Đếm đối xứng với lúc tạo (tài khoản + hồ sơ bác sĩ = 2 dòng).
      this.counts.skipped += 2;
      return;
    }
    const specialty = await this.manager
      .getRepository(ChuyenKhoa)
      .findOneBy({ ten: def.specialty });
    const service = await this.manager
      .getRepository(DichVuKham)
      .findOneBy({ ten: def.service });
    const branch = branches.get(def.branch.ten)!;
    if (!specialty || !service) throw new SeedError('SEED_CATALOG_REQUIRED');
    if (
      !(await this.manager.getRepository(ChiNhanhDichVuKham).existsBy({
        chiNhanhId: branch.chiNhanhId,
        dichVuKhamId: service.dichVuKhamId,
      }))
    )
      throw new SeedError('SEED_BRANCH_SERVICE_MISSING');
    const account = await accounts.save(
      accounts.create({
        email: def.email,
        hoTen: def.name,
        soDienThoai: def.phone,
        loaiTaiKhoan: 'BacSi',
        // ChoKichHoat: chưa có mật khẩu (chk_tai_khoan_mat_khau).
        matKhauBam: def.active ? hash : null,
        trangThai: def.active ? 'DangHoatDong' : 'ChoKichHoat',
        daXacMinhEmail: def.active,
      }),
    );
    const bacSi = this.manager.getRepository(BacSi);
    await bacSi.save(
      bacSi.create({
        taiKhoanId: account.taiKhoanId,
        chiNhanhId: branch.chiNhanhId,
        chuyenKhoaId: specialty.chuyenKhoaId,
        dichVuKhamId: service.dichVuKhamId,
        chucDanh: def.title,
        hocVi: def.degree,
        soNamKinhNghiem: def.years,
        moTaChuyenMon: def.bio,
      }),
    );
    this.counts.created += 2;
  }
}
