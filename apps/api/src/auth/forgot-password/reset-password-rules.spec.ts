import type { AccountFacts } from '../register/unverified-account-rules.js';
import {
  CONSUME_REFUSALS,
  resetFlagsFor,
  revokesRegistrations,
} from './reset-password-rules.js';

// Task A12 — luật thuần của bước đặt mật khẩu mới: hai cờ cho khung "Hoàn tất" (N7, N3) và khi nào thu hồi mã đăng ký (N3).
// Test case: QM-17, QM-19 (phần cờ). Mã MKU-Rnn là [đề xuất].
const facts = (overrides: Partial<AccountFacts> = {}): AccountFacts => ({
  loaiTaiKhoan: 'BenhNhan',
  daXacMinhEmail: true,
  trangThai: 'DangHoatDong',
  thoiDiemTao: new Date('2026-11-01T00:00:00.000Z'),
  ...overrides,
});

describe('resetFlagsFor', () => {
  it.each([
    ['Bệnh nhân đã xác minh', {}, false, false],
    ['nhân sự đang hoạt động', { loaiTaiKhoan: 'LeTan' }, false, false],
    [
      'NgungHoatDong đã xác minh (QM-19)',
      { trangThai: 'NgungHoatDong' },
      true,
      false,
    ],
    [
      'nhân sự NgungHoatDong',
      { loaiTaiKhoan: 'BacSi', trangThai: 'NgungHoatDong' },
      true,
      false,
    ],
    [
      'Bệnh nhân chưa xác minh đang hoạt động (QM-17)',
      { daXacMinhEmail: false },
      false,
      true,
    ],
    // A5-F: đăng ký lại email này bị EMAIL_DA_DUNG, nên KHÔNG hướng dẫn đăng ký lại
    [
      'Bệnh nhân chưa xác minh bị ngưng',
      { daXacMinhEmail: false, trangThai: 'NgungHoatDong' },
      true,
      false,
    ],
    // dữ liệu hỏng (nhân sự chưa xác minh): không phải Bệnh nhân nên không có đăng ký nào để làm lại
    [
      'nhân sự chưa xác minh',
      { loaiTaiKhoan: 'LeTan', daXacMinhEmail: false },
      false,
      false,
    ],
  ] as const)(
    'MKU-R01 %s ⇒ taiKhoanNgung=%s, canDangKyLai=%s',
    (_label, overrides, taiKhoanNgung, canDangKyLai) => {
      const flags = resetFlagsFor(facts(overrides));
      expect(flags).toEqual({ taiKhoanNgung, canDangKyLai });
      expect(Object.keys(flags).sort()).toEqual([
        'canDangKyLai',
        'taiKhoanNgung',
      ]);
    },
  );
});

describe('revokesRegistrations (N3)', () => {
  it('MKU-R02 thu hồi mã DangKy khi và chỉ khi chưa xác minh email (kể cả bị ngưng)', () => {
    expect(revokesRegistrations(facts({ daXacMinhEmail: false }))).toBe(true);
    expect(
      revokesRegistrations(
        facts({ daXacMinhEmail: false, trangThai: 'NgungHoatDong' }),
      ),
    ).toBe(true);
    expect(revokesRegistrations(facts())).toBe(false);
    expect(revokesRegistrations(facts({ trangThai: 'NgungHoatDong' }))).toBe(
      false,
    );
  });
});

describe('CONSUME_REFUSALS', () => {
  it('MKU-R03 chỉ "đã dùng" và "đã bị thu hồi" là chuyện bình thường; bốn lý do còn lại là dữ liệu không nhất quán (log ERROR)', () => {
    const expected = Object.entries(CONSUME_REFUSALS)
      .filter(([, refusal]) => refusal.expected)
      .map(([reason]) => reason)
      .sort();
    expect(expected).toEqual(['REVOKED', 'USED']);
    expect(Object.keys(CONSUME_REFUSALS).sort()).toEqual([
      'NOT_FOUND',
      'NOT_SENT',
      'REVOKED',
      'USED',
      'WRONG_ACCOUNT',
      'WRONG_TYPE',
    ]);
  });
});
