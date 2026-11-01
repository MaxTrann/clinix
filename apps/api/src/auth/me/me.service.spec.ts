import { UnauthorizedException } from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import { vi } from 'vitest';
import { AUTH_ERROR_CODES } from '../auth.constants.js';
import type { TaiKhoan } from '../entities/tai-khoan.entity.js';
import type { TaiKhoanRepository } from '../repositories/tai-khoan.repository.js';
import { MeService } from './me.service.js';

// Task A15 — các nhánh guard chặn trước ở HTTP (hàng mất, trạng thái khác DangHoatDong sau khi guard đã qua) chỉ phủ được ở đây. Mã MEU-Snn là [đề xuất].
const manager = {} as EntityManager;
// Hàng "giàu" hơn thực tế: nếu dịch vụ trả nguyên hàng thì các trường nhạy cảm sẽ lọt ra và test đỏ
const row = {
  taiKhoanId: '5',
  hoTen: 'Trần Thị B',
  daXacMinhEmail: true,
  loaiTaiKhoan: 'BacSi',
  trangThai: 'DangHoatDong',
  email: 'b@example.com',
  soDienThoai: '0901234567',
  matKhauBam: '$argon2id$gia',
} satisfies Partial<TaiKhoan>;

function build(found: Partial<TaiKhoan> | null = row) {
  const findProfile = vi.fn((_em: EntityManager, _id: string) =>
    Promise.resolve(found as TaiKhoan | null),
  );
  return {
    findProfile,
    service: new MeService(
      { manager } as DataSource,
      { findProfile } as unknown as TaiKhoanRepository,
    ),
  };
}

async function expectSessionInactive(work: Promise<unknown>) {
  const error = await work.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(UnauthorizedException);
  expect((error as UnauthorizedException).message).toBe(
    AUTH_ERROR_CODES.SESSION_INACTIVE,
  );
}

describe('MeService', () => {
  it('MEU-S01 (DN-23) trả ĐÚNG ba trường của hàng đọc được, không kéo theo email, số điện thoại hay băm', async () => {
    const { service, findProfile } = build();

    await expect(service.getProfile('5')).resolves.toStrictEqual({
      vaiTro: 'BacSi',
      hoTen: 'Trần Thị B',
      daXacMinhEmail: true,
    });
    expect(findProfile.mock.calls).toEqual([[manager, '5']]);
  });

  it('MEU-S02 daXacMinhEmail false được giữ nguyên, không bị đổi thành true', async () => {
    const { service } = build({ ...row, daXacMinhEmail: false });

    const profile = await service.getProfile('5');

    expect(profile.daXacMinhEmail).toBe(false);
  });

  it('MEU-S03 hàng mất sau khi guard đã qua ⇒ 401 PHIEN_HET_HIEU_LUC, không 500', async () => {
    await expectSessionInactive(build(null).service.getProfile('5'));
  });

  it('MEU-S04 tài khoản bị ngưng sau khi guard đã qua ⇒ 401 PHIEN_HET_HIEU_LUC', async () => {
    const { service } = build({ ...row, trangThai: 'NgungHoatDong' });

    await expectSessionInactive(service.getProfile('5'));
  });

  it('MEU-S05 tài khoản ChoKichHoat sau khi guard đã qua ⇒ 401 PHIEN_HET_HIEU_LUC', async () => {
    const { service } = build({ ...row, trangThai: 'ChoKichHoat' });

    await expectSessionInactive(service.getProfile('5'));
  });

  it('MEU-S06 lỗi DB không bị che thành 401', async () => {
    const failure = new Error('mất kết nối');
    const service = new MeService(
      { manager } as DataSource,
      {
        findProfile: () => Promise.reject(failure),
      } as unknown as TaiKhoanRepository,
    );

    await expect(service.getProfile('5')).rejects.toBe(failure);
  });
});
