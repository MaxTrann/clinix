import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildCountSql,
  buildDetailSql,
  buildPageSql,
} from './reschedule-request-list.sql.js';
import type { RescheduleRequestFilter } from './reschedule-request-list.types.js';
import { stripComments } from '../../doctor/testing/architecture-scan.js';

// reschedule B8 — XDL-32 (hình dạng SQL) và BDL-09 (tham số hoá), không DB. Chạy thật trên MySQL: reschedule-request-list.int-spec.ts và phép đo EXPLAIN M3 (TRACKING reschedule 1.12, mục E).
// XDL-32 khoá kết luận của X1 (M3): MỖI trạng thái là MỘT nhánh `=` rồi `UNION ALL` (không `IN`), nhánh lõi không có bảng hiển thị, phạm vi là điều kiện ĐẦU. BDL-09: mọi giá trị là tham số `?`.
const FILTER: RescheduleRequestFilter = {
  states: ['ChoDuyet'],
  chiNhanhId: undefined,
  bacSiId: null,
  maLichHen: null,
};
const withFilter = (
  overrides: Partial<RescheduleRequestFilter>,
): RescheduleRequestFilter => ({ ...FILTER, ...overrides });
// Bộ kiểm cục bộ của file SQL B8 (không phụ thuộc `testing/sql-concatenation-scan.ts` của B6, chưa có trên nhánh này; khi gộp, BDL-05 của B6 quét CẢ `reschedule/`). Cùng luật: chuỗi mẫu có từ khoá SQL
// viết HOA chỉ được nội suy HẰNG `UPPER_SNAKE_CASE`; chuỗi nháy có từ khoá SQL không được nối bằng `+`.
function sqlConcatenations(source: string): string[] {
  const found: string[] = [];
  const keyword = /\b(?:SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\b/;
  for (const [literal] of source.matchAll(/`(?:\\[\s\S]|[^`\\])*`/g)) {
    if (!keyword.test(literal)) continue;
    for (const [, expression] of literal.matchAll(/\$\{([^}]*)\}/g)) {
      const name = (expression ?? '').trim();
      if (!/^[A-Z][A-Z0-9_]*$/.test(name)) found.push(`nội suy ${name}`);
    }
  }
  for (const match of source.matchAll(/(['"])(?:\\[\s\S]|(?!\1)[^\\\n])*\1/g)) {
    if (!keyword.test(match[0])) continue;
    const start = match.index ?? 0;
    const before = source.slice(0, start).trimEnd();
    const after = source.slice(start + match[0].length).trimStart();
    if (before.endsWith('+') || after.startsWith('+'))
      found.push(`nối ${match[0]}`);
  }
  return found;
}

const placeholders = (sql: string) => (sql.match(/\?/g) ?? []).length;
const branchesOf = (sql: string) =>
  [...sql.matchAll(/yc\.trang_thai = \?/g)].length;

describe('XDL-32 hình dạng câu trang', () => {
  it.each([
    [['ChoDuyet'] as const, 1],
    [['DaDuyet', 'TuChoi'] as const, 2],
    [['ChoDuyet', 'DaDuyet', 'TuChoi'] as const, 3],
  ])(
    'tập %j ⇒ %i nhánh `=` nối bằng UNION ALL (ít hơn nhánh một chữ), KHÔNG `IN`',
    (states, count) => {
      const { sql } = buildPageSql(withFilter({ states }), 'DESC', 20, 0);
      expect(branchesOf(sql)).toBe(count);
      expect(sql.match(/UNION ALL/g) ?? []).toHaveLength(count - 1);
      expect(sql).not.toMatch(/\bIN\s*\(/i);
      expect(sql).not.toMatch(/trang_thai\s+IN/i);
    },
  );

  it('thứ tự nhánh là thứ tự của `states`, tham số trạng thái đi đúng thứ tự đó', () => {
    const { params } = buildPageSql(
      withFilter({ states: ['DaDuyet', 'TuChoi'] }),
      'DESC',
      20,
      0,
    );
    expect(params).toStrictEqual(['DaDuyet', 20, 'TuChoi', 20, 20, 0]);
  });

  it('chiều sắp xếp lấy từ hằng: ASC ở cả nhánh lõi, câu ngoài và câu hiển thị; DESC tương tự', () => {
    const asc = buildPageSql(FILTER, 'ASC', 20, 0).sql;
    const desc = buildPageSql(FILTER, 'DESC', 20, 0).sql;
    expect(asc).toContain(
      'ORDER BY yc.thoi_diem_tao ASC, yc.yeu_cau_doi_lich_ngoai_chinh_sach_id ASC',
    );
    expect(asc).toContain('ORDER BY tao ASC, id ASC');
    expect(asc).toContain('ORDER BY page.tao ASC, page.id ASC');
    expect(asc).not.toMatch(/\bDESC\b/);
    expect(desc).toContain(
      'ORDER BY yc.thoi_diem_tao DESC, yc.yeu_cau_doi_lich_ngoai_chinh_sach_id DESC',
    );
    expect(desc).toContain('ORDER BY tao DESC, id DESC');
    expect(desc).toContain('ORDER BY page.tao DESC, page.id DESC');
    expect(desc).not.toMatch(/\bASC\b/);
  });

  it('hoà `thoi_diem_tao` xếp theo id CÙNG chiều ở mọi tầng sắp xếp (khoá hoà không bị bỏ)', () => {
    const { sql } = buildPageSql(
      withFilter({ states: ['DaDuyet', 'TuChoi'] }),
      'DESC',
      20,
      0,
    );
    expect(sql.match(/tao DESC, (?:page\.)?id DESC/g)).toHaveLength(2);
    expect(
      sql.match(
        /yc\.thoi_diem_tao DESC, yc\.yeu_cau_doi_lich_ngoai_chinh_sach_id DESC/g,
      ),
    ).toHaveLength(2);
  });

  it('LIMIT của MỖI nhánh là offset + pageSize; câu ngoài là pageSize và offset (trang 2 chéo hai trạng thái không sót hàng)', () => {
    const { params } = buildPageSql(
      withFilter({ states: ['DaDuyet', 'TuChoi'] }),
      'DESC',
      20,
      20,
    );
    // [DaDuyet, 40, TuChoi, 40, 20, 20]
    expect(params).toStrictEqual(['DaDuyet', 40, 'TuChoi', 40, 20, 20]);
  });

  it('điều kiện phạm vi (chi nhánh) ĐỨNG ĐẦU của MỖI nhánh, rồi trạng thái, bác sĩ, mã lịch; tham số cùng thứ tự', () => {
    const { sql, params } = buildPageSql(
      withFilter({
        states: ['DaDuyet', 'TuChoi'],
        chiNhanhId: '7',
        bacSiId: '31',
        maLichHen: 'CLX-20261110-ABCDE',
      }),
      'DESC',
      10,
      0,
    );
    const wheres = [...sql.matchAll(/WHERE ([^)]*?)\n[^\n]*ORDER BY/gs)];
    expect(wheres).toHaveLength(2);
    for (const [, where] of wheres)
      expect(where?.split('\n').map((line) => line.trim())).toStrictEqual([
        'lh.chi_nhanh_id = ?',
        'AND yc.trang_thai = ?',
        'AND lh.bac_si_id = ?',
        'AND lh.ma_lich_hen = ?',
      ]);
    expect(params).toStrictEqual([
      '7',
      'DaDuyet',
      '31',
      'CLX-20261110-ABCDE',
      10,
      '7',
      'TuChoi',
      '31',
      'CLX-20261110-ABCDE',
      10,
      10,
      0,
    ]);
  });

  it('Toàn hệ thống không lọc chi nhánh: không có `lh.chi_nhanh_id` ở nhánh nào', () => {
    const { sql } = buildPageSql(FILTER, 'ASC', 20, 0);
    expect(sql).not.toContain('lh.chi_nhanh_id = ?');
  });

  it('nhánh lõi CHỈ có yeu_cau ⋈ lich_hen; bảng hiển thị chỉ nối SAU bảng dẫn xuất (nguyên nhân S5, S6 của X1)', () => {
    const { sql } = buildPageSql(
      withFilter({ states: ['DaDuyet', 'TuChoi'] }),
      'DESC',
      20,
      0,
    );
    const split = sql.indexOf(') page');
    expect(split).toBeGreaterThan(0);
    const inner = sql.slice(0, split);
    const outer = sql.slice(split);
    for (const table of [
      'chi_nhanh cn',
      'tai_khoan tbs',
      'tai_khoan tbn',
      'khung_gio kg',
      'ho_so_nguoi_than hs',
    ]) {
      // `inner` còn chứa danh sách cột `SELECT` đầu câu nhưng KHÔNG chứa mệnh đề JOIN của bảng hiển thị
      expect(inner).not.toContain(`JOIN ${table}`);
      expect(outer).toContain(`JOIN ${table}`);
    }
    expect(inner.match(/JOIN lich_hen lh/g)).toHaveLength(2);
  });

  it('số dấu ? bằng số tham số ở mọi hình dạng', () => {
    for (const states of [
      ['ChoDuyet'],
      ['DaDuyet', 'TuChoi'],
      ['ChoDuyet', 'DaDuyet', 'TuChoi'],
    ] as const)
      for (const extra of [
        {},
        { chiNhanhId: '3' },
        { chiNhanhId: '3', bacSiId: '4', maLichHen: 'CLX-20261110-ABCDE' },
      ]) {
        const page = buildPageSql(
          withFilter({ states, ...extra }),
          'DESC',
          5,
          10,
        );
        expect(placeholders(page.sql)).toBe(page.params.length);
        const count = buildCountSql(withFilter({ states, ...extra }));
        expect(placeholders(count.sql)).toBe(count.params.length);
      }
  });

  it('chỉ cột của danh sách trắng: không SĐT, email, ly_do_kham, giá, cọc, id lịch hay id bệnh nhân', () => {
    const { sql } = buildPageSql(FILTER, 'ASC', 20, 0);
    expect(sql).not.toMatch(
      /so_dien_thoai|email|ly_do_kham|gia_snapshot|tien_coc|ly_do_yeu_cau|ghi_chu_xu_ly|nguoi_xu_ly/i,
    );
    expect(sql).not.toMatch(/AS lichHenId|AS benhNhanId|AS khungGioId/);
    expect(sql).not.toMatch(/SELECT\s+\*|\.\*/);
  });

  it('không NOW() và không DATE(…) quanh cột giờ (AR-04, AR-05)', () => {
    for (const sql of [
      buildPageSql(FILTER, 'ASC', 20, 0).sql,
      buildCountSql(FILTER).sql,
      buildDetailSql('1', '2').sql,
    ]) {
      expect(sql).not.toMatch(/\bNOW\s*\(|\bCURDATE\s*\(/i);
      expect(sql).not.toMatch(/\bDATE\s*\(/i);
      expect(sql).not.toMatch(/FOR\s+(?:UPDATE|SHARE)|LOCK\s+IN\s+SHARE/i);
    }
  });

  it('ca âm: không trạng thái nào, trang ngoài biên ⇒ RangeError (không câu SQL rỗng hay OFFSET khổng lồ)', () => {
    const none = withFilter({ states: [] });
    expect(() => buildPageSql(none, 'ASC', 20, 0)).toThrow(RangeError);
    expect(() => buildCountSql(none)).toThrow(RangeError);
    expect(() => buildPageSql(FILTER, 'ASC', 0, 0)).toThrow(RangeError);
    expect(() => buildPageSql(FILTER, 'ASC', 20, -1)).toThrow(RangeError);
    expect(() =>
      buildPageSql(FILTER, 'ASC', 20, Number.MAX_SAFE_INTEGER),
    ).toThrow(RangeError);
  });
});

describe('XDL-32 câu đếm', () => {
  it('một nhánh COUNT(*) mỗi trạng thái, cùng điều kiện với câu trang, không ORDER BY và không LIMIT', () => {
    const filter = withFilter({
      states: ['DaDuyet', 'TuChoi'],
      chiNhanhId: '7',
      bacSiId: '31',
    });
    const count = buildCountSql(filter);
    expect(count.sql.match(/COUNT\(\*\)/g)).toHaveLength(2);
    expect(count.sql.match(/UNION ALL/g)).toHaveLength(1);
    expect(count.sql).not.toMatch(/ORDER BY|LIMIT|OFFSET/);
    expect(count.sql).not.toMatch(/\bIN\s*\(/i);
    expect(count.params).toStrictEqual([
      '7',
      'DaDuyet',
      '31',
      '7',
      'TuChoi',
      '31',
    ]);
    // Các điều kiện (không kể LIMIT) của câu trang là CÙNG chuỗi tham số với câu đếm
    const page = buildPageSql(filter, 'DESC', 20, 0);
    expect(
      page.params.filter((param) => typeof param === 'string'),
    ).toStrictEqual(count.params);
  });
});

describe('XDL-32 câu chi tiết', () => {
  it('theo khoá chính; có chi nhánh thì điều kiện chi nhánh đứng ĐẦU và nằm trong SQL', () => {
    const scoped = buildDetailSql('7', '123456789012345678');
    expect(scoped.params).toStrictEqual(['7', '123456789012345678']);
    expect(scoped.sql.indexOf('lh.chi_nhanh_id = ?')).toBeLessThan(
      scoped.sql.indexOf('yc.yeu_cau_doi_lich_ngoai_chinh_sach_id = ?'),
    );
    const open = buildDetailSql(undefined, '5');
    expect(open.params).toStrictEqual(['5']);
    expect(open.sql).not.toContain('lh.chi_nhanh_id = ?');
  });

  it('có người xử lý bằng LEFT JOIN (yêu cầu chờ chưa có người xử lý) và đủ cột cho chi tiết', () => {
    const { sql } = buildDetailSql('1', '2');
    expect(sql).toContain('LEFT JOIN tai_khoan tnx');
    for (const alias of [
      'AS lichHenId',
      'AS khungGioMongMuonId',
      'AS khungGioTrangThai',
      'AS khungGioGiuChoDen',
      'AS lyDoYeuCau',
      'AS trangThaiLichGoc',
      'AS ghiChuXuLy',
      'AS thoiDiemXuLy',
      'AS nguoiXuLyHoTen',
    ])
      expect(sql).toContain(alias);
  });
});

describe('XDL-40 id lớn hơn 2^53 đi vào SQL nguyên chuỗi', () => {
  // 9007199254740993 không biểu diễn được bằng Number (ép số ra …992): chỉ cần một chỗ ép số là trỏ nhầm hàng
  const BIG = '9007199254740993';

  it('chiNhanhId, bacSiId và yeuCauId là CHUỖI trong tham số của câu trang, câu đếm và câu chi tiết', () => {
    const filter = withFilter({ chiNhanhId: BIG, bacSiId: BIG });
    for (const { params } of [
      buildPageSql(filter, 'ASC', 20, 0),
      buildCountSql(filter),
    ]) {
      const ids = params.filter((param) => String(param).length === BIG.length);
      expect(ids).toStrictEqual([BIG, BIG]);
      expect(ids.every((id) => typeof id === 'string')).toBe(true);
    }
    expect(buildDetailSql(BIG, BIG).params).toStrictEqual([BIG, BIG]);
  });
});

describe('BDL-09 SQL tham số hoá', () => {
  const ATTACK = "'; DROP TABLE lich_hen; --";

  it('chuỗi tấn công và ký tự LIKE chỉ đi qua tham số, không bao giờ vào câu SQL', () => {
    const filter = withFilter({
      states: ['DaDuyet', 'TuChoi'],
      chiNhanhId: ATTACK,
      bacSiId: '1 OR 1=1',
      maLichHen: '%_!',
    });
    const built = [
      buildPageSql(filter, 'DESC', 20, 0),
      buildCountSql(filter),
      buildDetailSql(ATTACK, '1 OR 1=1'),
    ];
    for (const { sql, params } of built) {
      expect(sql).not.toContain('DROP');
      expect(sql).not.toContain('1=1');
      expect(sql).not.toContain('%_!');
      expect(params.some((param) => String(param).includes('DROP'))).toBe(true);
    }
  });

  it('mã nguồn của file SQL: không nội suy biến vào chuỗi SQL, không nối bằng + (cùng luật BDL-05 của reschedule B6; bộ quét thật của B6 quét cả thư mục khi gộp)', () => {
    const source = readFileSync(
      join(import.meta.dirname, 'reschedule-request-list.sql.ts'),
      'utf8',
    );
    expect(sqlConcatenations(stripComments(source))).toEqual([]);
  });

  it('đối chứng ÂM: bộ quét bắt một biến thể có nội suy giá trị và nối chuỗi (quét không "xanh vì không thấy gì")', () => {
    expect(
      sqlConcatenations(
        'const sql = `SELECT 1 FROM yc WHERE lh.chi_nhanh_id = ${chiNhanhId}`;',
      ),
    ).not.toEqual([]);
    expect(
      sqlConcatenations("const sql = 'SELECT 1 WHERE a = ' + value;"),
    ).not.toEqual([]);
  });

  it('file SQL chỉ nhập KIỂU (script đo EXPLAIN ngoài repo nạp file này bằng transpileModule)', () => {
    const source = readFileSync(
      join(import.meta.dirname, 'reschedule-request-list.sql.ts'),
      'utf8',
    );
    const imports = [
      ...stripComments(source).matchAll(/^import\s+(.+?)\s+from/gm),
    ];
    expect(imports.length).toBeGreaterThan(0);
    for (const [, spec] of imports) expect(spec).toMatch(/^type\s/);
  });
});
