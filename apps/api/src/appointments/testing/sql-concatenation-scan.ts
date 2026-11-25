// Quét NGUỒN tìm câu SQL NỐI CHUỖI GIÁ TRỊ (reschedule B6, BDL-05; PLAN reschedule 7.10): mọi giá trị đi vào SQL phải qua tham số `?`, không nối vào chuỗi. Hàm THUẦN trên chuỗi nguồn (đã bỏ comment bằng
// `stripComments`), cho phép test chứng minh bằng đối chứng ÂM (nguồn giả có nối chuỗi PHẢI bị bắt) trước khi quét mã thật.
//  - Chuỗi mẫu (backtick) trông như SQL (có `SELECT`, `INSERT INTO`, `UPDATE`, `DELETE FROM` viết HOA): mỗi `${…}` chỉ được là HẰNG `UPPER_SNAKE_CASE` (một đoạn SQL cố định dùng lại như `DATE_TIME_FORMAT`),
//    không phải biến hay lời gọi hàm (đó mới là giá trị).
//  - Chuỗi nháy đơn hay kép trông như SQL mà có toán tử `+` ngay trước hoặc sau: nối chuỗi.

const SQL_KEYWORD = /\b(?:SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\b/;
const TEMPLATE_LITERAL = /`(?:\\[\s\S]|[^`\\])*`/g;
const INTERPOLATION = /\$\{([^}]*)\}/g;
const QUOTED_LITERAL = /(['"])(?:\\[\s\S]|(?!\1)[^\\\n])*\1/g;
const CONSTANT_NAME = /^[A-Z][A-Z0-9_]*$/;

const snippet = (text: string): string =>
  text.replace(/\s+/g, ' ').trim().slice(0, 80);

/** Mô tả từng chỗ nối chuỗi SQL trong `source` (đã bỏ comment); mảng rỗng là sạch. */
export function findSqlConcatenation(source: string): string[] {
  const found: string[] = [];

  for (const match of source.matchAll(TEMPLATE_LITERAL)) {
    const literal = match[0];
    if (!SQL_KEYWORD.test(literal)) continue;
    for (const part of literal.matchAll(INTERPOLATION)) {
      const expression = (part[1] ?? '').trim();
      if (!CONSTANT_NAME.test(expression))
        found.push(
          `chuỗi mẫu SQL nội suy "${snippet(expression)}" (chỉ hằng UPPER_SNAKE_CASE được nội suy): ${snippet(literal)}`,
        );
    }
  }

  for (const match of source.matchAll(QUOTED_LITERAL)) {
    const literal = match[0];
    if (!SQL_KEYWORD.test(literal)) continue;
    const start = match.index ?? 0;
    const before = source.slice(0, start).trimEnd();
    const after = source.slice(start + literal.length).trimStart();
    if (before.endsWith('+') || after.startsWith('+'))
      found.push(`chuỗi SQL được nối bằng "+": ${snippet(literal)}`);
  }
  return found;
}
