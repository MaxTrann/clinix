// Fixture tối thiểu cho test tích hợp của 5 bảng auth (module admin xây thêm factory của mình lên trên).
import type { DataSource, EntityManager } from 'typeorm';
import { BenhNhan } from '../benh-nhan.entity.js';
import { MaXacThuc } from '../ma-xac-thuc.entity.js';
import { PhienDangNhap } from '../phien-dang-nhap.entity.js';
import { TaiKhoan } from '../tai-khoan.entity.js';
import { ViNoiBo } from '../vi-noi-bo.entity.js';

let sequence = 0;

/** Dữ liệu hợp lệ cho một tài khoản (email khác nhau mỗi lần gọi); ghi đè bằng `overrides`. */
export function taiKhoanData(
  overrides: Partial<TaiKhoan> = {},
): Partial<TaiKhoan> {
  sequence += 1;
  return {
    hoTen: 'Nguyễn Văn A',
    soDienThoai: '0901234567',
    email: `nguoi.dung.${sequence}@example.com`,
    matKhauBam: '$argon2id$v=19$m=19456,p=1,t=2$gia$gia',
    trangThai: 'DangHoatDong',
    loaiTaiKhoan: 'BenhNhan',
    ...overrides,
  };
}

export async function insertTaiKhoan(
  db: DataSource | EntityManager,
  overrides: Partial<TaiKhoan> = {},
): Promise<TaiKhoan> {
  const repository = db.getRepository(TaiKhoan);
  return repository.save(repository.create(taiKhoanData(overrides)));
}

/** Hàng OTP đăng ký hợp lệ (có đủ dữ liệu lần đăng ký); ghi đè bằng `overrides`. */
export function maXacThucData(
  taiKhoanId: string,
  overrides: Partial<MaXacThuc> = {},
): Partial<MaXacThuc> {
  return {
    taiKhoanId,
    loai: 'DangKy',
    maBam: 'hmac-gia',
    hetHanLuc: new Date(Date.now() + 10 * 60 * 1000),
    hoTenDangKy: 'Nguyễn Văn A',
    soDienThoaiDangKy: '0901234567',
    matKhauBamDangKy: '$argon2id$gia',
    ...overrides,
  };
}

export async function insertMaXacThuc(
  db: DataSource | EntityManager,
  taiKhoanId: string,
  overrides: Partial<MaXacThuc> = {},
): Promise<MaXacThuc> {
  const repository = db.getRepository(MaXacThuc);
  return repository.save(
    repository.create(maXacThucData(taiKhoanId, overrides)),
  );
}

export async function insertBenhNhan(
  db: DataSource | EntityManager,
  taiKhoanId: string,
): Promise<BenhNhan> {
  const repository = db.getRepository(BenhNhan);
  return repository.save(repository.create({ taiKhoanId }));
}

export async function insertViNoiBo(
  db: DataSource | EntityManager,
  benhNhanId: string,
  overrides: Partial<ViNoiBo> = {},
): Promise<ViNoiBo> {
  const repository = db.getRepository(ViNoiBo);
  return repository.save(repository.create({ benhNhanId, ...overrides }));
}

export async function insertPhienDangNhap(
  db: DataSource | EntityManager,
  taiKhoanId: string,
  overrides: Partial<PhienDangNhap> = {},
): Promise<PhienDangNhap> {
  sequence += 1;
  const repository = db.getRepository(PhienDangNhap);
  return repository.save(
    repository.create({
      taiKhoanId,
      refreshTokenBam: `sha256-gia-${sequence}`,
      hetHanLuc: new Date(Date.now() + 30 * 60 * 1000),
      ...overrides,
    }),
  );
}

/** Mã lỗi MySQL của một thao tác bị DB từ chối (vd. ER_DUP_ENTRY), hoặc null nếu thao tác thành công. */
export async function dbErrorCode(
  operation: Promise<unknown>,
): Promise<string | null> {
  try {
    await operation;
    return null;
  } catch (error) {
    const driverError = (error as { driverError?: { code?: string } })
      .driverError;
    return (
      driverError?.code ??
      `LOI_KHAC: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
