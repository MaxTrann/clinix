import {
  hasActiveFilters,
  normalizeKeyword,
  readListFilters,
  writeListFilters,
} from './article-list-query';

// article F1, ABW-02 (phần URL): bộ lọc và trang nằm ở `?q=&trangThai=&the=&trang=` (PLAN T22). Hàm thuần.
const read = (search: string) => readListFilters(new URLSearchParams(search));

describe('readListFilters (ABW-02)', () => {
  it('ABW-02 không có gì ⇒ mặc định: không lọc, trang 1', () => {
    expect(read('')).toEqual({ q: '', trangThai: null, the: '', trang: 1 });
  });

  it('ABW-02 đọc đủ bốn khoá; thẻ được chuẩn hoá như khi gắn thẻ', () => {
    expect(
      read(
        'q=%20s%E1%BB%91t%20&trangThai=DaXuatBan&the=%23Tr%E1%BA%BB%20Em&trang=3',
      ),
    ).toEqual({ q: 'sốt', trangThai: 'DaXuatBan', the: 'trẻ-em', trang: 3 });
  });

  it.each([
    ['trangThai lạ', 'trangThai=XoaMem', { trangThai: null }],
    ['trangThai rỗng', 'trangThai=', { trangThai: null }],
    ['the sai ký tự', 'the=a!b', { the: '' }],
    ['trang là chữ', 'trang=abc', { trang: 1 }],
    ['trang bằng 0', 'trang=0', { trang: 1 }],
    ['trang âm', 'trang=-2', { trang: 1 }],
    ['trang có số 0 đứng đầu', 'trang=02', { trang: 1 }],
    ['trang thập phân', 'trang=1.5', { trang: 1 }],
    ['trang quá dài', 'trang=1234567', { trang: 1 }],
  ])(
    'ABW-02 giá trị rác (%s) về mặc định, không ném lỗi',
    (_label, search, partial) => {
      expect(read(search)).toMatchObject(partial);
    },
  );

  it('ABW-02 q dài hơn 100 bị cắt về 100; không để lại nửa cặp thay thế (emoji bị cắt giữa)', () => {
    expect(read(`q=${'b'.repeat(130)}`).q).toBe('b'.repeat(100));
    // 99 chữ rồi một emoji (2 đơn vị UTF-16): cắt ở 100 làm mất nửa sau của emoji ⇒ bỏ luôn nửa còn lại
    const cut = normalizeKeyword(`${'a'.repeat(99)}😀`);
    expect(cut).toBe('a'.repeat(99));
  });
});

describe('writeListFilters (ABW-02)', () => {
  it('ABW-02 giá trị mặc định không ghi lên URL', () => {
    expect(
      writeListFilters({
        q: '',
        trangThai: null,
        the: '',
        trang: 1,
      }).toString(),
    ).toBe('');
  });

  it('ABW-02 ghi đủ bốn khoá; đọc lại ra đúng giá trị (đi vòng)', () => {
    const filters = {
      q: 'tim mạch',
      trangThai: 'LuuTruAn' as const,
      the: 'trẻ-em',
      trang: 4,
    };
    expect(readListFilters(writeListFilters(filters))).toEqual(filters);
  });

  it('ABW-02 hasActiveFilters: chỉ trang thì KHÔNG tính là đang lọc', () => {
    expect(hasActiveFilters(read('trang=3'))).toBe(false);
    expect(hasActiveFilters(read('q=a'))).toBe(true);
    expect(hasActiveFilters(read('trangThai=BanNhap'))).toBe(true);
    expect(hasActiveFilters(read('the=a'))).toBe(true);
  });
});
