import { describe, expect, it } from 'vitest';
import {
  EMPTY_FILTERS,
  hasActiveFilters,
  hasNonDateFilters,
  readFilters,
  writeFilters,
  type ReceptionFilters,
} from './reception-query-state';

// booking F12b, mức hàm của UIF-16 (bộ lọc không cá nhân của Lễ tân trên URL; F8 để ở bộ nhớ trang: LTL-01, LTL-09). Mã UIF-16 là [đề xuất] (PLAN booking mục 7.48). Cùng nếp `doctor-query-state.test.ts` (F11, DAF-11
// đến DAF-14) và `admin-query-state.test.ts` (F10). URL là dữ liệu NGƯỜI DÙNG SỬA ĐƯỢC: mọi giá trị đọc ra phải được kiểm lại.
const read = (search: string) => readFilters(new URLSearchParams(search));
const write = (filters: ReceptionFilters) => writeFilters(filters).toString();

describe('booking F12b — bộ lọc của Lễ tân trên URL', () => {
  it('LTL-01 UIF-16 URL trống là mặc định của Figma `479:2`: chip Hôm nay, hai ô ngày trống, mọi ô Tất cả, trang 1', () => {
    expect(read('')).toEqual(EMPTY_FILTERS);
    expect(EMPTY_FILTERS).toEqual({
      preset: 'today',
      from: '',
      to: '',
      status: null,
      doctor: '',
      specialty: '',
      page: 1,
    });
    // Mặc định ghi ra URL trống (không ghi khoá thừa)
    expect(write(EMPTY_FILTERS)).toBe('');
  });

  it('UIF-16 chỉ ghi khoá KHÁC mặc định, theo thứ tự cố định; khoảng ngày chỉ ghi với chip `Khoảng ngày`; KHÔNG có khoá `q`', () => {
    expect(write({ ...EMPTY_FILTERS, preset: 'tomorrow' })).toBe(
      'khoang=ngay-mai',
    );
    expect(write({ ...EMPTY_FILTERS, preset: 'week' })).toBe('khoang=tuan-nay');
    expect(write({ ...EMPTY_FILTERS, preset: 'range' })).toBe(
      'khoang=khoang-ngay',
    );
    expect(
      write({
        preset: 'range',
        from: '2026-10-01',
        to: '2026-10-31',
        status: 'DaXacNhan',
        specialty: '3',
        doctor: '12',
        page: 4,
      }),
    ).toBe(
      'khoang=khoang-ngay&tuNgay=2026-10-01&denNgay=2026-10-31&trangThai=DaXacNhan&chuyenKhoaId=3&bacSiId=12&page=4',
    );
    // Ngày của chip KHÁC `range` không được ghi dù trong bộ lọc còn giá trị cũ
    expect(
      write({
        ...EMPTY_FILTERS,
        preset: 'week',
        from: '2026-10-01',
        to: '2026-10-31',
      }),
    ).toBe('khoang=tuan-nay');
    // Trang 1 không ghi; không có kiểu bộ lọc nào ghi `q`
    expect(write({ ...EMPTY_FILTERS, page: 1 })).toBe('');
    expect(write({ ...EMPTY_FILTERS, page: 2 })).toBe('page=2');
    expect([
      ...writeFilters({ ...EMPTY_FILTERS, status: 'VangMat' }).keys(),
    ]).not.toContain('q');
  });

  it('UIF-16 ghi rồi đọc lại cho đúng bộ lọc cũ (bốn chip ngày, các ô lọc, trang)', () => {
    const cases: ReceptionFilters[] = [
      EMPTY_FILTERS,
      { ...EMPTY_FILTERS, preset: 'tomorrow', page: 2 },
      { ...EMPTY_FILTERS, preset: 'week', status: 'DaTiepDon' },
      {
        preset: 'range',
        from: '2026-10-01',
        to: '2026-10-31',
        status: 'HoanThanh',
        specialty: '9',
        doctor: '101',
        page: 12,
      },
      {
        ...EMPTY_FILTERS,
        preset: 'range',
        from: '2026-10-05',
        to: '',
      },
    ];
    for (const filters of cases) {
      expect(read(write(filters))).toEqual(filters);
    }
  });

  it.each([
    ['trạng thái lạ', 'trangThai=DangTuyenDung', { status: null }],
    ['trạng thái sai kiểu chữ', 'trangThai=dahuy', { status: null }],
    ['bác sĩ chữ', 'bacSiId=abc', { doctor: '' }],
    ['bác sĩ số 0', 'bacSiId=0', { doctor: '' }],
    ['bác sĩ số 0 đứng đầu', 'bacSiId=012', { doctor: '' }],
    ['bác sĩ số thập phân', 'bacSiId=1.5', { doctor: '' }],
    ['bác sĩ số âm', 'bacSiId=-3', { doctor: '' }],
    ['chuyên khoa chữ', 'chuyenKhoaId=tim', { specialty: '' }],
    ['chuyên khoa số 0', 'chuyenKhoaId=0', { specialty: '' }],
    ['trang 0', 'page=0', { page: 1 }],
    ['trang âm', 'page=-2', { page: 1 }],
    ['trang chữ', 'page=abc', { page: 1 }],
    ['trang quá 5 chữ số', 'page=100000', { page: 1 }],
    ['trang cực lớn', 'page=99999999999', { page: 1 }],
    ['chip lạ', 'khoang=hom-qua', { preset: 'today' }],
    // Slug của chip dành cho Bác sĩ (`tuan-sau`, `thang-nay`) không phải chip của Lễ tân: bỏ như slug lạ
    ['chip của Bác sĩ: tuần sau', 'khoang=tuan-sau', { preset: 'today' }],
    ['chip của Bác sĩ: tháng này', 'khoang=thang-nay', { preset: 'today' }],
  ] as const)(
    'UIF-16 URL sai dạng (%s) ⇒ bỏ như không có, về giá trị mặc định',
    (_name, search, expected) => {
      expect(read(search)).toEqual({ ...EMPTY_FILTERS, ...expected });
    },
  );

  it('UIF-16 slug `hom-nay` đọc được là chip Hôm nay (mặc định) nhưng KHÔNG được ghi lại', () => {
    expect(read('khoang=hom-nay').preset).toBe('today');
    expect(write(read('khoang=hom-nay'))).toBe('');
  });

  it('UIF-16 ngày: sai lịch (30/02), sai dạng, hay Đến ngày trước Từ ngày ⇒ bỏ; ngày chỉ có nghĩa với `Khoảng ngày`', () => {
    const range = 'khoang=khoang-ngay';
    expect(read(`${range}&tuNgay=2026-02-30`).from).toBe('');
    expect(read(`${range}&tuNgay=20261001`).from).toBe('');
    expect(read(`${range}&denNgay=abc`).to).toBe('');
    // Một đầu hợp lệ thì giữ đầu đó (đầu trống không ràng buộc)
    expect(read(`${range}&tuNgay=2026-10-05`)).toEqual({
      ...EMPTY_FILTERS,
      preset: 'range',
      from: '2026-10-05',
    });
    // Đến ngày trước Từ ngày: bỏ cả hai
    expect(read(`${range}&tuNgay=2026-10-20&denNgay=2026-10-19`)).toEqual({
      ...EMPTY_FILTERS,
      preset: 'range',
    });
    // Cùng ngày là hợp lệ (hai biên đóng)
    expect(read(`${range}&tuNgay=2026-10-20&denNgay=2026-10-20`)).toEqual({
      ...EMPTY_FILTERS,
      preset: 'range',
      from: '2026-10-20',
      to: '2026-10-20',
    });
    // Chip khác `Khoảng ngày`: ngày trên URL bị bỏ
    expect(
      read('khoang=tuan-nay&tuNgay=2026-10-01&denNgay=2026-10-31'),
    ).toEqual({ ...EMPTY_FILTERS, preset: 'week' });
    expect(read('tuNgay=2026-10-01&denNgay=2026-10-31')).toEqual(EMPTY_FILTERS);
  });

  it('UIF-16 khoá không thuộc bộ lọc (q, lyDoKham, soDienThoai, chiNhanhId, dichVuKhamId, ca, sapXep, pageSize) trên URL KHÔNG đi vào bộ lọc và không được ghi lại', () => {
    const search =
      'q=0901234567&lyDoKham=dau&soDienThoai=0901234567&chiNhanhId=2&dichVuKhamId=5&ca=CaSang&sapXep=CuNhat&pageSize=500&trangThai=DaXacNhan';
    const filters = read(search);
    expect(filters).toEqual({ ...EMPTY_FILTERS, status: 'DaXacNhan' });
    expect(write(filters)).toBe('trangThai=DaXacNhan');
  });

  it('UIF-16 hai bộ lọc bằng nhau cho đúng cùng một chuỗi dù khoá đảo thứ tự trên URL (để biết "không đổi gì")', () => {
    const a = write(read('page=3&bacSiId=7&trangThai=VangMat&khoang=tuan-nay'));
    const b = write(read('khoang=tuan-nay&trangThai=VangMat&bacSiId=7&page=3'));
    expect(a).toBe(b);
    expect(a).toBe('khoang=tuan-nay&trangThai=VangMat&bacSiId=7&page=3');
  });

  it('LTL-09 UIF-16 hasNonDateFilters chỉ nhìn bộ lọc KHÁC chip ngày (kể cả từ khoá); hasActiveFilters tính cả chip khác Hôm nay', () => {
    expect(hasNonDateFilters(EMPTY_FILTERS, '')).toBe(false);
    expect(hasActiveFilters(EMPTY_FILTERS, '')).toBe(false);

    for (const patch of [
      { status: 'DaHuy' as const },
      { doctor: '1' },
      { specialty: '1' },
    ]) {
      const filters = { ...EMPTY_FILTERS, ...patch };
      expect(hasNonDateFilters(filters, '')).toBe(true);
      expect(hasActiveFilters(filters, '')).toBe(true);
    }
    // Từ khoá ở bộ nhớ (không ở URL) vẫn tính là bộ lọc khác chip
    expect(hasNonDateFilters(EMPTY_FILTERS, 'ab')).toBe(true);
    expect(hasActiveFilters(EMPTY_FILTERS, 'ab')).toBe(true);
    // Chip khác Hôm nay là đang lọc nhưng KHÔNG phải bộ lọc khác chip
    for (const preset of ['tomorrow', 'week', 'range'] as const) {
      const filters = { ...EMPTY_FILTERS, preset };
      expect(hasNonDateFilters(filters, '')).toBe(false);
      expect(hasActiveFilters(filters, '')).toBe(true);
    }
    // Trang không tính là bộ lọc
    expect(hasActiveFilters({ ...EMPTY_FILTERS, page: 5 }, '')).toBe(false);
  });
});
