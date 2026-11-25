// Bộ quét TĨNH mã nguồn cho các ca kiến trúc của đổi lịch (reschedule F1 WDH-10; F3 WDO-14 dùng lại, không chép): cùng một danh sách luật cho trang Bệnh nhân và trang Lễ tân. Chỉ test dùng. Đọc mã bằng
// `import.meta.glob` của Vite với `?raw` ở từng file test (nếp BWZ-08), rồi bỏ chú thích trước khi quét (chú thích có thể nhắc các từ này).
export const strip = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

export type Rule = readonly [name: string, pattern: RegExp];

export const RULES: readonly Rule[] = [
  ['gọi fetch', /(?<![\w.])fetch\s*\(/],
  [
    'XMLHttpRequest hay axios',
    /XMLHttpRequest|\baxios\b|navigator\.sendBeacon/,
  ],
  ['dangerouslySetInnerHTML', /dangerouslySetInnerHTML/],
  ['innerHTML hay outerHTML', /\.(inner|outer)HTML\b/],
  [
    'kho trình duyệt',
    /\b(localStorage|sessionStorage|indexedDB)\b|document\.cookie|caches\./,
  ],
  [
    'đường dẫn viết tay (phải dựng từ booking-paths)',
    /['"`]\/(benh-nhan|dat-lich|le-tan|admin|bac-si-portal)\b/,
  ],
  ['ép id sang số', /\b(Number|parseInt|parseFloat|BigInt)\s*\(/],
  ['ghi ra console (lý do, mã lịch là dữ liệu cá nhân)', /\bconsole\s*\./],
];

export function violations(sources: Record<string, string>): string[] {
  const found: string[] = [];
  for (const [file, source] of Object.entries(sources)) {
    const code = strip(source);
    for (const [name, pattern] of RULES) {
      if (pattern.test(code)) found.push(`${file}: ${name}`);
    }
  }
  return found;
}
