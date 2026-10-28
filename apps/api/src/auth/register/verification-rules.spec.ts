import { UNVERIFIED_ACCOUNT_TTL_MS } from '../auth.constants.js';
import { verificationRefusalFor } from './verification-rules.js';
import type { AccountFacts } from './unverified-account-rules.js';

// Task A6 — quy tắc thuần "tài khoản còn xác minh / nhận mã gửi lại được không". Test case (XM-nn / GL-nn là [đề xuất]):
// XM-10 biên 24 giờ nửa mở (cùng hàm với A5, DK-38), XM-11 bị ngưng hoạt động, XM-12 đã xác minh / nhân sự / trạng thái lạ (DK-30).
const BORN = new Date('2026-11-02T01:00:00.000Z');
const at = (offsetMs: number): Date => new Date(BORN.getTime() + offsetMs);

const pending = (overrides: Partial<AccountFacts> = {}): AccountFacts => ({
  loaiTaiKhoan: 'BenhNhan',
  daXacMinhEmail: false,
  trangThai: 'DangHoatDong',
  thoiDiemTao: BORN,
  ...overrides,
});

describe('verificationRefusalFor — Bệnh nhân chưa xác minh đang hoạt động (XM-10)', () => {
  it('vừa tạo, 1 giây, 1 giờ → cho phép', () => {
    for (const offset of [0, 1000, 3_600_000]) {
      expect(verificationRefusalFor(pending(), at(offset))).toBeNull();
    }
  });

  it('23:59:59 → cho phép; đúng 24:00:00 → REGISTRATION_EXPIRED (nửa mở, cùng hàm với A5); 24:00:01 → REGISTRATION_EXPIRED', () => {
    expect(
      verificationRefusalFor(pending(), at(UNVERIFIED_ACCOUNT_TTL_MS - 1000)),
    ).toBeNull();
    expect(
      verificationRefusalFor(pending(), at(UNVERIFIED_ACCOUNT_TTL_MS)),
    ).toBe('REGISTRATION_EXPIRED');
    expect(
      verificationRefusalFor(pending(), at(UNVERIFIED_ACCOUNT_TTL_MS + 1000)),
    ).toBe('REGISTRATION_EXPIRED');
  });
});

describe('verificationRefusalFor — các trường hợp từ chối', () => {
  it('XM-11 chưa xác minh nhưng NgungHoatDong → ACCOUNT_SUSPENDED, kể cả khi đã quá 24 giờ (A5-F: không bao giờ bị xoá)', () => {
    const suspended = pending({ trangThai: 'NgungHoatDong' });
    expect(verificationRefusalFor(suspended, at(0))).toBe('ACCOUNT_SUSPENDED');
    expect(
      verificationRefusalFor(suspended, at(UNVERIFIED_ACCOUNT_TTL_MS * 3)),
    ).toBe('ACCOUNT_SUSPENDED');
  });

  it.each<[string, Partial<AccountFacts>]>([
    ['đã xác minh', { daXacMinhEmail: true }],
    [
      'đã xác minh và bị ngưng',
      { daXacMinhEmail: true, trangThai: 'NgungHoatDong' },
    ],
    ['bác sĩ', { loaiTaiKhoan: 'BacSi' }],
    ['lễ tân', { loaiTaiKhoan: 'LeTan' }],
    ['quản trị viên', { loaiTaiKhoan: 'QuanTriVien' }],
    ['nhân sự bị ngưng', { loaiTaiKhoan: 'BacSi', trangThai: 'NgungHoatDong' }],
    [
      'Bệnh nhân ở trạng thái ChoKichHoat (không hợp lệ)',
      { trangThai: 'ChoKichHoat' },
    ],
  ])(
    'XM-12 %s → ACCOUNT_NOT_PENDING (dữ liệu không nhất quán, DK-30)',
    (_label, overrides) => {
      expect(verificationRefusalFor(pending(overrides), at(0))).toBe(
        'ACCOUNT_NOT_PENDING',
      );
    },
  );
});
