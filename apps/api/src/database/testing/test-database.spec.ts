import { assertTestDatabaseName, readTestDbSettings } from './test-database.js';
import {
  OFFICIAL_SQL_PATH,
  officialStatementsFor,
  referencedTables,
  splitSqlStatements,
} from './official-schema.js';
import { existsSync } from 'node:fs';

// Task P3 (hạ tầng DB) — không có mã test case riêng trong plan auth.
describe('test-database: chặn lỡ tay trên DB thật', () => {
  it('chỉ chấp nhận tên DB viết thường kết thúc bằng _test', () => {
    expect(() => assertTestDatabaseName('clinix_test')).not.toThrow();
    expect(() => assertTestDatabaseName('clinix_ref_test')).not.toThrow();
    for (const bad of [
      'clinix',
      'clinix_dev',
      'test',
      '_test',
      'Clinix_test',
      'clinix_test; DROP DATABASE x',
      'clinix_test ',
    ]) {
      expect(() => assertTestDatabaseName(bad), bad).toThrow('_test');
    }
  });

  it('readTestDbSettings dùng mặc định cho compose và từ chối TEST_DB_NAME không an toàn', () => {
    const settings = readTestDbSettings({});
    expect(settings).toMatchObject({
      host: '127.0.0.1',
      port: 3306,
      username: 'root',
      database: 'clinix_test',
      timezone: '+07:00',
    });
    expect(() => readTestDbSettings({ TEST_DB_NAME: 'clinix' })).toThrow(
      '_test',
    );
  });
});

describe('official-schema: đọc file SQL chính thức', () => {
  it('cắt câu lệnh không nhầm dấu ; và dấu nháy trong chuỗi, bỏ comment đầu dòng', () => {
    const sql = [
      "-- comment có dấu ; và dấu ' lẻ",
      "CREATE TABLE `a` (`x` int COMMENT 'có ; bên trong và ''nháy kép''', `y` int);",
      'ALTER TABLE `a` ADD FOREIGN KEY (`x`) REFERENCES `b` (`id`);',
    ].join('\r\n');
    const parts = splitSqlStatements(sql);
    expect(parts).toHaveLength(2);
    expect(parts[0]).toContain("có ; bên trong và ''nháy kép''");
    expect(referencedTables(parts[1] as string)).toEqual(['b']);
  });

  it('tìm thấy file SQL và có đủ câu lệnh của 5 bảng auth', () => {
    expect(existsSync(OFFICIAL_SQL_PATH)).toBe(true);
    const statements = officialStatementsFor([
      'tai_khoan',
      'benh_nhan',
      'vi_noi_bo',
      'ma_xac_thuc',
      'phien_dang_nhap',
    ]);
    expect(statements.filter((s) => s.startsWith('CREATE TABLE'))).toHaveLength(
      5,
    );
  });
});
