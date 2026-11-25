import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  normalizeStatement,
  officialStatementsFor,
} from './testing/official-schema.js';

// MDL-10 (reschedule P1): clinix.dbml không có test nào đọc nó (schema-parity và audit-enum-parity chỉ đọc clinix_mysql.sql), nên bản vẽ ERD có thể lệch file SQL mà không ai biết.
// Test này so TÊN và THỨ TỰ cột của các bảng P1 chạm tới, khối Enum `hanh_dong_nhay_cam_enum` và các UNIQUE của `thong_bao` giữa clinix.dbml và clinix_mysql.sql (cố ý hẹp: không so kiểu,
// ghi chú hay ràng buộc khác; mở rộng sang bảng khác khi có lý do).
const DBML_PATH = fileURLToPath(
  new URL('../../../../docs/database/clinix.dbml', import.meta.url),
);
const dbml = readFileSync(DBML_PATH, 'utf8').replace(/\r\n/g, '\n');

/** Các dòng bên trong khối `Table x {` hoặc `Enum x {` (khối kết thúc ở dòng `}` đầu tiên sau nó). */
function dbmlBlock(source: string, header: string): string[] {
  const lines = source.split('\n');
  const start = lines.indexOf(`${header} {`);
  if (start < 0) throw new Error(`Không thấy khối "${header}" trong dbml`);
  const end = lines.indexOf('}', start);
  return lines.slice(start + 1, end);
}

/** Tên cột của khối Table: dòng thụt 2 ký tự dạng `ten kieu [...]` (bỏ `indexes {`, bỏ dòng thụt sâu hơn và dòng `Note:`). */
function dbmlColumns(source: string, table: string): string[] {
  return dbmlBlock(source, `Table ${table}`).flatMap((line) => {
    const name = /^ {2}(\w+) \S/.exec(line)?.[1];
    return name === undefined || name === 'indexes' ? [] : [name];
  });
}

function dbmlEnumValues(source: string, name: string): string[] {
  return dbmlBlock(source, `Enum ${name}`).flatMap((line) => {
    const value = /^ {2}(\w+)$/.exec(line)?.[1];
    return value === undefined ? [] : [value];
  });
}

/** Các bộ cột UNIQUE khai trong khối `indexes` của Table (dòng dạng `(a, b, c) [unique]`). */
function dbmlUniqueIndexes(source: string, table: string): string[] {
  return dbmlBlock(source, `Table ${table}`).flatMap((line) => {
    const columns = /^ {4}\(([^)]*)\) \[unique\]$/.exec(line)?.[1];
    return columns === undefined ? [] : [columns];
  });
}

const sqlColumns = (table: string): string[] => {
  const create =
    officialStatementsFor([table])
      .map(normalizeStatement)
      .find((sql) => sql.startsWith(`CREATE TABLE \`${table}\` (`)) ?? '';
  return create
    .split('\n')
    .flatMap((line) => /^ {2}`(\w+)`/.exec(line)?.[1] ?? []);
};

const sqlUniqueIndexes = (table: string): string[] =>
  officialStatementsFor([table])
    .map(normalizeStatement)
    .flatMap(
      (sql) =>
        new RegExp(
          `^CREATE UNIQUE INDEX \`\\w+\` ON \`${table}\` \\(([^)]*)\\)$`,
        )
          .exec(sql)?.[1]
          ?.replaceAll('`', '') ?? [],
    );

describe('clinix.dbml khớp clinix_mysql.sql ở các phần reschedule P1 chạm tới', () => {
  it.each([
    'lich_hen',
    'thong_bao',
    'yeu_cau_doi_lich_ngoai_chinh_sach',
    'nhat_ky_hanh_dong',
  ])(
    'MDL-10: bảng %s có cùng tên cột, cùng thứ tự, ở dbml và SQL chính thức',
    (table) => {
      const columns = sqlColumns(table);
      expect(columns.length, table).toBeGreaterThan(5);
      expect(dbmlColumns(dbml, table)).toEqual(columns);
    },
  );

  it('MDL-10: cột mới của P1 có mặt ở dbml, đúng chỗ (so_lan_tu_doi_lich sau lich_hen_truoc_id; yeu_cau_doi_lich_ngoai_chinh_sach_id sau lich_hen_id)', () => {
    const lichHen = dbmlColumns(dbml, 'lich_hen');
    expect(lichHen.indexOf('so_lan_tu_doi_lich')).toBe(
      lichHen.indexOf('lich_hen_truoc_id') + 1,
    );
    const thongBao = dbmlColumns(dbml, 'thong_bao');
    expect(thongBao.indexOf('yeu_cau_doi_lich_ngoai_chinh_sach_id')).toBe(
      thongBao.indexOf('lich_hen_id') + 1,
    );
    expect(dbml).toMatch(
      /^ {2}so_lan_tu_doi_lich int \[not null, default: 0, note: /m,
    );
  });

  it('MDL-10: khối Enum hanh_dong_nhay_cam_enum có đúng 27 giá trị theo thứ tự của ENUM hanh_dong ở SQL, DoiLichHo cuối', () => {
    const create =
      officialStatementsFor(['nhat_ky_hanh_dong'])
        .map(normalizeStatement)
        .find((sql) => sql.startsWith('CREATE TABLE')) ?? '';
    const sqlValues = [
      ...(/`hanh_dong` ENUM \(([^)]*)\)/.exec(create)?.[1] ?? '').matchAll(
        /'([^']+)'/g,
      ),
    ].map((match) => match[1]);
    const dbmlValues = dbmlEnumValues(dbml, 'hanh_dong_nhay_cam_enum');
    expect(dbmlValues).toHaveLength(27);
    expect(dbmlValues).toEqual(sqlValues);
    expect(dbmlValues.at(-1)).toBe('DoiLichHo');
  });

  it('MDL-10: các bộ cột UNIQUE của thong_bao ở dbml trùng các CREATE UNIQUE INDEX ở SQL (kể cả thong_bao_index_yeu_cau_doi_lich)', () => {
    const fromSql = sqlUniqueIndexes('thong_bao');
    expect(fromSql).toContain(
      'yeu_cau_doi_lich_ngoai_chinh_sach_id, tai_khoan_id, loai_su_kien',
    );
    expect([...dbmlUniqueIndexes(dbml, 'thong_bao')].sort()).toEqual(
      [...fromSql].sort(),
    );
  });

  it('MDL-10 (ca âm): bỏ một dòng cột hay một giá trị Enum khỏi dbml thì phép so không còn trùng; tên khối không có thì báo lỗi', () => {
    const lines = dbml.split('\n');
    const withoutColumn = lines
      .filter((line) => !line.startsWith('  so_lan_tu_doi_lich int '))
      .join('\n');
    expect(withoutColumn).not.toBe(dbml);
    expect(dbmlColumns(withoutColumn, 'lich_hen')).not.toEqual(
      sqlColumns('lich_hen'),
    );
    const withoutValue = lines
      .map((line, index) => (line === '  DoiLichHo' && index > 0 ? '' : line))
      .join('\n');
    expect(
      dbmlEnumValues(withoutValue, 'hanh_dong_nhay_cam_enum'),
    ).toHaveLength(26);
    expect(() => dbmlColumns(dbml, 'khong_co_bang_nay')).toThrow(
      /Không thấy khối/,
    );
  });
});

// notification P2 (#657) — MTB-10: chỉ mục thường thong_bao_index_tai_khoan_thoi_diem có ở dbml với đúng tên và đúng bộ cột như câu CREATE INDEX của SQL.
describe('clinix.dbml khớp clinix_mysql.sql ở chỉ mục notification P2', () => {
  const NAME = 'thong_bao_index_tai_khoan_thoi_diem';
  /** Bộ cột của chỉ mục có `name: '<tên>'` trong khối indexes của Table (dòng dạng `(a, b) [name: '...']`). */
  // String.raw giữ nguyên dấu `\` để regex khớp dấu ngoặc thật (template literal thường bỏ `\(` thành `(`)
  const dbmlNamedIndex = (source: string, table: string, name: string) =>
    dbmlBlock(source, `Table ${table}`).flatMap(
      (line) =>
        new RegExp(String.raw`^ {4}\(([^)]*)\) \[name: '${name}'\]$`).exec(
          line,
        )?.[1] ?? [],
    );

  it('MTB-10: cùng tên và cùng ba cột theo thứ tự ở dbml và SQL; ca âm: bỏ dòng khỏi dbml thì không còn thấy', () => {
    const fromSql = officialStatementsFor(['thong_bao'])
      .map(normalizeStatement)
      .flatMap(
        (sql) =>
          new RegExp(
            String.raw`^CREATE INDEX ${'`'}${NAME}${'`'} ON ${'`'}thong_bao${'`'} \(([^)]*)\)$`,
          )
            .exec(sql)?.[1]
            ?.replaceAll('`', '') ?? [],
      );
    expect(fromSql).toEqual(['tai_khoan_id, thoi_diem_tao, thong_bao_id']);
    expect(dbmlNamedIndex(dbml, 'thong_bao', NAME)).toEqual(fromSql);
    const without = dbml
      .split('\n')
      .filter((line) => !line.includes(`[name: '${NAME}']`))
      .join('\n');
    expect(dbmlNamedIndex(without, 'thong_bao', NAME)).toEqual([]);
  });
});
