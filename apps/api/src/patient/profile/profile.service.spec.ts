import { HttpException, UnauthorizedException } from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import { vi } from 'vitest';
import { AUTH_ERROR_CODES } from '../../auth/auth.constants.js';
import type { ProfileRepository, ProfileRow } from './profile.repository.js';
import { ProfileService } from './profile.service.js';

// Task B1 — rẽ nhánh theo vai trò, 401 và dữ liệu lệch chỉ phủ được ở đây (HTTP và MySQL thật: patient-profile.e2e-spec.ts, profile.service.int-spec.ts).
// Mã ca PFS-nn là [đề xuất] (TRACKING patient B1-G).
const manager = {} as EntityManager;
// Dữ liệu cá nhân giả; hàng "giàu" hơn thực tế (thêm băm, mã tài khoản, ảnh) để cái nào lọt ra thì test đỏ
const PERSONAL = {
  hoTen: 'Lê Thị Thử Nghiệm',
  email: 'thu.nghiem@clinix.invalid',
  soDienThoai: '0912345678',
  ngaySinh: '1987-06-15',
  diaChi: '12 Đường Thử Nghiệm, Phường Giả',
};
const baseRow = {
  loaiTaiKhoan: 'BenhNhan',
  trangThai: 'DangHoatDong',
  ...PERSONAL,
  gioiTinh: 'Nu',
  phamViQuanTri: null,
  chiNhanhId: null,
  chiNhanhTen: null,
  // Cột không có trong ProfileRow: nếu service trải nguyên hàng thì các khoá này sẽ lọt ra
  matKhauBam: '$argon2id$gia',
  taiKhoanId: '5',
  anhDaiDien: 'https://anh.clinix.invalid/a.png',
} satisfies Record<string, unknown>;
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
  ({ ...baseRow, ...overrides }) as unknown as ProfileRow;

function build(found: ProfileRow | null = row()) {
  const findProfile = vi.fn((_em: EntityManager, _id: string) =>
    Promise.resolve(found),
  );
  return {
    findProfile,
    service: new ProfileService(
      { manager } as DataSource,
      { findProfile } as unknown as ProfileRepository,
    ),
  };
}

async function failureOf(work: Promise<unknown>): Promise<unknown> {
  return work.then(
    () => null,
    (reason: unknown) => reason,
  );
}

async function expectSessionInactive(work: Promise<unknown>) {
  const error = await failureOf(work);
  expect(error).toBeInstanceOf(UnauthorizedException);
  expect((error as UnauthorizedException).message).toBe(
    AUTH_ERROR_CODES.SESSION_INACTIVE,
  );
}

// Lỗi dữ liệu lệch phải là Error thường (bộ lọc ⇒ 500 LOI_HE_THONG) và không mang dữ liệu cá nhân
async function expectInconsistent(work: Promise<unknown>) {
  const error = await failureOf(work);
  expect(error).toBeInstanceOf(Error);
  expect(error).not.toBeInstanceOf(HttpException);
  const message = (error as Error).message;
  expect(message).toContain('5');
  for (const secret of Object.values(PERSONAL)) {
    expect(message).not.toContain(secret);
  }
  expect(message).not.toContain('argon2');
}

describe('ProfileService', () => {
  it('PFS-01 (HS-01) Bệnh nhân: đúng tập 10 khoá, chiNhanh và phamViQuanTri là null, không khoá thừa của hàng', async () => {
    const { service, findProfile } = build();

    const profile = await service.getProfile('5');

    expect(Object.keys(profile).sort()).toEqual(KEYS);
    expect(profile).toStrictEqual({
      ...PERSONAL,
      gioiTinh: 'Nu',
      anhDaiDien: null,
      vaiTro: 'BenhNhan',
      chiNhanh: null,
      phamViQuanTri: null,
    });
    expect(findProfile.mock.calls).toEqual([[manager, '5']]);
  });

  it('PFS-02 (HS-16 GET) Bác sĩ: chiNhanh {chiNhanhId, ten}, phamViQuanTri null', async () => {
    const { service } = build(
      row({ loaiTaiKhoan: 'BacSi', chiNhanhId: '7', chiNhanhTen: 'CS Quận 1' }),
    );

    const profile = await service.getProfile('5');

    expect(Object.keys(profile).sort()).toEqual(KEYS);
    expect(profile.vaiTro).toBe('BacSi');
    expect(profile.chiNhanh).toStrictEqual({
      chiNhanhId: '7',
      ten: 'CS Quận 1',
    });
    expect(profile.phamViQuanTri).toBeNull();
  });

  it('PFS-03 (HS-02) Lễ tân: chiNhanh {chiNhanhId, ten}, phamViQuanTri null', async () => {
    const { service } = build(
      row({ loaiTaiKhoan: 'LeTan', chiNhanhId: '8', chiNhanhTen: 'CS Quận 7' }),
    );

    const profile = await service.getProfile('5');

    expect(profile.vaiTro).toBe('LeTan');
    expect(profile.chiNhanh).toStrictEqual({
      chiNhanhId: '8',
      ten: 'CS Quận 7',
    });
    expect(profile.phamViQuanTri).toBeNull();
  });

  it('PFS-04 (HS-03) Quản trị viên Toàn hệ thống: chiNhanh null, phamViQuanTri ToanHeThong', async () => {
    const { service } = build(
      row({ loaiTaiKhoan: 'QuanTriVien', phamViQuanTri: 'ToanHeThong' }),
    );

    const profile = await service.getProfile('5');

    expect(profile.vaiTro).toBe('QuanTriVien');
    expect(profile.chiNhanh).toBeNull();
    expect(profile.phamViQuanTri).toBe('ToanHeThong');
  });

  it('PFS-05 (HS-03) Quản trị viên Chi nhánh: chiNhanh có giá trị, phamViQuanTri ChiNhanh', async () => {
    const { service } = build(
      row({
        loaiTaiKhoan: 'QuanTriVien',
        phamViQuanTri: 'ChiNhanh',
        chiNhanhId: '9',
        chiNhanhTen: 'CS Thủ Đức',
      }),
    );

    const profile = await service.getProfile('5');

    expect(profile.chiNhanh).toStrictEqual({
      chiNhanhId: '9',
      ten: 'CS Thủ Đức',
    });
    expect(profile.phamViQuanTri).toBe('ChiNhanh');
  });

  it('PFS-06 trường trống giữ null; giá trị giữ nguyên, kể cả giới tính lạ (không kiểm, không đổi)', async () => {
    const empty = await build(
      row({ gioiTinh: null, ngaySinh: null, diaChi: null }),
    ).service.getProfile('5');
    expect([empty.gioiTinh, empty.ngaySinh, empty.diaChi]).toEqual([
      null,
      null,
      null,
    ]);

    const odd = await build(row({ gioiTinh: 'Nữ' })).service.getProfile('5');
    expect(odd.gioiTinh).toBe('Nữ');
  });

  it('PFS-07 (HS-24) anhDaiDien luôn null dù hàng có ảnh', async () => {
    const { service } = build();

    expect((await service.getProfile('5')).anhDaiDien).toBeNull();
  });

  it('PFS-08 vaiTro lấy từ loaiTaiKhoan của hàng DB', async () => {
    for (const vaiTro of [
      'BenhNhan',
      'BacSi',
      'LeTan',
      'QuanTriVien',
    ] as const) {
      const { service } = build(
        row({
          loaiTaiKhoan: vaiTro,
          chiNhanhId: '1',
          chiNhanhTen: 'CS',
          phamViQuanTri: 'ChiNhanh',
        }),
      );

      expect((await service.getProfile('5')).vaiTro).toBe(vaiTro);
    }
  });

  it('PFS-09 (QP-07, H9) hàng mất sau khi guard đã qua ⇒ 401 PHIEN_HET_HIEU_LUC, không 500', async () => {
    await expectSessionInactive(build(null).service.getProfile('5'));
  });

  it.each(['NgungHoatDong', 'ChoKichHoat'] as const)(
    'PFS-10 (QP-07, H9) tài khoản %s sau khi guard đã qua ⇒ 401 PHIEN_HET_HIEU_LUC',
    async (trangThai) => {
      await expectSessionInactive(
        build(row({ trangThai })).service.getProfile('5'),
      );
    },
  );

  it('PFS-11 (H9) trạng thái được kiểm TRƯỚC dữ liệu lệch: tài khoản ngưng mà thiếu hàng vai trò ⇒ 401, không 500', async () => {
    const { service } = build(
      row({ loaiTaiKhoan: 'LeTan', trangThai: 'NgungHoatDong' }),
    );

    await expectSessionInactive(service.getProfile('5'));
  });

  it.each(['BacSi', 'LeTan'] as const)(
    'PFS-12 (BM-02) %s thiếu hàng vai trò ⇒ Error thường, thông điệp có mã tài khoản, không có dữ liệu cá nhân',
    async (loaiTaiKhoan) => {
      const { service } = build(row({ loaiTaiKhoan }));

      await expectInconsistent(service.getProfile('5'));
    },
  );

  it('PFS-13 (BM-02) Bác sĩ có chiNhanhId nhưng thiếu tên chi nhánh ⇒ lỗi nội bộ', async () => {
    const { service } = build(
      row({ loaiTaiKhoan: 'BacSi', chiNhanhId: '7', chiNhanhTen: null }),
    );

    await expectInconsistent(service.getProfile('5'));
  });

  it('PFS-14 (BM-02) Quản trị viên thiếu hàng vai trò (phamViQuanTri null) ⇒ lỗi nội bộ', async () => {
    const { service } = build(
      row({ loaiTaiKhoan: 'QuanTriVien', phamViQuanTri: null }),
    );

    await expectInconsistent(service.getProfile('5'));
  });

  it('PFS-15 (BM-02) Quản trị viên Chi nhánh thiếu chi nhánh ⇒ lỗi nội bộ; Toàn hệ thống thì không cần chi nhánh', async () => {
    const lacking = build(
      row({ loaiTaiKhoan: 'QuanTriVien', phamViQuanTri: 'ChiNhanh' }),
    );

    await expectInconsistent(lacking.service.getProfile('5'));
    await expect(
      build(
        row({ loaiTaiKhoan: 'QuanTriVien', phamViQuanTri: 'ToanHeThong' }),
      ).service.getProfile('5'),
    ).resolves.toMatchObject({ chiNhanh: null });
  });

  it('PFS-16 cột của vai trò khác (hàng thừa) bị bỏ qua đúng vai trò', async () => {
    const patient = await build(
      row({ phamViQuanTri: 'ChiNhanh', chiNhanhId: '3', chiNhanhTen: 'CS X' }),
    ).service.getProfile('5');
    expect([patient.chiNhanh, patient.phamViQuanTri]).toEqual([null, null]);

    const receptionist = await build(
      row({
        loaiTaiKhoan: 'LeTan',
        phamViQuanTri: 'ToanHeThong',
        chiNhanhId: '4',
        chiNhanhTen: 'CS Y',
      }),
    ).service.getProfile('5');
    expect(receptionist.phamViQuanTri).toBeNull();
    expect(receptionist.chiNhanh).toStrictEqual({
      chiNhanhId: '4',
      ten: 'CS Y',
    });

    const globalAdmin = await build(
      row({
        loaiTaiKhoan: 'QuanTriVien',
        phamViQuanTri: 'ToanHeThong',
        chiNhanhId: '4',
        chiNhanhTen: 'CS Y',
      }),
    ).service.getProfile('5');
    expect(globalAdmin.chiNhanh).toBeNull();
  });

  it('PFS-17 lỗi DB không bị che thành 401', async () => {
    const failure = new Error('mất kết nối');
    const service = new ProfileService(
      { manager } as DataSource,
      {
        findProfile: () => Promise.reject(failure),
      } as unknown as ProfileRepository,
    );

    await expect(service.getProfile('5')).rejects.toBe(failure);
  });

  it('PFS-18 kho được gọi với manager của DataSource và đúng mã tài khoản', async () => {
    const { service, findProfile } = build();

    await service.getProfile('77');

    expect(findProfile.mock.calls).toEqual([[manager, '77']]);
  });
});
