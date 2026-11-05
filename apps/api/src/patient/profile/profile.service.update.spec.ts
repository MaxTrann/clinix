import { HttpException, UnauthorizedException } from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import { vi } from 'vitest';
import type {
  ProfileChanges,
  ProfileRepository,
  ProfileRow,
} from './profile.repository.js';
import { ProfileService } from './profile.service.js';

// Task B2 — PUT: thứ tự UPDATE rồi đọc lại trong CÙNG giao dịch, rẽ nhánh 0 hàng, lỗi không bị che (HTTP và MySQL thật: patient-profile-update.e2e-spec.ts,
// profile.service.update.int-spec.ts). Mã ca PUS-nn là [đề xuất] (TRACKING patient B2-G). Kho giả; `tx` là em của giao dịch, `manager` là em ngoài giao dịch.
const tx = { name: 'tx' } as unknown as EntityManager;
const manager = { name: 'manager' } as unknown as EntityManager;
const ACCOUNT = '5';
// Bộ gửi lên, cố ý KHÁC hàng kho trả về để chứng minh phản hồi là bản đọc lại chứ không phản chiếu thân
const SENT: ProfileChanges = {
  hoTen: 'Tên Gửi Lên',
  soDienThoai: '0900000001',
  gioiTinh: 'Khac',
  ngaySinh: '2001-01-01',
  diaChi: 'Địa chỉ gửi lên',
};
const STORED = {
  hoTen: 'Tên Đã Lưu',
  email: 'da.luu@clinix.invalid',
  soDienThoai: '0900000002',
  gioiTinh: 'Nam',
  ngaySinh: '1999-09-09',
  diaChi: 'Địa chỉ đã lưu',
};
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

const row = (overrides: Partial<ProfileRow> = {}) =>
  ({
    loaiTaiKhoan: 'BenhNhan',
    trangThai: 'DangHoatDong',
    ...STORED,
    phamViQuanTri: null,
    chiNhanhId: null,
    chiNhanhTen: null,
    ...overrides,
  }) as ProfileRow;

interface Setup {
  matched?: number;
  found?: ProfileRow | null;
  updateFails?: Error;
  findFails?: Error;
}

function build({ matched = 1, found = row(), ...fails }: Setup = {}) {
  const order: string[] = [];
  const updateProfile = vi.fn(
    (_em: EntityManager, _id: string, _changes: ProfileChanges) => {
      order.push('update');
      return fails.updateFails
        ? Promise.reject(fails.updateFails)
        : Promise.resolve(matched);
    },
  );
  const findProfile = vi.fn((_em: EntityManager, _id: string) => {
    order.push('find');
    return fails.findFails
      ? Promise.reject(fails.findFails)
      : Promise.resolve(found);
  });
  const transaction = vi.fn(
    <T>(work: (em: EntityManager) => Promise<T>): Promise<T> => {
      order.push('begin');
      return work(tx);
    },
  );
  return {
    order,
    updateProfile,
    findProfile,
    transaction,
    service: new ProfileService(
      { manager, transaction } as unknown as DataSource,
      { updateProfile, findProfile } as unknown as ProfileRepository,
    ),
  };
}

describe('ProfileService.updateProfile', () => {
  it('PUS-01 (HS-04) UPDATE rồi đọc lại, cả hai bằng CÙNG em của giao dịch, đúng mã tài khoản và đúng năm giá trị; phản hồi là hồ sơ kho trả, không phải thân gửi lên', async () => {
    const { service, order, updateProfile, findProfile } = build();

    const result = await service.updateProfile(ACCOUNT, SENT);

    expect(order).toEqual(['begin', 'update', 'find']);
    expect(updateProfile.mock.calls).toEqual([[tx, ACCOUNT, SENT]]);
    expect(findProfile.mock.calls).toEqual([[tx, ACCOUNT]]);
    expect(Object.keys(result).sort()).toEqual(KEYS);
    expect(result).toStrictEqual({
      ...STORED,
      anhDaiDien: null,
      vaiTro: 'BenhNhan',
      chiNhanh: null,
      phamViQuanTri: null,
    });
    expect(result.hoTen).not.toBe(SENT.hoTen);
  });

  it('PUS-02 (H9, HS-15) UPDATE khớp 0 hàng ⇒ UnauthorizedException PHIEN_HET_HIEU_LUC, và KHÔNG đọc lại', async () => {
    const { service, findProfile } = build({ matched: 0 });

    const error: unknown = await service
      .updateProfile(ACCOUNT, SENT)
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(UnauthorizedException);
    expect((error as UnauthorizedException).message).toBe('PHIEN_HET_HIEU_LUC');
    expect(findProfile).not.toHaveBeenCalled();
  });

  it('PUS-03 UPDATE khớp 1 hàng (kể cả PUT giống hệt, nơi MySQL báo 0 hàng ĐỔI) ⇒ thành công', async () => {
    const { service } = build({ matched: 1 });

    await expect(service.updateProfile(ACCOUNT, SENT)).resolves.toMatchObject({
      hoTen: STORED.hoTen,
    });
  });

  it.each([
    ['BenhNhan', null, null, null],
    ['BacSi', '7', 'Chi nhánh Bảy', null],
    ['LeTan', '8', 'Chi nhánh Tám', null],
    ['QuanTriVien', null, null, 'ToanHeThong'],
    ['QuanTriVien', '9', 'Chi nhánh Chín', 'ChiNhanh'],
  ] as const)(
    'PUS-04 (HS-05, HS-16) %s: hình dạng 10 khoá như GET, chi nhánh %s, phạm vi %s',
    async (loaiTaiKhoan, chiNhanhId, chiNhanhTen, phamViQuanTri) => {
      const { service } = build({
        found: row({ loaiTaiKhoan, chiNhanhId, chiNhanhTen, phamViQuanTri }),
      });

      const result = await service.updateProfile(ACCOUNT, SENT);

      expect(Object.keys(result).sort()).toEqual(KEYS);
      expect(result.vaiTro).toBe(loaiTaiKhoan);
      expect(result.phamViQuanTri).toBe(phamViQuanTri);
      expect(result.chiNhanh).toEqual(
        chiNhanhId === null ? null : { chiNhanhId, ten: chiNhanhTen },
      );
    },
  );

  it('PUS-05 (BM-02) lỗi DB ở UPDATE và ở đọc lại đi NGUYÊN, không bị che thành 401', async () => {
    for (const setup of [
      { updateFails: new Error('mất kết nối khi ghi') },
      { findFails: new Error('mất kết nối khi đọc lại') },
    ]) {
      const { service } = build(setup);

      const error: unknown = await service
        .updateProfile(ACCOUNT, SENT)
        .catch((reason: unknown) => reason);

      expect(error).toBe(setup.updateFails ?? setup.findFails);
      expect(error).not.toBeInstanceOf(UnauthorizedException);
    }
  });

  it.each(['BacSi', 'LeTan', 'QuanTriVien'] as const)(
    'PUS-06 (BM-02) %s thiếu hàng bảng vai trò sau khi ghi ⇒ Error thường (không phải HttpException) để giao dịch hoàn tác; thông điệp có mã tài khoản, không dữ liệu cá nhân',
    async (loaiTaiKhoan) => {
      const { service } = build({ found: row({ loaiTaiKhoan }) });

      const error: unknown = await service
        .updateProfile(ACCOUNT, SENT)
        .catch((reason: unknown) => reason);

      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(HttpException);
      const message = (error as Error).message;
      expect(message).toContain(ACCOUNT);
      for (const secret of [
        STORED.hoTen,
        STORED.email,
        STORED.soDienThoai,
        STORED.diaChi,
        SENT.hoTen,
      ]) {
        expect(message).not.toContain(secret);
      }
    },
  );

  it.each([
    ['hàng mất', null],
    ['NgungHoatDong', row({ trangThai: 'NgungHoatDong' })],
    ['ChoKichHoat', row({ trangThai: 'ChoKichHoat' })],
  ] as const)(
    'PUS-07 (phòng thủ) đọc lại thấy %s ⇒ 401 PHIEN_HET_HIEU_LUC',
    async (_label, found) => {
      const { service } = build({ found });

      await expect(service.updateProfile(ACCOUNT, SENT)).rejects.toMatchObject({
        message: 'PHIEN_HET_HIEU_LUC',
      });
    },
  );

  it('PUS-08 cả hai câu chạy trong MỘT dataSource.transaction; không câu nào dùng em ngoài giao dịch (dataSource.manager)', async () => {
    const { service, transaction, updateProfile, findProfile } = build();

    await service.updateProfile(ACCOUNT, SENT);

    expect(transaction).toHaveBeenCalledOnce();
    for (const call of [
      ...updateProfile.mock.calls,
      ...findProfile.mock.calls,
    ]) {
      expect(call[0]).toBe(tx);
      expect(call[0]).not.toBe(manager);
    }
  });

  it('PUS-09 (QP-05, H2) mã tài khoản chỉ là tham số của hàm: trường thừa trong thân (taiKhoanId, email) không đổi nơi ghi', async () => {
    const { service, updateProfile, findProfile } = build();
    const sneaky = {
      ...SENT,
      taiKhoanId: '999',
      email: 'khac@clinix.invalid',
    } as ProfileChanges;

    await service.updateProfile(ACCOUNT, sneaky);

    expect(updateProfile.mock.calls[0]?.[1]).toBe(ACCOUNT);
    expect(findProfile.mock.calls[0]?.[1]).toBe(ACCOUNT);
  });
});
