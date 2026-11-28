import indexSource from './index.ts?raw';
import * as article from './index';

// article F1b, ABW-01 và ABN-08: bề mặt công khai của module (PLAN article 5.1) CHỈ có đúng các tên dưới đây, không lộ `testing/`. `router/` và module khác chỉ import từ `index.ts`.
// article F2 (ABG-01, ABG-10): thêm `ARTICLE_PUBLIC_ROUTES` và `HomeHandbookSection`; hai tên của F1 giữ nguyên.
// Tách khỏi `architecture.test.ts` (thuộc F1a) để file kiến trúc giống hệt ở hai PR và không đòi file nào của F1b.
const strip = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

describe('article/index.ts', () => {
  it('ABN-08 chỉ xuất `ARTICLE_ADMIN_ROUTES`, `ARTICLE_LIST_PATH`, `ARTICLE_PUBLIC_ROUTES`, `HomeHandbookSection` (mã nguồn); không nhắc `testing/`', () => {
    const source = strip(indexSource);
    const names = Array.from(
      source.matchAll(/export\s+(?:type\s+)?\{([^}]+)\}/g),
      (match) => match[1]!.split(',').map((name) => name.trim()),
    ).flat();

    expect(names.sort()).toEqual([
      'ARTICLE_ADMIN_ROUTES',
      'ARTICLE_LIST_PATH',
      'ARTICLE_PUBLIC_ROUTES',
      'HomeHandbookSection',
    ]);
    expect(source).not.toContain('testing');
  });

  it('ABW-01 khi chạy: đúng bốn khoá xuất; ARTICLE_LIST_PATH là /cam-nang; ARTICLE_ADMIN_ROUTES là mảng một nhóm route', () => {
    expect(Object.keys(article).sort()).toEqual([
      'ARTICLE_ADMIN_ROUTES',
      'ARTICLE_LIST_PATH',
      'ARTICLE_PUBLIC_ROUTES',
      'HomeHandbookSection',
    ]);
    expect(article.ARTICLE_LIST_PATH).toBe('/cam-nang');
    expect(Array.isArray(article.ARTICLE_ADMIN_ROUTES)).toBe(true);
    expect(article.ARTICLE_ADMIN_ROUTES).toHaveLength(1);
  });

  it('ABG-01 và ABG-10 khi chạy: ARTICLE_PUBLIC_ROUTES là mảng hai route (danh sách, chi tiết); HomeHandbookSection là component', () => {
    expect(Array.isArray(article.ARTICLE_PUBLIC_ROUTES)).toBe(true);
    expect(article.ARTICLE_PUBLIC_ROUTES).toHaveLength(2);
    expect(typeof article.HomeHandbookSection).toBe('function');
  });
});
