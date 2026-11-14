import { describe, expect, it } from 'vitest';
import {
  EMPTY_FILTERS,
  hasActiveFilters,
  hasNonDateFilters,
  readFilters,
  writeFilters,
  type DoctorFilters,
} from './doctor-query-state';

// booking F11: bộ lọc không cá nhân trên URL, mức hàm của DAF-11 (chỉ khoá không cá nhân, không `q`) và DAF-12 (URL sai hay lạ bị bỏ). Mã DAF là [đề xuất] (PLAN booking mục 7.44). Trang thật kiểm cùng điều
// này qua `window.location` ở `doctor-list-filters.test.tsx`.
const read = (search: string) => readFilters(new URLSearchParams(search));

describe('booking F11 — bộ lọc của Bác sĩ trên URL', () => {
  it('DAF-11 URL trống là mặc định của Figma: Tùy chọn, hai ô ngày trống, Mới nhất trước, trang 1', () => {
    expect(read('')).toEqual(EMPTY_FILTERS);
    expect(EMPTY_FILTERS).toMatchObject({
      preset: 'range',
      from: '',
      to: '',
      sort: 'MoiNhat',
      status: null,
      shift: null,
      page: 1,
    });
    // Mặc định không ghi gì lên URL
    expect(writeFilters(EMPTY_FILTERS).toString()).toBe('');
  });

  it('DAF-11 chỉ ghi khoá KHÁC mặc định, theo thứ tự cố định; khoảng ngày chỉ ghi với Tùy chọn; KHÔNG có khoá `q`', () => {
    const all: DoctorFilters = {
      status: 'DaTiepDon',
      shift: 'CaSang',
      sort: 'CuNhat',
      preset: 'range',
      from: '2026-10-01',
      to: '2026-10-31',
      page: 3,
    };
    expect(writeFilters(all).toString()).toBe(
      'trangThai=DaTiepDon&ca=CaSang&sapXep=CuNhat&tuNgay=2026-10-01&denNgay=2026-10-31&page=3',
    );
    // Chip tính theo hôm nay: ghi `khoang`, KHÔNG ghi ngày (ngày tính mỗi lần vẽ)
    expect(
      writeFilters({
        ...all,
        preset: 'month',
        from: '2026-10-01',
        to: '2026-10-31',
      }).toString(),
    ).toBe(
      'trangThai=DaTiepDon&ca=CaSang&sapXep=CuNhat&khoang=thang-nay&page=3',
    );
    for (const key of writeFilters(all).keys()) {
      expect([
        'trangThai',
        'ca',
        'sapXep',
        'khoang',
        'tuNgay',
        'denNgay',
        'page',
      ]).toContain(key);
    }
    // Trang 1 và thứ tự mặc định không ghi
    expect(
      writeFilters({ ...EMPTY_FILTERS, page: 1, sort: 'MoiNhat' }).toString(),
    ).toBe('');
  });

  it('DAF-11 ghi rồi đọc lại cho đúng bộ lọc cũ (mọi chip ngày)', () => {
    const slugs = ['today', 'tomorrow', 'week', 'nextWeek', 'month'] as const;
    for (const preset of slugs) {
      const filters: DoctorFilters = {
        ...EMPTY_FILTERS,
        preset,
        status: 'HoanThanh',
        page: 2,
      };
      expect(read(writeFilters(filters).toString()), preset).toEqual(filters);
    }
    const range: DoctorFilters = {
      ...EMPTY_FILTERS,
      from: '2026-10-12',
      to: '2026-10-18',
      shift: 'CaToi',
    };
    expect(read(writeFilters(range).toString())).toEqual(range);
    // Một đầu vẫn hợp lệ
    expect(read('tuNgay=2026-10-12')).toMatchObject({
      from: '2026-10-12',
      to: '',
    });
    expect(read('denNgay=2026-10-18')).toMatchObject({
      from: '',
      to: '2026-10-18',
    });
  });

  it.each([
    ['trangThai=DaDoiLich', { status: null }],
    ['trangThai=constructor', { status: null }],
    ['trangThai=daxacnhan', { status: null }],
    ['trangThai=', { status: null }],
    ['ca=Sang', { shift: null }],
    ['ca=constructor', { shift: null }],
    ['sapXep=CuNhat', { sort: 'CuNhat' }],
    ['sapXep=cunhat', { sort: 'MoiNhat' }],
    ['sapXep=Lạ', { sort: 'MoiNhat' }],
    ['khoang=lạ', { preset: 'range' }],
    ['khoang=constructor', { preset: 'range' }],
    ['khoang=HOM-NAY', { preset: 'range' }],
    ['tuNgay=2026-13-45', { from: '' }],
    ['tuNgay=2026-02-30', { from: '' }],
    ['tuNgay=18/10/2026', { from: '' }],
    ['denNgay=hôm nay', { to: '' }],
    ['page=0', { page: 1 }],
    ['page=-1', { page: 1 }],
    ['page=abc', { page: 1 }],
    ['page=1.5', { page: 1 }],
    ['page=007', { page: 1 }],
    ['page=100000', { page: 1 }],
    ['page=99999999999', { page: 1 }],
    ['page=99999', { page: 99999 }],
  ])('DAF-12 URL %s bị bỏ hay giữ đúng', (search, expected) => {
    expect(read(search)).toMatchObject(expected);
  });

  it('DAF-12 Đến ngày trước Từ ngày trên URL ⇒ bỏ cả hai; ngày chỉ có nghĩa với Tùy chọn (chip khác bỏ ngày trên URL)', () => {
    expect(read('tuNgay=2026-10-20&denNgay=2026-10-01')).toMatchObject({
      from: '',
      to: '',
    });
    expect(
      read('khoang=hom-nay&tuNgay=2026-10-01&denNgay=2026-10-02'),
    ).toMatchObject({
      preset: 'today',
      from: '',
      to: '',
    });
  });

  it('DAF-12 khoá không thuộc bộ lọc (bacSiId, chiNhanhId, chuyenKhoaId, pageSize, q, lyDoKham) trên URL KHÔNG đi vào bộ lọc và không được ghi lại', () => {
    const filters = read(
      'bacSiId=5&chiNhanhId=3&chuyenKhoaId=1&pageSize=100&q=Lan&lyDoKham=ho&trangThai=DaXacNhan',
    );
    expect(filters).toEqual({ ...EMPTY_FILTERS, status: 'DaXacNhan' });
    expect(writeFilters(filters).toString()).toBe('trangThai=DaXacNhan');
  });

  it('DAF-14 có bộ lọc ngoài ngày (trạng thái, ca, từ khoá) và có gì khác mặc định (kể cả thứ tự, chip, ngày) được phân biệt', () => {
    expect(hasNonDateFilters(EMPTY_FILTERS, '')).toBe(false);
    expect(hasActiveFilters(EMPTY_FILTERS, '')).toBe(false);
    expect(hasNonDateFilters({ ...EMPTY_FILTERS, status: 'DaHuy' }, '')).toBe(
      true,
    );
    expect(hasNonDateFilters({ ...EMPTY_FILTERS, shift: 'CaToi' }, '')).toBe(
      true,
    );
    expect(hasNonDateFilters(EMPTY_FILTERS, 'Lan')).toBe(true);
    // Thứ tự, chip ngày và khoảng ngày không lọc bớt "loại" dòng nhưng đã khác mặc định (hiện `Xóa lọc`)
    for (const patch of [
      { sort: 'CuNhat' },
      { preset: 'today' },
      { from: '2026-10-01' },
      { to: '2026-10-31' },
    ] as const) {
      const filters = { ...EMPTY_FILTERS, ...patch } as DoctorFilters;
      expect(hasNonDateFilters(filters, ''), JSON.stringify(patch)).toBe(false);
      expect(hasActiveFilters(filters, ''), JSON.stringify(patch)).toBe(true);
    }
    // Trang khác 1 không phải bộ lọc
    expect(hasActiveFilters({ ...EMPTY_FILTERS, page: 4 }, '')).toBe(false);
  });
});
