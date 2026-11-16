import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Trợ giúp cho các test "hợp đồng CSS" của Admin. Vitest chạy `css: false` nên không có kiểu tính toán, rồi đọc nguồn từ đĩa để khoá
// những khai báo có ý nghĩa; kích thước, màu và điểm ảnh thật đo bằng Chromium.
// Vì sao KHÔNG dùng `import.meta.glob(..., { query: '?raw' })` như `features/booking/architecture.test.ts` và
// `features/doctor/architecture.test.ts` (16/11/2026, vitest 4.1.12): với `css: false`, vitest thay `*.module.css` bằng proxy tên lớp
// kể cả khi có `?raw`. Đã thử: `import.meta.glob(['../**/*.module.css'], { query: '?raw', import: 'default', eager: true })` trả `{}`
// cho cả 5 file; `import css from './x.module.css?raw'` cũng không phải chuỗi ("css.replace is not a function"). Nếp `?raw` chỉ chạy
// với `.ts`/`.tsx`, nên CSS Module phải đọc bằng `node:fs` (kiểu khai báo ở `node-modules.d.ts` cạnh file này).

export function readCssSource(
  fromTestFileUrl: string,
  relativePath: string,
): string {
  return readFileSync(
    fileURLToPath(new URL(relativePath, fromTestFileUrl)),
    'utf8',
  );
}

// Gộp khai báo của MỌI khối có `selector` đứng riêng hoặc trong danh sách phân cách bằng dấu phẩy; trả về chuỗi một dòng
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
