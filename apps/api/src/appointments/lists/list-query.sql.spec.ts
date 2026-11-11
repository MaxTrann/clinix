import {
  addBranchFilter,
  addCommonFilters,
  addKeywordFilter,
  addStateFilter,
  FROM_APPOINTMENTS,
  fromWhere,
  ITEM_COLUMNS,
  ORDER_BY,
  type CommonFilter,
  type SqlClauses,
} from './list-query.sql.js';

// Mảnh SQL dùng chung của các danh sách lịch hẹn (B1, B3, B4, B5; TRACKING 3.17 B3-D): hàm THUẦN, không DB. Ca chạy trên MySQL thật: patient-appointments.int-spec.ts,
// operations-appointments.int-spec.ts. Mã DSV-nn, LSH-nn là PLAN 7.4, 7.7; DSV-16 là [đề xuất] (TRACKING 3.17.3).
const fresh = (): SqlClauses => ({ where: [], params: [] });
const noFilter: CommonFilter = {
  bacSiId: null,
  chuyenKhoaId: null,
  from: null,
  to: null,
};

describe('addBranchFilter: phạm vi chi nhánh (DSV-01, DSV-16)', () => {
  it('DSV-16 chi nhánh cụ thể ⇒ `lh.chi_nhanh_id = ?` với đúng tham số; `undefined` (Toàn hệ thống) ⇒ không thêm điều kiện', () => {
    const scoped = fresh();
    addBranchFilter(scoped, '12');
    expect(scoped).toStrictEqual({
      where: ['lh.chi_nhanh_id = ?'],
      params: ['12'],
    });
    const everywhere = fresh();
    addBranchFilter(everywhere, undefined);
    expect(everywhere).toStrictEqual({ where: [], params: [] });
  });

  it('DSV-01 điều kiện chi nhánh đứng ĐẦU `WHERE` khi gọi trước các bộ lọc khác (cả câu đếm, trang và chi tiết dùng cùng thứ tự)', () => {
    const clauses = fresh();
    addBranchFilter(clauses, '12');
    addStateFilter(clauses, ['DaHuy']);
    expect(fromWhere(clauses).sql).toContain(
      'WHERE lh.chi_nhanh_id = ?\n  AND lh.trang_thai IN (?)',
    );
  });
});

describe('addStateFilter (LSH-06, DSV-12)', () => {
  it('nhiều trạng thái ⇒ một `IN` đủ dấu `?` và tham số theo thứ tự; không dùng `<>`', () => {
    const clauses = fresh();
    addStateFilter(clauses, ['DaXacNhan', 'DaDoiLich', 'DaHuy']);
    expect(clauses).toStrictEqual({
      where: ['lh.trang_thai IN (?, ?, ?)'],
      params: ['DaXacNhan', 'DaDoiLich', 'DaHuy'],
    });
    expect(clauses.where.join()).not.toContain('<>');
  });

  it('LSH-17 ca biên: tập rỗng ⇒ `1 = 0`, không tham số (không dòng nào)', () => {
    const clauses = fresh();
    addStateFilter(clauses, []);
    expect(clauses).toStrictEqual({ where: ['1 = 0'], params: [] });
  });
});

describe('addCommonFilters (DSV-04, DSV-11, DSV-15)', () => {
  it('không lọc gì ⇒ không điều kiện', () => {
    const clauses = fresh();
    addCommonFilters(clauses, noFilter);
    expect(clauses).toStrictEqual({ where: [], params: [] });
  });

  it('thứ tự cố định: bác sĩ, chuyên khoa (qua bac_si HIỆN TẠI), dịch vụ, từ ngày (>=), đến ngày (<, nửa mở); không bọc `thoi_gian` bằng DATE() (AR-05)', () => {
    const clauses = fresh();
    addCommonFilters(clauses, {
      bacSiId: '9',
      chuyenKhoaId: '3',
      dichVuKhamId: '5',
      from: '2026-11-01 00:00:00',
      to: '2026-12-01 00:00:00',
    });
    expect(clauses.where).toStrictEqual([
      'lh.bac_si_id = ?',
      'bs.chuyen_khoa_id = ?',
      'lh.dich_vu_kham_id = ?',
      'lh.thoi_gian >= ?',
      'lh.thoi_gian < ?',
    ]);
    expect(clauses.params).toStrictEqual([
      '9',
      '3',
      '5',
      '2026-11-01 00:00:00',
      '2026-12-01 00:00:00',
    ]);
    expect(clauses.where.join()).not.toMatch(/DATE\s*\(/i);
  });

  it('DSV-15 `dichVuKhamId` thiếu (B1 không có) hoặc `null` ⇒ bỏ qua; từng bộ lọc đứng một mình', () => {
    for (const [filter, sql] of [
      [{ ...noFilter, dichVuKhamId: null }, null],
      [{ ...noFilter, bacSiId: '1' }, 'lh.bac_si_id = ?'],
      [{ ...noFilter, dichVuKhamId: '2' }, 'lh.dich_vu_kham_id = ?'],
      [{ ...noFilter, from: 'a' }, 'lh.thoi_gian >= ?'],
      [{ ...noFilter, to: 'b' }, 'lh.thoi_gian < ?'],
    ] as const) {
      const clauses = fresh();
      addCommonFilters(clauses, filter);
      expect(clauses.where).toStrictEqual(sql === null ? [] : [sql]);
    }
  });
});

describe('addKeywordFilter: ô tìm q (LSH-08, DSV-07)', () => {
  const FOLD = (column: string) =>
    `REPLACE(REPLACE(${column}, 'đ', 'd'), 'Đ', 'D') LIKE ? ESCAPE '!'`;

  it('không có từ khoá ⇒ không điều kiện', () => {
    const clauses = fresh();
    addKeywordFilter(clauses, null, { nameColumns: ['hs.ho_ten'] });
    expect(clauses).toStrictEqual({ where: [], params: [] });
  });

  it('LSH-08 dạng của B1 (một cột tên): ba điều kiện nối OR, ba tham số: mã lịch nguyên văn, hai tên đã gấp `đ`', () => {
    const clauses = fresh();
    addKeywordFilter(clauses, 'đặng', {
      nameColumns: ['COALESCE(hs.ho_ten, tbn.ho_ten)'],
    });
    expect(clauses.where).toStrictEqual([
      `(lh.ma_lich_hen LIKE ? ESCAPE '!' OR ${FOLD('tbs.ho_ten')} OR ${FOLD('COALESCE(hs.ho_ten, tbn.ho_ten)')})`,
    ]);
    expect(clauses.params).toStrictEqual(['%đặng%', '%dặng%', '%dặng%']);
  });

  it('DSV-07 `%`, `_`, `!` là ký tự thường (escape bằng `!`); `đ` và `Đ` chỉ gấp ở phía TÊN, không ở mã lịch', () => {
    const clauses = fresh();
    addKeywordFilter(clauses, 'a%_!đĐ', { nameColumns: ['hs.ho_ten'] });
    expect(clauses.params).toStrictEqual([
      '%a!%!_!!đĐ%',
      '%a!%!_!!dd%',
      '%a!%!_!!dd%',
    ]);
  });

  it('DSV-07 dạng của Lễ tân: hai cột tên (người khám, người đặt) và SĐT người đặt khi `q` toàn chữ số (bỏ dấu cách và chấm)', () => {
    const clauses = fresh();
    addKeywordFilter(clauses, '0987 654.321', {
      nameColumns: ['hs.ho_ten', 'tbn.ho_ten'],
      phoneColumn: 'tbn.so_dien_thoai',
    });
    expect(clauses.where).toStrictEqual([
      `(lh.ma_lich_hen LIKE ? ESCAPE '!' OR ${FOLD('tbs.ho_ten')} OR ${FOLD('hs.ho_ten')} OR ${FOLD('tbn.ho_ten')} OR tbn.so_dien_thoai LIKE ? ESCAPE '!')`,
    ]);
    expect(clauses.params).toStrictEqual([
      '%0987 654.321%',
      '%0987 654.321%',
      '%0987 654.321%',
      '%0987 654.321%',
      '%0987654321%',
    ]);
  });

  it.each([
    ['chữ (không phải số)', 'dang'],
    ['chỉ còn một chữ số sau khi bỏ dấu chấm', '0.'],
    ['lẫn chữ và số', '09a8'],
  ])(
    'DSV-07 ca biên: %s ⇒ không có nhánh SĐT (không khớp gần mọi số)',
    (_name, keyword) => {
      const clauses = fresh();
      addKeywordFilter(clauses, keyword, {
        nameColumns: ['hs.ho_ten'],
        phoneColumn: 'tbn.so_dien_thoai',
      });
      expect(clauses.where[0]).not.toContain('so_dien_thoai');
      expect(clauses.params).toHaveLength(3);
    },
  );

  it('LSH-08 không khai `phoneColumn` (B1) thì từ khoá toàn chữ số cũng KHÔNG tìm SĐT', () => {
    const clauses = fresh();
    addKeywordFilter(clauses, '0987654321', { nameColumns: ['hs.ho_ten'] });
    expect(clauses.where[0]).not.toContain('so_dien_thoai');
    expect(clauses.params).toHaveLength(3);
  });

  it('DSB-13 `doctorName: false` (danh sách của chính Bác sĩ, B5): KHÔNG khớp `tbs.ho_ten`, bỏ đúng một tham số tên; mã lịch, cột tên và SĐT giữ thứ tự', () => {
    const clauses = fresh();
    addKeywordFilter(clauses, '0987 654.321', {
      nameColumns: ['COALESCE(hs.ho_ten, tbn.ho_ten)'],
      phoneColumn:
        'IF(lh.ho_so_nguoi_than_id IS NULL, tbn.so_dien_thoai, hs.so_dien_thoai)',
      doctorName: false,
    });
    expect(clauses.where).toStrictEqual([
      `(lh.ma_lich_hen LIKE ? ESCAPE '!' OR ${FOLD('COALESCE(hs.ho_ten, tbn.ho_ten)')} OR IF(lh.ho_so_nguoi_than_id IS NULL, tbn.so_dien_thoai, hs.so_dien_thoai) LIKE ? ESCAPE '!')`,
    ]);
    expect(clauses.where[0]).not.toContain('tbs.ho_ten');
    expect(clauses.params).toStrictEqual([
      '%0987 654.321%',
      '%0987 654.321%',
      '%0987654321%',
    ]);
  });

  it('DSB-13 mặc định và `doctorName: true` giữ NGUYÊN SQL của B1, B3 (có `tbs.ho_ten`): hai cách gọi cho cùng một kết quả', () => {
    const omitted = fresh();
    addKeywordFilter(omitted, 'dang', { nameColumns: ['hs.ho_ten'] });
    const explicit = fresh();
    addKeywordFilter(explicit, 'dang', {
      nameColumns: ['hs.ho_ten'],
      doctorName: true,
    });
    expect(explicit).toStrictEqual(omitted);
    expect(omitted.where[0]).toContain('tbs.ho_ten');
  });
});

describe('fromWhere, ORDER_BY, cột (DSV-06, DSV-08)', () => {
  it('`FROM … WHERE …` nối điều kiện bằng AND theo thứ tự thêm vào, giữ nguyên tham số', () => {
    const clauses = fresh();
    addBranchFilter(clauses, '1');
    addStateFilter(clauses, ['DaHuy']);
    expect(fromWhere(clauses)).toStrictEqual({
      sql: `${FROM_APPOINTMENTS}\nWHERE lh.chi_nhanh_id = ?\n  AND lh.trang_thai IN (?)`,
      params: ['1', 'DaHuy'],
    });
  });

  it('DSB-03 `joins` chèn giữa `FROM` và `WHERE` (B5 lấy `ca`); không truyền hoặc rỗng ⇒ y hệt cách gọi cũ của B1, B3', () => {
    const clauses = fresh();
    addStateFilter(clauses, ['DaHuy']);
    const join = 'INNER JOIN khung_gio kg ON kg.khung_gio_id = lh.khung_gio_id';
    expect(fromWhere(clauses, join)).toStrictEqual({
      sql: `${FROM_APPOINTMENTS}\n${join}\nWHERE lh.trang_thai IN (?)`,
      params: ['DaHuy'],
    });
    expect(fromWhere(clauses, '')).toStrictEqual(fromWhere(clauses));
  });

  it('DSV-06 sắp xếp ổn định: `thoi_gian` rồi `lich_hen_id` CÙNG chiều', () => {
    expect(ORDER_BY.ASC).toBe('ORDER BY lh.thoi_gian ASC, lh.lich_hen_id ASC');
    expect(ORDER_BY.DESC).toBe(
      'ORDER BY lh.thoi_gian DESC, lh.lich_hen_id DESC',
    );
  });

  it('DSV-08 danh sách trắng cột: SELECT của một dòng không có email, ngày sinh, địa chỉ, băm, `lich_hen_id`, `benh_nhan_id`; không `SELECT *`', () => {
    expect(ITEM_COLUMNS).not.toMatch(
      /lich_hen_id|benh_nhan_id|khung_gio|email|ngay_sinh|dia_chi|mat_khau|so_dien_thoai|\*/,
    );
    expect(ITEM_COLUMNS).toContain('AS maLichHen');
  });
});
