import {
  GENDER_OPTIONS,
  fromDisplayDate,
  genderLabel,
  initialsOf,
  isRealDate,
  toDisplayDate,
  todayInVietnam,
  valuesFromProfile,
} from './profile-format';

// patient F3 (TRACKING F3-G). Mã ca PW-nn là [đề xuất]; mỗi ca ghi mã HS của PLAN mục 7.1 mà nó phủ.

describe('đổi ngày bằng chuỗi (bẫy múi giờ)', () => {
  // Máy Việt Nam (+07:00) làm `new Date('1990-05-15')` đọc ra đúng ngày 15; múi giờ âm đọc ra ngày 14. Đặt TZ âm để bắt bản dùng Date.
  beforeEach(() => {
    vi.stubEnv('TZ', 'America/New_York');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ['1990-05-15', '15/05/1990'],
    ['1900-01-01', '01/01/1900'],
    ['2024-02-29', '29/02/2024'],
    ['2026-12-31', '31/12/2026'],
  ])('PW-01 HS-17 toDisplayDate(%s) ⇒ %s', (iso, display) => {
    expect(toDisplayDate(iso)).toBe(display);
  });

  it('PW-01 HS-17 null hoặc sai dạng ⇒ null', () => {
    expect(toDisplayDate(null)).toBeNull();
    expect(toDisplayDate('15/05/1990')).toBeNull();
    expect(toDisplayDate('1990-5-15')).toBeNull();
  });

  it.each([
    ['15/05/1990', '1990-05-15'],
    ['01/01/1900', '1900-01-01'],
    ['29/02/2024', '2024-02-29'],
  ])('PW-02 HS-18 fromDisplayDate(%s) ⇒ %s', (display, iso) => {
    expect(fromDisplayDate(display)).toBe(iso);
  });

  it.each([
    '15-05-1990',
    '5/1/1990',
    '15/5/90',
    '1990-05-15',
    '',
    ' 15/05/1990',
    '15/05/1990 ',
    '١٥/٠٥/١٩٩٠',
  ])('PW-02 HS-18 fromDisplayDate(%j) sai dạng ⇒ null', (text) => {
    expect(fromDisplayDate(text)).toBeNull();
  });
});

describe('ngày có thật (số học, không qua Date)', () => {
  it.each([
    '1990-05-15',
    '2024-02-29',
    '2000-02-29',
    '1900-01-01',
    '2026-12-31',
    '2023-04-30',
  ])('PW-03 HS-18 %s có thật', (iso) => {
    expect(isRealDate(iso)).toBe(true);
  });

  it.each([
    '2023-02-29',
    '1900-02-29',
    '2100-02-29',
    '2000-04-31',
    '2000-02-31',
    '2000-00-10',
    '2000-13-10',
    '2000-05-00',
    '2000-05-32',
    'không phải ngày',
  ])('PW-03 HS-18 %s không có thật', (iso) => {
    expect(isRealDate(iso)).toBe(false);
  });
});

describe('ngày hôm nay theo giờ Việt Nam', () => {
  it('PW-04 HS-18 biên 23:59:59 và 00:00:00 (+07:00), không phụ thuộc múi giờ máy', () => {
    for (const zone of ['Asia/Ho_Chi_Minh', 'America/New_York', 'UTC']) {
      vi.stubEnv('TZ', zone);
      // 23:59:59 ngày 05/11 giờ Việt Nam
      expect(todayInVietnam(new Date('2026-11-05T16:59:59Z'))).toBe(
        '2026-11-05',
      );
      // 00:00:00 ngày 06/11 giờ Việt Nam (UTC vẫn là ngày 05)
      expect(todayInVietnam(new Date('2026-11-05T17:00:00Z'))).toBe(
        '2026-11-06',
      );
    }
    vi.unstubAllEnvs();
  });

  it('PW-04 HS-18 không có đối số thì lấy đồng hồ hiện tại', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-28T17:30:00Z'));
    expect(todayInVietnam()).toBe('2026-03-01');
    vi.useRealTimers();
  });
});

describe('chữ viết tắt của avatar', () => {
  it.each([
    ['Nguyễn Văn A', 'NV'],
    ['Nguyễn Thị Bích', 'NT'],
    ['Madonna', 'M'],
    ['đỗ thị hoa', 'ĐT'],
    ['  Lê   Hoàng  ', 'LH'],
    ['(Bé) An', 'BA'],
    ['123 Ab Cd', 'AC'],
    ['Nguyễn'.normalize('NFD') + ' Ế'.normalize('NFD'), 'NẾ'],
  ])('PW-05 HS-17 initialsOf(%j) ⇒ %s', (name, initials) => {
    expect(initialsOf(name)).toBe(initials);
  });
});

describe('giới tính', () => {
  it('PW-06 HS-17 mã chuẩn ⇒ nhãn tiếng Việt', () => {
    expect(GENDER_OPTIONS.map((option) => option.code)).toEqual([
      'Nam',
      'Nu',
      'Khac',
    ]);
    expect(genderLabel('Nam')).toBe('Nam');
    expect(genderLabel('Nu')).toBe('Nữ');
    expect(genderLabel('Khac')).toBe('Khác');
  });

  it.each([null, '', 'Male', 'nữ', 'nu', 'NAM'])(
    'PW-06 HS-17 genderLabel(%j) (null hoặc mã lạ) ⇒ null',
    (code) => {
      expect(genderLabel(code)).toBeNull();
    },
  );

  it('PW-06 HS-18 giá trị ban đầu của form: mã chuẩn giữ, mã lạ hoặc null ⇒ chưa chọn, ngày đổi sang dd/mm/yyyy', () => {
    const base = {
      hoTen: 'Nguyễn Văn A',
      email: 'a@example.invalid',
      soDienThoai: '0901234567',
      diaChi: null,
    };
    expect(
      valuesFromProfile({
        ...base,
        gioiTinh: 'Nu',
        ngaySinh: '1990-05-15',
        diaChi: 'Số 1',
      }),
    ).toEqual({
      hoTen: 'Nguyễn Văn A',
      soDienThoai: '0901234567',
      gioiTinh: 'Nu',
      ngaySinh: '15/05/1990',
      diaChi: 'Số 1',
    });
    expect(
      valuesFromProfile({ ...base, gioiTinh: 'Male', ngaySinh: null }),
    ).toEqual({
      hoTen: 'Nguyễn Văn A',
      soDienThoai: '0901234567',
      gioiTinh: '',
      ngaySinh: '',
      diaChi: '',
    });
    expect(
      valuesFromProfile({ ...base, gioiTinh: null, ngaySinh: null }).gioiTinh,
    ).toBe('');
  });
});
