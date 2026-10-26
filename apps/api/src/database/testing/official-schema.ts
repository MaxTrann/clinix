import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Đọc schema CHÍNH THỨC (docs/database/clinix_mysql.sql) để test so sánh với migration.
export const OFFICIAL_SQL_PATH = fileURLToPath(
  new URL('../../../../../docs/database/clinix_mysql.sql', import.meta.url),
);

/** Cắt file SQL thành từng câu lệnh: bỏ comment `--` đầu dòng, không cắt nhầm dấu `;` nằm trong chuỗi '...' hoặc `...`. */
export function splitSqlStatements(source: string): string[] {
  const text = source.replace(/\r\n/g, '\n');
  const statements: string[] = [];
  let current = '';
  let quote: "'" | '`' | null = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (quote === null) {
      if (
        ch === '-' &&
        text.startsWith('--', i) &&
        (i === 0 || text[i - 1] === '\n')
      ) {
        const end = text.indexOf('\n', i);
        i = end < 0 ? text.length : end;
        continue;
      }
      if (ch === "'" || ch === '`') quote = ch;
      if (ch === ';') {
        if (current.trim()) statements.push(current.trim());
        current = '';
        continue;
      }
    } else if (ch === '\\' && quote === "'") {
      current += ch + (text[i + 1] ?? '');
      i++;
      continue;
    } else if (ch === quote) {
      if (quote === "'" && text[i + 1] === "'") {
        current += "''";
        i++;
        continue;
      }
      quote = null;
    }
    current += ch;
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

/** Bảng mà câu lệnh tác động (CREATE TABLE / CREATE INDEX ... ON / ALTER TABLE), hoặc null nếu không thuộc ba loại đó. */
export function targetTable(statement: string): string | null {
  const match =
    /^CREATE TABLE `(\w+)`/.exec(statement) ??
    /^CREATE (?:UNIQUE )?INDEX `\w+` ON `(\w+)`/.exec(statement) ??
    /^ALTER TABLE `(\w+)`/.exec(statement);
  return match?.[1] ?? null;
}

export function referencedTables(statement: string): string[] {
  return [...statement.matchAll(/REFERENCES `(\w+)`/g)].map(
    (match) => match[1] as string,
  );
}

/** Các câu lệnh DDL của những bảng đã cho, theo đúng thứ tự trong file chính thức. */
export function officialStatementsFor(tables: readonly string[]): string[] {
  const wanted = new Set(tables);
  return splitSqlStatements(readFileSync(OFFICIAL_SQL_PATH, 'utf8')).filter(
    (statement) => {
      const table = targetTable(statement);
      return table !== null && wanted.has(table);
    },
  );
}

/** So sánh văn bản câu lệnh không phụ thuộc kiểu xuống dòng. */
export function normalizeStatement(statement: string): string {
  return statement.replace(/\r\n/g, '\n').trim();
}
