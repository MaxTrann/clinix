import {
  OTP_RESEND_MIN_INTERVAL_MS,
  OTP_TTL_MS,
  UNVERIFIED_ACCOUNT_TTL_MS,
} from '../auth.constants.js';
import {
  isExpiredUnverifiedPatient,
  isOpenRegistration,
  resendAvailableAt,
  type AccountFacts,
} from './unverified-account-rules.js';

// Task A5 (hàm thuần, đồng hồ giả bằng tham số). Test case: DK-33 (biên 24 giờ), DK-34, DK-35, DK-41 (nhân sự không bao giờ bị xoá);
// ngoại lệ NgungHoatDong do người dùng chốt khi duyệt kế hoạch A5 (TRACKING A5-F). Mã (UA-nn) là [đề xuất].
const T = new Date('2026-11-02T01:00:00.000Z');
const after = (seconds: number) => new Date(T.getTime() + seconds * 1000);
const DAY = UNVERIFIED_ACCOUNT_TTL_MS / 1000;

const patient: AccountFacts = {
  loaiTaiKhoan: 'BenhNhan',
  daXacMinhEmail: false,
  trangThai: 'DangHoatDong',
  thoiDiemTao: T,
};

describe('hằng số', () => {
  it('(UA-01) tài khoản chưa xác minh sống đúng 24 giờ (Q4)', () => {
    expect(UNVERIFIED_ACCOUNT_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });
});

describe('isOpenRegistration — email này còn "đăng ký mở" (đăng ký lại được)', () => {
  it('(UA-02) Bệnh nhân, chưa xác minh, đang hoạt động → mở', () => {
    expect(isOpenRegistration(patient)).toBe(true);
  });

  it.each([
    ['đã xác minh', { daXacMinhEmail: true }],
    [
      'bị ngưng hoạt động (admin khoá, có chủ ý)',
      { trangThai: 'NgungHoatDong' },
    ],
    ['nhân sự Bác sĩ', { loaiTaiKhoan: 'BacSi' }],
    ['nhân sự Lễ tân', { loaiTaiKhoan: 'LeTan' }],
    ['quản trị viên', { loaiTaiKhoan: 'QuanTriVien' }],
    [
      'nhân sự chờ kích hoạt (cũng chưa xác minh)',
      { loaiTaiKhoan: 'BacSi', trangThai: 'ChoKichHoat' },
    ],
  ] as const)('(UA-03) %s → KHÔNG mở (EMAIL_DA_DUNG)', (_label, change) => {
    expect(isOpenRegistration({ ...patient, ...change })).toBe(false);
  });
});

describe('isExpiredUnverifiedPatient — biên 24 giờ nửa mở (DK-33)', () => {
  it.each([
    [0, false],
    [DAY - 60, false], // 23:59
    [DAY - 1, false], // 23:59:59
    [DAY, true], // đúng 24:00:00 là hết (nửa mở, cùng kiểu OTP và phiên)
    [DAY + 1, true],
    [DAY + 60, true], // 24:01
  ])('(UA-04) sau %i giây → hết hạn = %s', (seconds, expected) => {
    expect(isExpiredUnverifiedPatient(patient, after(seconds))).toBe(expected);
  });

  it.each([
    ['đã xác minh (DK-34)', { daXacMinhEmail: true }],
    [
      'Bác sĩ chờ kích hoạt, chưa xác minh (DK-35)',
      { loaiTaiKhoan: 'BacSi', trangThai: 'ChoKichHoat' },
    ],
    [
      'Lễ tân chờ kích hoạt (DK-35)',
      { loaiTaiKhoan: 'LeTan', trangThai: 'ChoKichHoat' },
    ],
    ['quản trị viên chưa xác minh (DK-35)', { loaiTaiKhoan: 'QuanTriVien' }],
    [
      'Bệnh nhân chưa xác minh nhưng bị ngưng hoạt động',
      { trangThai: 'NgungHoatDong' },
    ],
  ] as const)(
    '(UA-05) %s → KHÔNG BAO GIỜ hết hạn, dù quá 24 giờ rất lâu',
    (_label, change) => {
      const account = { ...patient, ...change };
      expect(isExpiredUnverifiedPatient(account, after(DAY * 400))).toBe(false);
    },
  );
});

describe('resendAvailableAt', () => {
  it('(UA-06) = thời điểm tạo mã + 60 giây, suy ra từ hạn mã (hạn = tạo + 10 phút) và hai hằng chung', () => {
    const created = after(5);
    const expiresAt = new Date(created.getTime() + OTP_TTL_MS);
    expect(resendAvailableAt(expiresAt).getTime()).toBe(
      created.getTime() + OTP_RESEND_MIN_INTERVAL_MS,
    );
  });
});
