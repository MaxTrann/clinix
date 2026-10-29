import type {
  DeepPartial,
  EntityManager,
  EntityTarget,
  FindOptionsWhere,
  ObjectLiteral,
} from 'typeorm';
import { BacSi } from '../../admin/entities/bac-si.entity.js';
import { CauHinhHeThong } from '../../admin/entities/cau-hinh-he-thong.entity.js';
import { ChiNhanh } from '../../admin/entities/chi-nhanh.entity.js';
import { ChiNhanhDichVuKham } from '../../admin/entities/chi-nhanh-dich-vu-kham.entity.js';
import { ChiNhanhLichHoatDong } from '../../admin/entities/chi-nhanh-lich-hoat-dong.entity.js';
import { ChuyenKhoa } from '../../admin/entities/chuyen-khoa.entity.js';
import { DichVuKham } from '../../admin/entities/dich-vu-kham.entity.js';
import { LeTan } from '../../admin/entities/le-tan.entity.js';
import { NhomDichVu } from '../../admin/entities/nhom-dich-vu.entity.js';
import { QuanTriVien } from '../../admin/entities/quan-tri-vien.entity.js';
import { ThongTinPhongKham } from '../../admin/entities/thong-tin-phong-kham.entity.js';
import { TaiKhoan } from '../../auth/entities/tai-khoan.entity.js';
import { BenhNhan } from '../../auth/entities/benh-nhan.entity.js';
import { ViNoiBo } from '../../auth/entities/vi-noi-bo.entity.js';
import {
  CATALOG_BRANCHES,
  CATALOG_SERVICES,
  CLINIC_DEMO,
  CONFIG_DEMO,
  SPECIALTY_NAMES,
} from './catalog-data.js';
import type { AdminInput } from './seed-config.js';
import type { DevAccount } from './dev-account-data.js';
import { SeedError } from './seed-error.js';

export interface SeedCounts {
  created: number;
  skipped: number;
}
interface AccountRelations {
  branch: string;
  specialty: string;
  service: string;
}
const cleanName = (name: string) => name.trim().replace(/\s+/gu, ' ');

// Chỉ nhận manager của transaction; mọi query của một command đi qua cùng connection.
export class SeedRepository {
  readonly counts: SeedCounts = { created: 0, skipped: 0 };
  constructor(private readonly manager: EntityManager) {}

  private async ensure<T extends ObjectLiteral>(
    target: EntityTarget<T>,
    where: FindOptionsWhere<T>,
    input: DeepPartial<T>,
  ): Promise<T> {
    const repo = this.manager.getRepository(target);
    const found = await repo.findOneBy(where);
    if (found) {
      this.counts.skipped++;
      return found;
    }
    const inserted = await repo.save(repo.create(input));
    this.counts.created++;
    return inserted;
  }

  private async findBranch(where: {
    ten: string;
    diaChi: string;
  }): Promise<ChiNhanh | null> {
    const rows = await this.manager.getRepository(ChiNhanh).findBy({
      ten: where.ten,
      diaChi: where.diaChi,
    });
    if (rows.length > 1) throw new SeedError('SEED_BRANCH_AMBIGUOUS');
    return rows[0] ?? null;
  }

  private async requireWeeklySchedule(id: string): Promise<void> {
    const rows = await this.manager
      .getRepository(ChiNhanhLichHoatDong)
      .findBy({ chiNhanhId: id });
    if (
      rows.length !== 7 ||
      new Set(rows.map((row) => row.thuTrongTuan)).size !== 7 ||
      rows.some((row) => row.thuTrongTuan < 1 || row.thuTrongTuan > 7)
    ) {
      throw new SeedError('SEED_BRANCH_INCOMPLETE');
    }
  }

  async catalog(): Promise<void> {
    for (const name of SPECIALTY_NAMES) {
      await this.ensure(
        ChuyenKhoa,
        { ten: cleanName(name) },
        { ten: cleanName(name) },
      );
    }
    const serviceIds: string[] = [];
    for (const [index, item] of CATALOG_SERVICES.entries()) {
      const group = await this.ensure(
        NhomDichVu,
        { ten: cleanName(item.group) },
        { ten: cleanName(item.group), thuTuHienThi: index },
      );
      const service = await this.ensure(
        DichVuKham,
        { nhomDichVuId: group.nhomDichVuId, ten: cleanName(item.name) },
        {
          nhomDichVuId: group.nhomDichVuId,
          ten: cleanName(item.name),
          thoiLuong: item.duration,
          giaMacDinh: item.price,
          mucDatCoc: '0.00',
        },
      );
      serviceIds.push(service.dichVuKhamId);
    }
    for (const definition of CATALOG_BRANCHES) {
      const existing = await this.findBranch(definition);
      if (existing) {
        // Giữ nguyên lịch/dịch vụ đang áp dụng, không dùng seed để đổi hoạt động chi nhánh.
        await this.requireWeeklySchedule(existing.chiNhanhId);
        for (const serviceId of serviceIds) {
          if (
            !(await this.manager.getRepository(ChiNhanhDichVuKham).existsBy({
              chiNhanhId: existing.chiNhanhId,
              dichVuKhamId: serviceId,
            }))
          ) {
            throw new SeedError('SEED_BRANCH_SERVICE_MISSING');
          }
        }
        this.counts.skipped += 1 + 7 + serviceIds.length;
        continue;
      }
      const branch = await this.ensure<ChiNhanh>(
        ChiNhanh,
        definition,
        definition,
      );
      for (let day = 1; day <= 7; day++) {
        const open = day !== 7;
        await this.ensure(
          ChiNhanhLichHoatDong,
          { chiNhanhId: branch.chiNhanhId, thuTrongTuan: day },
          {
            chiNhanhId: branch.chiNhanhId,
            thuTrongTuan: day,
            hoatDong: open,
            gioBatDauSang: open ? '08:00:00' : null,
            gioKetThucSang: open ? '12:00:00' : null,
            gioBatDauChieu: open ? '13:00:00' : null,
            gioKetThucChieu: open ? '17:00:00' : null,
          },
        );
      }
      for (const id of serviceIds) {
        await this.ensure(
          ChiNhanhDichVuKham,
          { chiNhanhId: branch.chiNhanhId, dichVuKhamId: id },
          { chiNhanhId: branch.chiNhanhId, dichVuKhamId: id },
        );
      }
    }
    await this.ensure(ThongTinPhongKham, { id: 1 }, CLINIC_DEMO);
  }

  async config(): Promise<void> {
    await this.ensure(CauHinhHeThong, { id: 1 }, CONFIG_DEMO);
  }

  async hasSystemAdmin(): Promise<boolean> {
    return this.manager
      .getRepository(QuanTriVien)
      .existsBy({ phamViQuanTri: 'ToanHeThong' });
  }

  async createFirstAdmin(input: AdminInput, hash: string): Promise<void> {
    if (await this.hasSystemAdmin()) throw new SeedError('SEED_ADMIN_EXISTS');
    if (
      await this.manager
        .getRepository(TaiKhoan)
        .existsBy({ email: input.email })
    )
      throw new SeedError('SEED_EMAIL_CONFLICT');
    const account = await this.createAccount(input, 'QuanTriVien', hash);
    await this.ensure(
      QuanTriVien,
      { taiKhoanId: account.taiKhoanId },
      {
        taiKhoanId: account.taiKhoanId,
        phamViQuanTri: 'ToanHeThong',
        chiNhanhId: null,
      },
    );
  }

  private async createAccount(
    input: AdminInput,
    role: TaiKhoan['loaiTaiKhoan'],
    hash: string,
  ): Promise<TaiKhoan> {
    const repo = this.manager.getRepository(TaiKhoan);
    const account = await repo.save(
      repo.create({
        email: input.email,
        hoTen: input.name,
        soDienThoai: input.phone,
        loaiTaiKhoan: role,
        matKhauBam: hash,
        trangThai: 'DangHoatDong',
        daXacMinhEmail: true,
      }),
    );
    this.counts.created++;
    return account;
  }

  async accountRelations(): Promise<AccountRelations> {
    const branch = await this.findBranch(CATALOG_BRANCHES[0]!);
    const specialty = await this.manager
      .getRepository(ChuyenKhoa)
      .findOneBy({ ten: 'Nội tổng quát', trangThaiHoatDong: 'DangHoatDong' });
    const group = await this.manager
      .getRepository(NhomDichVu)
      .findOneBy({ ten: CATALOG_SERVICES[0].group });
    const service =
      group &&
      (await this.manager.getRepository(DichVuKham).findOneBy({
        ten: CATALOG_SERVICES[0].name,
        nhomDichVuId: group.nhomDichVuId,
      }));
    if (!branch || !specialty || !service)
      throw new SeedError('SEED_CATALOG_REQUIRED');
    await this.requireWeeklySchedule(branch.chiNhanhId);
    if (
      !(await this.manager.getRepository(ChiNhanhDichVuKham).existsBy({
        chiNhanhId: branch.chiNhanhId,
        dichVuKhamId: service.dichVuKhamId,
      }))
    )
      throw new SeedError('SEED_BRANCH_SERVICE_MISSING');
    return {
      branch: branch.chiNhanhId,
      specialty: specialty.chuyenKhoaId,
      service: service.dichVuKhamId,
    };
  }

  async devAccount(
    definition: DevAccount,
    hash: string,
    links: AccountRelations,
  ): Promise<void> {
    const existing = await this.manager
      .getRepository(TaiKhoan)
      .findOneBy({ email: definition.email });
    if (existing) {
      if (
        existing.loaiTaiKhoan !== definition.role ||
        existing.trangThai !== 'DangHoatDong' ||
        !existing.daXacMinhEmail ||
        !existing.matKhauBam
      )
        throw new SeedError('SEED_ACCOUNT_CONFLICT');
      await this.requireProfile(existing.taiKhoanId, definition, links);
      this.counts.skipped++;
      return;
    }
    const account = await this.createAccount(definition, definition.role, hash);
    const id = account.taiKhoanId;
    if (definition.role === 'QuanTriVien') {
      await this.ensure(
        QuanTriVien,
        { taiKhoanId: id },
        {
          taiKhoanId: id,
          phamViQuanTri: definition.scope,
          chiNhanhId: definition.scope === 'ChiNhanh' ? links.branch : null,
        },
      );
    } else if (definition.role === 'BacSi') {
      await this.ensure(
        BacSi,
        { taiKhoanId: id },
        {
          taiKhoanId: id,
          chiNhanhId: links.branch,
          chuyenKhoaId: links.specialty,
          dichVuKhamId: links.service,
          chucDanh: 'BS',
          hocVi: 'BS',
          soNamKinhNghiem: 0,
        },
      );
    } else if (definition.role === 'LeTan') {
      await this.ensure(
        LeTan,
        { taiKhoanId: id },
        { taiKhoanId: id, chiNhanhId: links.branch },
      );
    } else {
      await this.ensure(BenhNhan, { taiKhoanId: id }, { taiKhoanId: id });
      await this.ensure(
        ViNoiBo,
        { benhNhanId: id },
        { benhNhanId: id, soDu: '0.00', soTienDangGiu: '0.00' },
      );
    }
  }

  private async requireProfile(
    id: string,
    definition: DevAccount,
    links: AccountRelations,
  ): Promise<void> {
    let valid = false;
    if (definition.role === 'QuanTriVien') {
      const profile = await this.manager
        .getRepository(QuanTriVien)
        .findOneBy({ taiKhoanId: id });
      valid =
        !!profile &&
        profile.phamViQuanTri === definition.scope &&
        profile.chiNhanhId ===
          (definition.scope === 'ChiNhanh' ? links.branch : null);
    } else if (definition.role === 'BacSi') {
      const profile = await this.manager
        .getRepository(BacSi)
        .findOneBy({ taiKhoanId: id });
      valid =
        !!profile &&
        profile.chiNhanhId === links.branch &&
        profile.chuyenKhoaId === links.specialty &&
        profile.dichVuKhamId === links.service;
    } else if (definition.role === 'LeTan') {
      valid = await this.manager
        .getRepository(LeTan)
        .existsBy({ taiKhoanId: id, chiNhanhId: links.branch });
    } else {
      valid =
        (await this.manager
          .getRepository(BenhNhan)
          .existsBy({ taiKhoanId: id })) &&
        (await this.manager
          .getRepository(ViNoiBo)
          .existsBy({ benhNhanId: id }));
    }
    if (!valid) throw new SeedError('SEED_PROFILE_CONFLICT');
  }
}
