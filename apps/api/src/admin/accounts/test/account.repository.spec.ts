import {
  ACCOUNT_COLUMNS,
  ACCOUNT_ORDER_BY,
  buildWhere,
} from '../account.repository.js';
import { ACCOUNT_ROW_KEYS } from '../account-view.js';

const everyone = { sql: '1 = 1', parameters: {} };
const branchSeven = {
  sql: '(CHI_NHANH_7)',
  parameters: { accountBranchId: '7' },
};

describe('TKB17-04 (Q42, TK-05, TK-06) — bộ dựng SQL của repository (hàm thuần, không DB)', () => {
  it('sắp xếp CỐ ĐỊNH theo họ tên, rồi khoá phụ tai_khoan_id để phân trang ổn định', () => {
    expect(ACCOUNT_ORDER_BY).toBe('t.ho_ten ASC, t.tai_khoan_id ASC');
  });

  it('SELECT chỉ có đúng các cột của ACCOUNT_ROW_KEYS, cùng thứ tự, không cột nào khác', () => {
    // Alias của cột nằm cuối dòng; ` AS CHAR)` của CAST nằm giữa dòng nên không bị bắt.
    const aliases = [...ACCOUNT_COLUMNS.matchAll(/ AS (\w+),?$/gm)].map(
      (match) => match[1],
    );
    expect(aliases).toEqual([...ACCOUNT_ROW_KEYS]);
  });

  it('SELECT không đụng bất kỳ cột bí mật nào của các bảng liên quan', () => {
    expect(ACCOUNT_COLUMNS).not.toMatch(/mat_khau|ma_bam|refresh|token|otp/i);
    expect(ACCOUNT_COLUMNS).not.toContain('*');
  });

  it('không bộ lọc: chỉ có điều kiện phạm vi', () => {
    expect(buildWhere(everyone, {})).toEqual({
      where: '1 = 1',
      parameters: {},
    });
  });

  it('điều kiện phạm vi luôn đứng đầu và được AND với mọi bộ lọc khác', () => {
    const { where, parameters } = buildWhere(branchSeven, {
      trangThai: 'DangHoatDong',
    });
    expect(where).toBe('(CHI_NHANH_7) AND t.trang_thai = :trangThai');
    expect(parameters).toEqual({
      accountBranchId: '7',
      trangThai: 'DangHoatDong',
    });
  });

  it('vaiTro dùng IN với tham số mảng (không nối chuỗi)', () => {
    const { where, parameters } = buildWhere(everyone, {
      vaiTro: ['BacSi', 'LeTan'],
    });
    expect(where).toBe('1 = 1 AND t.loai_tai_khoan IN (:...vaiTro)');
    expect(parameters.vaiTro).toEqual(['BacSi', 'LeTan']);
  });

  it.each([
    ['true', 1],
    ['false', 0],
  ] as const)(
    'khoaNoShow=%s so sánh BẰNG với cờ của benh_nhan (NULL không khớp cả hai)',
    (value, expected) => {
      const { where, parameters } = buildWhere(everyone, { khoaNoShow: value });
      expect(where).toBe('1 = 1 AND bn.khoa_dat_lich_do_no_show = :khoaNoShow');
      expect(parameters.khoaNoShow).toBe(expected);
    },
  );

  it('q: ba cột trong MỘT cặp ngoặc (nếu không, OR lấn át AND phạm vi), có ESCAPE, giá trị ở tham số', () => {
    const { where, parameters } = buildWhere(branchSeven, { q: 'an' });
    expect(where).toBe(
      "(CHI_NHANH_7) AND (t.ho_ten LIKE :pattern ESCAPE '!' OR t.email LIKE :pattern ESCAPE '!' OR t.so_dien_thoai LIKE :pattern ESCAPE '!')",
    );
    expect(parameters.pattern).toBe('%an%');
    expect(where).not.toContain('an%');
  });

  it.each([
    ['%', '%!%%'],
    ['_', '%!_%'],
    ['!', '%!!%'],
    ['50%_off!', '%50!%!_off!!%'],
    ["a'b--c", "%a'b--c%"],
  ])('q %s được escape thành %s (TK-06)', (q, expected) => {
    expect(buildWhere(everyone, { q }).parameters.pattern).toBe(expected);
  });

  it('q rỗng không thêm điều kiện', () => {
    expect(buildWhere(everyone, { q: '' }).where).toBe('1 = 1');
  });

  it('phối hợp mọi bộ lọc: đủ năm điều kiện, đúng thứ tự', () => {
    const { where } = buildWhere(branchSeven, {
      vaiTro: ['BenhNhan'],
      trangThai: 'NgungHoatDong',
      khoaNoShow: 'true',
      q: 'x',
    });
    expect(where.split(' AND ')).toHaveLength(5);
  });
});
