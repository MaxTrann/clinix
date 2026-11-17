import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Trợ giúp cho các test "hợp đồng CSS" (Admin, viền focus toàn hệ thống). Vitest chạy `css: false` nên không có kiểu tính toán, rồi đọc nguồn
// từ đĩa để khoá những khai báo có ý nghĩa; kích thước, màu và điểm ảnh thật đo bằng Chromium.
// Vì sao KHÔNG dùng `import.meta.glob(..., { query: '?raw' })` như `features/booking/architecture.test.ts` và `features/doctor/architecture.test.ts`
// (16/11/2026, vitest 4.1.12): với `css: false`, vitest thay `*.module.css` bằng proxy tên lớp kể cả khi có `?raw`. Đã thử:
// `import.meta.glob(['../**/*.module.css'], { query: '?raw', import: 'default', eager: true })` trả `{}` cho cả 5 file; `import css from
// './x.module.css?raw'` cũng không phải chuỗi ("css.replace is not a function"). Nếp `?raw` chỉ chạy với `.ts`/`.tsx`, nên CSS phải đọc
// bằng `node:fs` (kiểu khai báo ở `node-modules.d.ts` cạnh file này). Danh sách file CSS lấy bằng `Object.keys(import.meta.glob('/src/**/*.css'))`
// (chỉ lấy khoá, không nạp file).

export function readCssSource(
  fromTestFileUrl: string,
  relativePath: string,
): string {
  return readFileSync(
    fileURLToPath(new URL(relativePath, fromTestFileUrl)),
    'utf8',
  );
}

// Gộp khai báo của MỌI khối có `selector` đứng riêng hoặc trong danh sách phân cách bằng dấu phẩy; trả về chuỗi một dòng.
// Lưu ý: tách bộ chọn theo MỌI dấu phẩy nên không dùng được với bộ chọn có dấu phẩy trong ngoặc (`:not(a, b)`): dùng `cssRules`.
export function declarationsOf(css: string, selector: string): string {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const found: string[] = [];
  for (const match of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = (match[1] ?? '').split(',').map((item) => item.trim());
    if (selectors.includes(selector)) {
      found.push((match[2] ?? '').replace(/\s+/g, ' ').trim());
    }
  }
  return found.join(' ');
}

export interface CssRule {
  // Mỗi bộ chọn của khối, đã bỏ khoảng trắng thừa; dấu phẩy trong ngoặc tròn hoặc vuông KHÔNG tách
  selectors: string[];
  // Các khai báo của khối, mỗi khai báo bỏ khoảng trắng thừa và dấu `;`
  declarations: string[];
  // Thứ tự xuất hiện trong nguồn (0, 1, 2, …), để kiểm "khối này đứng SAU khối kia"
  order: number;
}

export function splitSelectors(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of list) {
    if (char === '(' || char === '[') depth += 1;
    if (char === ')' || char === ']') depth -= 1;
    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts.map((part) => part.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

// Các khối `bộ chọn { khai báo }` theo thứ tự nguồn. Bỏ chú thích; khối at-rule có thân lồng (`@layer base { … }`, `@utility x { … }`)
// không tự thành một khối, chỉ các khối bên trong nó được liệt kê. Không xử lý chuỗi có dấu ngoặc nhọn.
export function cssRules(css: string): CssRule[] {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: CssRule[] = [];
  for (const match of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const head = (match[1] ?? '').trim();
    if (head === '' || head.startsWith('@')) continue;
    rules.push({
      selectors: splitSelectors(head),
      declarations: (match[2] ?? '')
        .split(';')
        .map((item) => item.replace(/\s+/g, ' ').trim())
        .filter(Boolean),
      order: rules.length,
    });
  }
  return rules;
}

// Khối có thân lồng bắt đầu bằng `header` (ví dụ `@layer base`, `@utility field-frame`): trả về vị trí và phần thân bên trong, hoặc
// undefined nếu không có. Chỉ tìm lần xuất hiện đầu tiên của `header` (sau khi bỏ chú thích).
export function blockOf(
  css: string,
  header: string,
): { start: number; end: number; inner: string; source: string } | undefined {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const start = source.indexOf(header);
  if (start < 0) return undefined;
  const open = source.indexOf('{', start);
  if (open < 0) return undefined;
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) {
        return {
          start,
          end: index + 1,
          inner: source.slice(open + 1, index),
          source,
        };
      }
    }
  }
  return undefined;
}
