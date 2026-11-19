import {
  formatBirthDate,
  formatCreatedAt,
  formatEmailVerified,
  formatGender,
  formatNoShowCount,
  formatNoShowLock,
  formatStatus,
  formatText,
} from './account-format';

// admin F9, định dạng chữ (mã TKF9-11, 12 là [đề xuất], TRACKING admin 9A.12 mục 3).

describe('TKF9-11 ngày sinh và giờ tạo', () => {
  it.each([
    ['1990-05-07', '07/05/1990'],
    ['2000-02-29', '29/02/2000'],
    ['1999-12-31', '31/12/1999'],
  ])('TKF9-11 ngày sinh %s ⇒ %s', (input, expected) => {
    expect(formatBirthDate(input)).toBe(expected);
  });

  it.each([
    '1990-02-30',
    '2001-02-29',
    '1990-13-01',
    '1990-00-10',
    '07/05/1990',
    'abc',
    '',
    '1990-5-7',
  ])(
    'TKF9-11 ngày sinh không có thật hoặc rác "%s" ⇒ dấu gạch (không tự sửa)',
    (input) => {
      expect(formatBirthDate(input)).toBe('—');
    },
  );

  it('TKF9-11 ngày sinh null hay vắng ⇒ "Chưa có"', () => {
    expect(formatBirthDate(null)).toBe('Chưa có');
    expect(formatBirthDate(undefined)).toBe('Chưa có');
  });

  it('TKF9-11 giờ tạo đổi sang giờ Việt Nam, kể cả qua nửa đêm UTC', () => {
    expect(formatCreatedAt('2026-11-18T17:30:00.000Z')).toBe(
      '19/11/2026 00:30',
    );
    expect(formatCreatedAt('2026-11-18T16:59:59.000Z')).toBe(
      '18/11/2026 23:59',
    );
    expect(formatCreatedAt('2026-12-31T17:00:00.000Z')).toBe(
      '01/01/2027 00:00',
    );
  });

  it('TKF9-11 giờ tạo rác ⇒ dấu gạch; thiếu ⇒ "Chưa có"', () => {
    expect(formatCreatedAt('không phải ngày')).toBe('—');
    expect(formatCreatedAt(null)).toBe('Chưa có');
    expect(formatCreatedAt(undefined)).toBe('Chưa có');
  });
});

describe('TKF9-12 nhãn trạng thái, no-show và chữ tự do', () => {
  it('TKF9-12 ba trạng thái tài khoản; giá trị lạ không in nguyên giá trị thô', () => {
    expect(formatStatus('DangHoatDong')).toBe('Đang hoạt động');
    expect(formatStatus('NgungHoatDong')).toBe('Ngừng hoạt động');
    expect(formatStatus('ChoKichHoat')).toBe('Chờ kích hoạt');
    expect(formatStatus('TrangThaiMoi')).toBe('—');
    expect(formatStatus('constructor')).toBe('—');
    expect(formatStatus('__proto__')).toBe('—');
  });

  it('TKF9-12 cờ no-show: true, false và null KHÁC nhau', () => {
    expect(formatNoShowLock(true)).toBe('Đang bị khoá');
    expect(formatNoShowLock(false)).toBe('Không bị khoá');
    expect(formatNoShowLock(null)).toBe('Chưa có');
    expect(formatNoShowLock(undefined)).toBe('Chưa có');
  });

  it('TKF9-12 số lần no-show: 0 là "0", thiếu hay không phải số là "Chưa có"', () => {
    expect(formatNoShowCount(0)).toBe('0');
    expect(formatNoShowCount(7)).toBe('7');
    expect(formatNoShowCount(null)).toBe('Chưa có');
    expect(formatNoShowCount(Number.NaN)).toBe('Chưa có');
    expect(formatNoShowCount(undefined)).toBe('Chưa có');
  });

  it('TKF9-12 xác minh email và chữ tự do', () => {
    expect(formatEmailVerified(true)).toBe('Đã xác minh');
    expect(formatEmailVerified(false)).toBe('Chưa xác minh');
    expect(formatEmailVerified(undefined)).toBe('Chưa có');
    expect(formatGender('Nữ')).toBe('Nữ');
    expect(formatGender(null)).toBe('Chưa có');
    expect(formatGender('  ')).toBe('Chưa có');
    expect(formatText('  ')).toBe('Chưa có');
    expect(formatText(null)).toBe('Chưa có');
    // chữ tự do được in NGUYÊN VĂN (React sẽ thoát ký tự), không bị làm sạch hay cắt
    expect(formatText('<img src=x onerror=alert(1)>')).toBe(
      '<img src=x onerror=alert(1)>',
    );
  });
});
