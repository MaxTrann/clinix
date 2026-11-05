import { HttpException, UnauthorizedException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { BacSi } from '../../admin/entities/bac-si.entity.js';
import { ChiNhanh } from '../../admin/entities/chi-nhanh.entity.js';
import { LeTan } from '../../admin/entities/le-tan.entity.js';
import { AdminFixtures } from '../../admin/testing/admin-fixtures.js';
import { TaiKhoan } from '../../auth/entities/tai-khoan.entity.js';
import { insertTaiKhoan } from '../../auth/entities/testing/auth-fixtures.js';
import { MeService } from '../../auth/me/me.service.js';
import { TaiKhoanRepository } from '../../auth/repositories/tai-khoan.repository.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { ProfileRepository } from './profile.repository.js';
import { ProfileService } from './profile.service.js';

// Task B1 — đọc hồ sơ trên MySQL 8.4 THẬT: kiểu dữ liệu (ngày dạng chuỗi, bigint dạng chuỗi), chi nhánh đúng bảng vai trò, các nhánh
// "guard đã qua nhưng hàng đổi giữa chừng" (HTTP không chạm tới được vì guard chặn trước). Mã ca PFI-nn là [đề xuất] (TRACKING patient B1-G).
const SESSION_LOST = 'PHIEN_HET_HIEU_LUC';
const KEYS = [
  'anhDaiDien',
  'chiNhanh',
  'diaChi',
  'email',
  'gioiTinh',
  'hoTen',
  'ngaySinh',
  'phamViQuanTri',
  'soDienThoai',
  'vaiTro',
];
// Dữ liệu cá nhân giả (đuôi .invalid), không phải người thật
const PERSONAL = {
  hoTen: 'Phạm Thị Thử Nghiệm',
  soDienThoai: '0987654321',
  gioiTinh: 'Nu',
  ngaySinh: '1990-05-15',
  diaChi: '34 Đường Thử Nghiệm, Phường Giả',
  anhDaiDien: 'https://anh.clinix.invalid/a.png',
};

const profiles = new ProfileRepository();
let db: DataSource;
let fx: AdminFixtures;
let service: ProfileService;

useIntegrationHooks((testDb) => {
  db = testDb;
  fx = new AdminFixtures(testDb);
  service = new ProfileService(testDb, profiles);
});

// Lỗi mà dịch vụ ném ra (null nếu thành công)
const failureOf = (accountId: string) =>
  service.getProfile(accountId).then(
    () => null,
    (reason: unknown) => reason,
  );

async function sessionLost(accountId: string) {
  const error = await failureOf(accountId);
  expect(error).toBeInstanceOf(UnauthorizedException);
  expect((error as UnauthorizedException).message).toBe(SESSION_LOST);
  expect((error as UnauthorizedException).getStatus()).toBe(401);
}

async function internalError(accountId: string, forbidden: string) {
  const error = await failureOf(accountId);
  expect(error).toBeInstanceOf(Error);
  expect(error).not.toBeInstanceOf(HttpException);
  expect((error as Error).message).toContain(accountId);
  expect((error as Error).message).not.toContain(forbidden);
}

describe('ProfileService trên MySQL thật', () => {
  it('PFI-01 (HS-01, kiểu dữ liệu) Bệnh nhân đầy đủ: đúng 10 khoá, ngày sinh là CHUỖI, anhDaiDien null dù cột có ảnh', async () => {
    const { account } = await fx.patient(PERSONAL);

    const profile = await service.getProfile(account.taiKhoanId);

    expect(Object.keys(profile).sort()).toEqual(KEYS);
    expect(profile).toStrictEqual({
      hoTen: PERSONAL.hoTen,
      email: account.email,
      soDienThoai: PERSONAL.soDienThoai,
      gioiTinh: 'Nu',
      ngaySinh: '1990-05-15',
      diaChi: PERSONAL.diaChi,
      anhDaiDien: null,
      vaiTro: 'BenhNhan',
      chiNhanh: null,
      phamViQuanTri: null,
    });
    expect(typeof profile.ngaySinh).toBe('string');
  });

  it.each(['1900-01-01', '2000-01-01', '2024-02-29', '1999-12-31'])(
    'PFI-02 ngày sinh biên %s ra đúng chuỗi YYYY-MM-DD (không lệch múi giờ)',
    async (ngaySinh) => {
      const { account } = await fx.patient({ ngaySinh });

      const profile = await service.getProfile(account.taiKhoanId);

      expect(profile.ngaySinh).toBe(ngaySinh);
    },
  );

  it('PFI-03 giới tính, ngày sinh, địa chỉ NULL ra null', async () => {
    const { account } = await fx.patient({
      gioiTinh: null,
      ngaySinh: null,
      diaChi: null,
    });

    const profile = await service.getProfile(account.taiKhoanId);

    expect([profile.gioiTinh, profile.ngaySinh, profile.diaChi]).toEqual([
      null,
      null,
      null,
    ]);
  });

  it('PFI-04 (HS-02) Lễ tân: chiNhanh đúng le_tan.chi_nhanh_id khi có hai chi nhánh', async () => {
    await fx.branch({ ten: 'Chi nhánh khác' });
    const branch = await fx.branch({ ten: 'Chi nhánh của Lễ tân' });
    const { account } = await fx.receptionist(branch);

    const profile = await service.getProfile(account.taiKhoanId);

    expect(profile.vaiTro).toBe('LeTan');
    expect(profile.chiNhanh).toStrictEqual({
      chiNhanhId: branch.chiNhanhId,
      ten: 'Chi nhánh của Lễ tân',
    });
    expect(profile.phamViQuanTri).toBeNull();
  });

  it('PFI-05 (HS-16 GET) Bác sĩ: chiNhanh đúng bac_si.chi_nhanh_id, phamViQuanTri null', async () => {
    await fx.branch({ ten: 'Chi nhánh khác' });
    const branch = await fx.branch({ ten: 'Chi nhánh của Bác sĩ' });
    const { account } = await fx.doctor(branch);

    const profile = await service.getProfile(account.taiKhoanId);

    expect(profile.vaiTro).toBe('BacSi');
    expect(profile.chiNhanh).toStrictEqual({
      chiNhanhId: branch.chiNhanhId,
      ten: 'Chi nhánh của Bác sĩ',
    });
    expect(profile.phamViQuanTri).toBeNull();
  });

  it('PFI-06 (HS-03) Quản trị viên Toàn hệ thống: phamViQuanTri ToanHeThong, chiNhanh null', async () => {
    await fx.branch();
    const { account } = await fx.admin();

    const profile = await service.getProfile(account.taiKhoanId);

    expect(profile.vaiTro).toBe('QuanTriVien');
    expect(profile.phamViQuanTri).toBe('ToanHeThong');
    expect(profile.chiNhanh).toBeNull();
  });

  it('PFI-07 (HS-03) Quản trị viên Chi nhánh: phamViQuanTri ChiNhanh, chiNhanh đúng quan_tri_vien.chi_nhanh_id', async () => {
    await fx.branch({ ten: 'Chi nhánh khác' });
    const branch = await fx.branch({ ten: 'Chi nhánh của Quản trị' });
    const { account } = await fx.admin(branch);

    const profile = await service.getProfile(account.taiKhoanId);

    expect(profile.phamViQuanTri).toBe('ChiNhanh');
    expect(profile.chiNhanh).toStrictEqual({
      chiNhanhId: branch.chiNhanhId,
      ten: 'Chi nhánh của Quản trị',
    });
  });

  it('PFI-08 chiNhanhId là chuỗi và giữ nguyên với id lớn hơn 2^53 (không ép Number)', async () => {
    // Chèn bằng SQL: TypeORM đọc insertId thành Number nên fixture làm tròn id lớn hơn 2^53
    await db.query(
      'INSERT INTO chi_nhanh (chi_nhanh_id, ten, dia_chi) VALUES (?, ?, ?)',
      ['9007199254740993', 'Chi nhánh id lớn', 'Địa chỉ giả'],
    );
    const branch = await db
      .getRepository(ChiNhanh)
      .findOneByOrFail({ chiNhanhId: '9007199254740993' });
    const { account } = await fx.receptionist(branch);

    const profile = await service.getProfile(account.taiKhoanId);

    expect(profile.chiNhanh?.chiNhanhId).toBe('9007199254740993');
  });

  it('PFI-09 hàng thừa ở bảng vai trò khác bị bỏ qua: Lễ tân có thêm hàng bac_si, Bệnh nhân có hàng le_tan', async () => {
    const own = await fx.branch({ ten: 'Chi nhánh đúng' });
    const stray = await fx.branch({ ten: 'Chi nhánh thừa' });
    const receptionist = await fx.receptionist(own);
    const { specialty, service: examination } = await fx.catalog();
    await db.getRepository(BacSi).save({
      taiKhoanId: receptionist.account.taiKhoanId,
      chiNhanhId: stray.chiNhanhId,
      chuyenKhoaId: specialty.chuyenKhoaId,
      dichVuKhamId: examination.dichVuKhamId,
      hocVi: 'BS',
      chucDanh: 'BS',
    });
    const patient = await fx.patient();
    await db.getRepository(LeTan).save({
      taiKhoanId: patient.account.taiKhoanId,
      chiNhanhId: stray.chiNhanhId,
    });

    const viaReceptionist = await service.getProfile(
      receptionist.account.taiKhoanId,
    );
    const viaPatient = await service.getProfile(patient.account.taiKhoanId);

    expect(viaReceptionist.chiNhanh?.ten).toBe('Chi nhánh đúng');
    expect(viaPatient.chiNhanh).toBeNull();
  });

  it('PFI-10 (QP-07, H9) hàng bị xoá sau khi guard đã qua ⇒ 401 PHIEN_HET_HIEU_LUC, không 500', async () => {
    const account = await insertTaiKhoan(db);
    await db.getRepository(TaiKhoan).delete(account.taiKhoanId);

    await sessionLost(account.taiKhoanId);
  });

  it('PFI-10 (QP-07, H9) tài khoản NgungHoatDong ⇒ 401 PHIEN_HET_HIEU_LUC', async () => {
    const account = await insertTaiKhoan(db, { trangThai: 'NgungHoatDong' });

    await sessionLost(account.taiKhoanId);
  });

  it('PFI-10 (QP-07, H9) tài khoản ChoKichHoat (mật khẩu NULL) ⇒ 401 PHIEN_HET_HIEU_LUC', async () => {
    const account = await insertTaiKhoan(db, {
      trangThai: 'ChoKichHoat',
      matKhauBam: null,
      loaiTaiKhoan: 'LeTan', // CHECK cấm Bệnh nhân ở ChoKichHoat
    });

    await sessionLost(account.taiKhoanId);
  });

  it.each(['BacSi', 'LeTan', 'QuanTriVien'] as const)(
    'PFI-11 (BM-02) %s thiếu hàng bảng vai trò ⇒ lỗi nội bộ (không phải HttpException), thông điệp có mã tài khoản',
    async (loaiTaiKhoan) => {
      const account = await insertTaiKhoan(db, {
        loaiTaiKhoan,
        hoTen: 'Tên Không Được Lộ',
      });

      await internalError(account.taiKhoanId, 'Tên Không Được Lộ');
    },
  );

  it('PFI-12 (DN-23 kiểu ME-01) findProfile trả ĐÚNG các cột của danh sách trắng, không băm, không khoá đăng nhập, không mã tài khoản, không ảnh', async () => {
    const { account } = await fx.patient(PERSONAL);

    const found = await profiles.findProfile(db.manager, account.taiKhoanId);

    expect(Object.keys(found ?? {}).sort()).toEqual([
      'chiNhanhId',
      'chiNhanhTen',
      'diaChi',
      'email',
      'gioiTinh',
      'hoTen',
      'loaiTaiKhoan',
      'ngaySinh',
      'phamViQuanTri',
      'soDienThoai',
      'trangThai',
    ]);
    expect(typeof found?.ngaySinh).toBe('string');
    await expect(
      profiles.findProfile(db.manager, '999999'),
    ).resolves.toBeNull();
  });

  it('PFI-13 (HS-04 phần đọc, L4) đổi họ tên trong DB: GET hồ sơ và /auth/me cùng thấy tên mới (một nguồn)', async () => {
    const { account } = await fx.patient({ hoTen: 'Tên Cũ' });
    const me = new MeService(db, new TaiKhoanRepository());
    expect((await service.getProfile(account.taiKhoanId)).hoTen).toBe('Tên Cũ');

    await db
      .getRepository(TaiKhoan)
      .update(account.taiKhoanId, { hoTen: 'Tên Mới' });

    expect((await service.getProfile(account.taiKhoanId)).hoTen).toBe(
      'Tên Mới',
    );
    expect((await me.getProfile(account.taiKhoanId)).hoTen).toBe('Tên Mới');
  });

  it('PFI-14 chỉ đọc: gọi 20 lần, mọi cột của các bảng liên quan giữ nguyên', async () => {
    const branch = await fx.branch();
    const doctor = await fx.doctor(branch);
    const patient = await fx.patient();
    const tables = [
      'tai_khoan',
      'benh_nhan',
      'bac_si',
      'le_tan',
      'quan_tri_vien',
      'chi_nhanh',
    ];
    const snapshot = () =>
      Promise.all(
        tables.map((table) => db.query(`SELECT * FROM ${table} ORDER BY 1`)),
      );
    const before = await snapshot();

    for (let i = 0; i < 10; i += 1) {
      await service.getProfile(doctor.account.taiKhoanId);
      await service.getProfile(patient.account.taiKhoanId);
    }

    expect(await snapshot()).toEqual(before);
  });
});
