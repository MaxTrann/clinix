import {
  EMPTY_VALUES,
  compareIds,
  sortRelatives,
  summarize,
  valuesFromRelative,
} from './relative-rules';
import type { Relative } from './relatives-types';

// patient F6 (TRACKING F6-C, F6-D, F6-H): thứ tự, đếm, giá trị ban đầu của form. Mã ca RW-nn là [đề xuất].
const relative = (
  id: string,
  active = true,
  extra: Partial<Relative> = {},
): Relative => ({
  hoSoNguoiThanId: id,
  hoTen: `Người ${id}`,
  moiQuanHe: 'Con',
  gioiTinh: 'Nam',
  ngaySinh: '2015-07-20',
  soDienThoai: '0909123456',
  trangThaiHieuLuc: active,
  ...extra,
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const ids = (items: Relative[]) => items.map((item) => item.hoSoNguoiThanId);

describe('compareIds: id BIGINT dạng chuỗi, không qua Number', () => {
  it.each([
    ['9', '10', -1],
    ['10', '9', 1],
    ['1', '2', -1],
    ['2', '1', 1],
    ['7', '7', 0],
    ['9007199254740992', '9007199254740993', -1],
    ['9007199254740993', '9007199254740992', 1],
    ['9007199254740993', '9007199254740993', 0],
  ])('RW-04 NT-20 %s so với %s ⇒ dấu %i', (a, b, sign) => {
    expect(Math.sign(compareIds(a, b))).toBe(sign);
  });
});

describe('sortRelatives (Q10)', () => {
  it('RW-05 NT-20 đang sử dụng trước, rồi id tăng dần (so bằng chuỗi); hồ sơ đã ngừng ở cuối', () => {
    const sorted = sortRelatives([
      relative('1', false),
      relative('10'),
      relative('9'),
      relative('5', false),
      relative('9007199254740993'),
      relative('9007199254740992'),
    ]);
    expect(ids(sorted)).toEqual([
      '9',
      '10',
      '9007199254740992',
      '9007199254740993',
      '1',
      '5',
    ]);
  });

  it('RW-06 NT-20 trả mảng mới, không đổi mảng gốc; danh sách rỗng ⇒ rỗng', () => {
    const original = [relative('3', false), relative('2')];
    const sorted = sortRelatives(original);
    expect(ids(original)).toEqual(['3', '2']);
    expect(sorted).not.toBe(original);
    expect(sortRelatives([])).toEqual([]);
  });
});

describe('summarize: "N hồ sơ người thân · M đang sử dụng"', () => {
  it.each([
    ['không có hồ sơ', [], 0, 0],
    ['một hồ sơ đang sử dụng', [relative('1')], 1, 1],
    [
      'nhiều hồ sơ, một đã ngừng',
      [relative('1'), relative('2'), relative('3', false)],
      3,
      2,
    ],
    ['tất cả đã ngừng', [relative('1', false), relative('2', false)], 2, 0],
  ])('RW-07 NT-20 %s', (_label, items, total, active) => {
    expect(summarize(items)).toEqual({ total, active });
  });
});

describe('valuesFromRelative: giá trị ban đầu của form sửa', () => {
  it('RW-08 NT-22 hồ sơ bình thường ⇒ mã giữ nguyên, ngày dd/mm/yyyy, SĐT giữ nguyên', () => {
    expect(
      valuesFromRelative(
        relative('1', true, {
          hoTen: 'Nguyễn Thị Bích',
          moiQuanHe: 'Me',
          gioiTinh: 'Nu',
          ngaySinh: '1960-03-08',
        }),
      ),
    ).toEqual({
      hoTen: 'Nguyễn Thị Bích',
      moiQuanHe: 'Me',
      gioiTinh: 'Nu',
      ngaySinh: '08/03/1960',
      soDienThoai: '0909123456',
    });
  });

  it.each([
    ['1900-01-01', '01/01/1900'],
    ['2024-02-29', '29/02/2024'],
    ['1999-12-31', '31/12/1999'],
  ])(
    'RW-09 NT-22 ngày biên %s ⇒ %s (đổi bằng chuỗi, kể cả ở múi giờ âm)',
    (iso, shown) => {
      vi.stubEnv('TZ', 'America/New_York');
      expect(
        valuesFromRelative(relative('1', true, { ngaySinh: iso })).ngaySinh,
      ).toBe(shown);
    },
  );

  it('RW-10 NT-22 SĐT null ⇒ ô rỗng', () => {
    expect(
      valuesFromRelative(relative('1', true, { soDienThoai: null }))
        .soDienThoai,
    ).toBe('');
  });

  it('RW-11 NT-22 mã quan hệ và giới tính lạ ⇒ chưa chọn (không gửi lại được mã lạ); ngày sai dạng ⇒ rỗng', () => {
    const values = valuesFromRelative(
      relative('1', true, {
        moiQuanHe: 'Mẹ',
        gioiTinh: 'Male',
        ngaySinh: '08/03/1960',
      }),
    );
    expect(values.moiQuanHe).toBe('');
    expect(values.gioiTinh).toBe('');
    expect(values.ngaySinh).toBe('');
  });

  it('RW-12 NT-21 form thêm bắt đầu với năm ô rỗng', () => {
    expect(EMPTY_VALUES).toEqual({
      hoTen: '',
      moiQuanHe: '',
      gioiTinh: '',
      ngaySinh: '',
      soDienThoai: '',
    });
  });
});
