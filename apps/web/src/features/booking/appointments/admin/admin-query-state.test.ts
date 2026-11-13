import { describe, expect, it } from 'vitest';
import {
  EMPTY_FILTERS,
  hasActiveFilters,
  hasNonDateFilters,
  isCalendarDate,
  readFilters,
  writeFilters,
  type AdminFilters,
} from './admin-query-state';

// booking F10: bộ lọc không cá nhân trên URL (hàm thuần). Mã AQL là [đề xuất] (PLAN booking mục 7.41); AQL-17 = đọc, ghi, kiểm lại giá trị từ URL.
const read = (query: string, allowBranch = true) =>
  readFilters(new URLSearchParams(query), allowBranch);

describe('isCalendarDate', () => {
  it('AQL-17 chỉ nhận ngày lịch có thật dạng YYYY-MM-DD (năm nhuận, ngày cuối tháng, không 30/02, không tháng 13)', () => {
    for (const ok of ['2026-10-18', '2028-02-29', '2026-12-31', '2026-01-01']) {
      expect(isCalendarDate(ok), ok).toBe(true);
    }
    for (const bad of [
      '',
      '2026-13-45',
      '2026-02-30',
      '2027-02-29',
      '2026-00-10',
      '2026-10-00',
      '26-10-18',
      '2026-1-8',
      '2026-10-18T00:00',
      '0000-01-01',
      ' 2026-10-18',
    ]) {
      expect(isCalendarDate(bad), bad).toBe(false);
    }
  });
});

describe('readFilters', () => {
  it('AQL-17 URL trống ⇒ mặc định (không lọc, trang 1)', () => {
    expect(read('')).toEqual(EMPTY_FILTERS);
  });

  it('AQL-17 đọc đủ các khoá hợp lệ; id lớn hơn 2^53 giữ NGUYÊN chuỗi', () => {
    expect(
      read(
        'trangThai=DaHuy&chiNhanhId=3&chuyenKhoaId=2&bacSiId=9007199254740993&dichVuKhamId=31&tuNgay=2026-10-01&denNgay=2026-10-31&page=7',
      ),
    ).toEqual({
      status: 'DaHuy',
      branch: '3',
      specialty: '2',
      doctor: '9007199254740993',
      service: '31',
      from: '2026-10-01',
      to: '2026-10-31',
      page: 7,
    });
  });

  it('AQL-16 Chi nhánh: `chiNhanhId` trên URL bị BỎ (không bao giờ thành bộ lọc), các khoá khác vẫn đọc', () => {
    expect(read('chiNhanhId=9&trangThai=DaXacNhan', false)).toEqual({
      ...EMPTY_FILTERS,
      status: 'DaXacNhan',
    });
  });

  it('AQL-17 giá trị sai hay lạ bị bỏ như không có: trạng thái không có nhãn (kể cả `DaDoiLich`), id không phải số dương hoặc có số 0 đứng đầu, ngày sai, trang ngoài 1 đến 99999', () => {
    expect(
      read(
        'trangThai=DaDoiLich&chuyenKhoaId=0&bacSiId=1e3&dichVuKhamId=007&chiNhanhId=-1&tuNgay=2026-13-45&denNgay=abc&page=0',
      ),
    ).toEqual(EMPTY_FILTERS);
    expect(read('page=-1').page).toBe(1);
    expect(read('page=100000').page).toBe(1);
    expect(read('page=99999').page).toBe(99999);
    expect(read('page=2.5').page).toBe(1);
    expect(read('trangThai=').status).toBeNull();
  });

  it('AQL-17 `Đến ngày` trước `Từ ngày` trên URL ⇒ bỏ CẢ HAI (không có khoảng hợp lệ); đầu trống thì giữ đầu kia', () => {
    expect(read('tuNgay=2026-10-20&denNgay=2026-10-10')).toMatchObject({
      from: '',
      to: '',
    });
    expect(read('tuNgay=2026-10-20')).toMatchObject({
      from: '2026-10-20',
      to: '',
    });
    expect(read('denNgay=2026-10-10')).toMatchObject({
      from: '',
      to: '2026-10-10',
    });
    expect(read('tuNgay=2026-10-10&denNgay=2026-10-10')).toMatchObject({
      from: '2026-10-10',
      to: '2026-10-10',
    });
  });

  it('AQL-17 khoá lạ (`q`, `pageSize`, `thanhToan`) bị bỏ qua, không ảnh hưởng bộ lọc', () => {
    expect(read('q=0901234567&pageSize=999&thanhToan=DaThu')).toEqual(
      EMPTY_FILTERS,
    );
  });
});

describe('writeFilters', () => {
  it('AQL-17 chỉ ghi khoá KHÁC mặc định, thứ tự cố định, KHÔNG có `q`; trang 1 không ghi', () => {
    expect(writeFilters(EMPTY_FILTERS).toString()).toBe('');
    const filters: AdminFilters = {
      status: 'DaHuy',
      branch: '3',
      specialty: '2',
      doctor: '12',
      service: '31',
      from: '2026-10-01',
      to: '2026-10-31',
      page: 2,
    };
    expect(writeFilters(filters).toString()).toBe(
      'trangThai=DaHuy&chiNhanhId=3&chuyenKhoaId=2&bacSiId=12&dichVuKhamId=31&tuNgay=2026-10-01&denNgay=2026-10-31&page=2',
    );
    expect(writeFilters({ ...EMPTY_FILTERS, page: 1 }).toString()).toBe('');
    expect(writeFilters(filters).has('q')).toBe(false);
  });

  it('AQL-17 ghi rồi đọc lại cho đúng bộ lọc ban đầu (vòng khép kín)', () => {
    const filters: AdminFilters = {
      ...EMPTY_FILTERS,
      status: 'VangMat',
      doctor: '9007199254740993',
      from: '2026-02-28',
      page: 3,
    };
    expect(read(writeFilters(filters).toString())).toEqual(filters);
  });
});

describe('hasNonDateFilters, hasActiveFilters', () => {
  it('AQL-09 phân biệt "chỉ khoảng ngày" với "có bộ lọc khác" và từ khoá; trang không tính là bộ lọc', () => {
    expect(hasNonDateFilters(EMPTY_FILTERS, '')).toBe(false);
    expect(hasActiveFilters(EMPTY_FILTERS, '')).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, page: 4 }, '')).toBe(false);
    const dated = { ...EMPTY_FILTERS, from: '2026-10-01' };
    expect(hasNonDateFilters(dated, '')).toBe(false);
    expect(hasActiveFilters(dated, '')).toBe(true);
    expect(hasNonDateFilters(EMPTY_FILTERS, 'an')).toBe(true);
    for (const patch of [
      { status: 'DaHuy' },
      { branch: '3' },
      { specialty: '2' },
      { doctor: '12' },
      { service: '31' },
    ] as const) {
      expect(hasNonDateFilters({ ...EMPTY_FILTERS, ...patch }, '')).toBe(true);
    }
  });
});
